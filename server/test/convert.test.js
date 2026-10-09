/* Sol-side audio conversion for films: a real AC-3 MKV through Beacon, from the middle. Skipped without ffmpeg. */
'use strict';

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../src/app.js';
import { jellyfinClient } from '../src/jellyfin.js';
import { openStore } from '../src/store.js';

const hasFfmpeg = spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' }).status === 0;
const skip = !hasFfmpeg && 'ffmpeg not installed';
let film, jf, fake, app, base, dataDir, cookie, friendCookie;

const listen = s => new Promise(r => s.listen(0, '127.0.0.1', () => r(s)));
const json = (res, st, v) => { res.writeHead(st, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(v)); };
// Probed from a file: a fragmented MP4 read from a pipe only reports its first fragment.
const probe = buf => {
  const f = join(dataDir, 'out.mp4');
  writeFileSync(f, buf);
  const r = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration:stream=codec_type,codec_name', '-of', 'json', '-i', f], { maxBuffer: 1e8 });
  const j = JSON.parse(r.stdout.toString() || '{}');
  return { duration: Number(j.format?.duration) || 0, codecs: [...new Set((j.streams || []).map(s => `${s.codec_type}:${s.codec_name}`))].sort() };
};

before(async () => {
  if (!hasFfmpeg) return;
  // 30 s of 320x240 H.264 (a keyframe every second) with 5.1 AC-3 audio, in MKV: a typical Dolby release.
  // Written to a file (not a pipe) so it gets its length and seek index, like a real release.
  dataDir = mkdtempSync(join(tmpdir(), 'beacon-conv-'));
  const filmPath = join(dataDir, 'film.mkv');
  spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc=size=320x240:rate=25:duration=30',
    '-f', 'lavfi', '-i', 'sine=frequency=440:duration=30', '-c:v', 'libx264', '-preset', 'ultrafast', '-g', '25',
    '-c:a', 'ac3', '-ac', '6', '-y', filmPath]);
  film = readFileSync(filmPath);
  const users = {
    'u-admin': { Id: 'u-admin', Name: 'cory', pw: 'a', Policy: { IsAdministrator: true } },
    'u-friend': { Id: 'u-friend', Name: 'coworker', pw: 'f', Policy: { IsAdministrator: false } }
  };
  jf = await listen(createServer(async (req, res) => {
    const chunks = []; for await (const c of req) chunks.push(c);
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks)) : {};
    const pub = u => ({ Id: u.Id, Name: u.Name, Policy: u.Policy });
    if (req.url === '/Users/AuthenticateByName') {
      const u = Object.values(users).find(x => x.Name === body.Username && x.pw === body.Pw);
      return u ? json(res, 200, { User: pub(u), AccessToken: 't' }) : json(res, 401, {});
    }
    const m = req.url.match(/^\/Users\/(.+)$/);
    if (m && users[m[1]]) return json(res, 200, pub(users[m[1]]));
    json(res, 204, {});
  }));
  fake = await listen(createServer((req, res) => {
    if (req.url.startsWith('/pm/')) return json(res, 200, { status: 'success', link: `http://127.0.0.1:${fake.address().port}/film.mkv` });
    if (req.url !== '/film.mkv') return json(res, 404, {});
    const m = /bytes=(\d+)-(\d*)/.exec(req.headers.range || '');
    const s = m ? Number(m[1]) : 0, e = m && m[2] ? Number(m[2]) : film.length - 1;
    res.writeHead(m ? 206 : 200, { 'Content-Type': 'video/x-matroska', 'Accept-Ranges': 'bytes', 'Content-Length': e - s + 1, ...(m ? { 'Content-Range': `bytes ${s}-${e}/${film.length}` } : {}) });
    res.end(film.subarray(s, e + 1));
  }));
  const config = {
    webDir: new URL('../../web/', import.meta.url).pathname, appDir: new URL('../../extension/', import.meta.url).pathname,
    sessionSecret: 'c'.repeat(40), sessionDays: 1, cookieSecure: false, trustProxy: false, origins: [],
    premiumizeKey: 'k', iptv: {}, bases: { premiumize: `http://127.0.0.1:${fake.address().port}/pm/` },
    allowPrivateUpstream: true, convertPerUser: 1
  };
  app = createApp({ config, jellyfin: jellyfinClient({ url: `http://127.0.0.1:${jf.address().port}`, apiKey: 'k' }), store: openStore(dataDir), log: {} });
  await listen(app);
  base = `http://127.0.0.1:${app.address().port}`;
  const login = async (username, password) => (await fetch(base + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) })).headers.get('set-cookie').split(';')[0];
  cookie = await login('cory', 'a');
  await fetch(base + '/api/admin/allow', { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: JSON.stringify({ id: 'u-friend', allowed: true }) });
  friendCookie = await login('coworker', 'f');
});

after(() => { app?.close(); jf?.close(); fake?.close(); if (dataDir) rmSync(dataDir, { recursive: true, force: true }); });

const linkFor = async c => (await (await fetch(base + '/api/pm/item/details?id=x', { headers: { Cookie: c } })).json()).link;

test('info reports the length and the audio tracks', { skip }, async () => {
  const link = await linkFor(cookie);
  const info = await (await fetch(base + link + '/info')).json();
  assert.ok(Math.abs(info.duration - 30) < 1, `duration ${info.duration}`);
  assert.equal(info.video, 'h264');
  assert.deepEqual(info.audio.map(a => [a.codec, a.channels]), [['ac3', 6]]);
});

test('the converted stream starts where asked, with H.264 copied and AAC audio', { skip }, async () => {
  const link = await linkFor(cookie);
  const r = await fetch(base + link + '/aac?t=10');
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('content-type'), 'video/mp4');
  const out = probe(Buffer.from(await r.arrayBuffer()));
  assert.deepEqual(out.codecs, ['audio:aac', 'video:h264']);
  assert.ok(Math.abs(out.duration - 20) < 1.5, `got ${out.duration} s, expected about 20`);
});

test('one conversion per person at a time here (convertPerUser: 1); the slot frees when they stop', { skip }, async () => {
  const link = await linkFor(friendCookie);
  const ac = new AbortController();
  const first = await fetch(base + link + '/aac?t=0', { signal: ac.signal });
  assert.equal(first.status, 200);
  const second = await fetch(base + link + '/aac?t=5');
  assert.equal(second.status, 429);
  ac.abort();
  await new Promise(r => setTimeout(r, 300));
  const third = await fetch(base + link + '/aac?t=5');
  assert.equal(third.status, 200);
  await third.arrayBuffer();
});

test('conversion links stop working once the person is removed', { skip }, async () => {
  const link = await linkFor(friendCookie);
  await fetch(base + '/api/admin/allow', { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: JSON.stringify({ id: 'u-friend', allowed: false }) });
  assert.equal((await fetch(base + link + '/aac?t=0')).status, 401);
  assert.equal((await fetch(base + link + '/info')).status, 401);
  assert.equal((await fetch(base + link + '/nope/extra')).status, 401);
});
