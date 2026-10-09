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
let film, syncFilm, lateFilm, jf, fake, app, base, dataDir, cookie, friendCookie;

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
  // Sync check film: a white flash and a 1 kHz beep on every whole second, keyframes only every 10 s
  // (the hard case: a seek to 17 s can only start the copied video at 10 s).
  const syncPath = join(dataDir, 'sync.mkv');
  spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error',
    '-f', 'lavfi', '-i', "color=c=black:s=320x240:r=25:d=40,drawbox=x=0:y=0:w=iw:h=ih:color=white:t=fill:enable='lt(mod(t,1),0.12)'",
    '-f', 'lavfi', '-i', "sine=f=1000:d=40:sample_rate=48000,volume='if(lt(mod(t,1),0.12),1,0)':eval=frame",
    '-c:v', 'libx264', '-preset', 'ultrafast', '-g', '250', '-keyint_min', '250', '-sc_threshold', '0', '-pix_fmt', 'yuv420p',
    '-c:a', 'ac3', '-ac', '2', '-y', syncPath]);
  syncFilm = readFileSync(syncPath);
  // Like Onslaught (2026, BYNDR): the audio track only begins 5 s into the film. Flash + beep at film 15 s.
  const latePath = join(dataDir, 'late.mkv');
  spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error',
    '-f', 'lavfi', '-i', "color=c=black:s=320x240:r=24000/1001:d=30,drawbox=x=0:y=0:w=iw:h=ih:color=white:t=fill:enable='between(t,15,15.15)'",
    '-itsoffset', '5', '-f', 'lavfi', '-i', "sine=f=1000:d=25:sample_rate=48000,volume='if(between(t,10,10.15),1,0)':eval=frame",
    '-map', '0:v', '-map', '1:a', '-c:v', 'libx264', '-preset', 'ultrafast', '-g', '48', '-pix_fmt', 'yuv420p', '-c:a', 'eac3', '-ac', '6', '-y', latePath]);
  lateFilm = readFileSync(latePath);
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
    if (req.url.startsWith('/pm/')) {
      const q = new URL(req.url, 'http://x').searchParams.get('id');
      const id = q === 'sync' || q === 'late' ? q : 'film';
      return json(res, 200, { status: 'success', link: `http://127.0.0.1:${fake.address().port}/${id}.mkv` });
    }
    const body = { '/film.mkv': film, '/sync.mkv': syncFilm, '/late.mkv': lateFilm }[req.url] || null;
    if (!body) return json(res, 404, {});
    const m = /bytes=(\d+)-(\d*)/.exec(req.headers.range || '');
    const s = m ? Number(m[1]) : 0, e = m && m[2] ? Number(m[2]) : body.length - 1;
    res.writeHead(m ? 206 : 200, { 'Content-Type': 'video/x-matroska', 'Accept-Ranges': 'bytes', 'Content-Length': e - s + 1, ...(m ? { 'Content-Range': `bytes ${s}-${e}/${body.length}` } : {}) });
    res.end(body.subarray(s, e + 1));
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

const linkFor = async (c, id = 'x') => (await (await fetch(base + '/api/pm/item/details?id=' + id, { headers: { Cookie: c } })).json()).link;

// Onset times (s) of the flashes and of the beeps in a converted file.
function onsets(file) {
  const v = spawnSync('ffprobe', ['-v', 'error', '-f', 'lavfi', '-i', `movie=${file},signalstats`, '-show_entries', 'frame=pts_time:frame_tags=lavfi.signalstats.YAVG', '-of', 'csv=p=0'], { maxBuffer: 1e8 })
    .stdout.toString().trim().split('\n').map(l => l.split(',').map(Number));
  const flashes = v.filter(([, y], i) => y > 128 && !(v[i - 1]?.[1] > 128)).map(([t]) => t);
  const a = spawnSync('ffmpeg', ['-hide_banner', '-i', file, '-af', 'silencedetect=noise=-30dB:d=0.05', '-f', 'null', '-'], { maxBuffer: 1e8 }).stderr.toString();
  const beeps = [...a.matchAll(/silence_end: ([\d.]+)/g)].map(m => Number(m[1]));
  return { flashes, beeps };
}

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

test('after a seek between keyframes, picture and sound stay together, and /start says where it begins', { skip }, async () => {
  const link = await linkFor(cookie, 'sync');
  const { start } = await (await fetch(base + link + '/start?t=17')).json();
  assert.ok(Math.abs(start - 10) < 0.2, `start ${start}: the keyframe before 17 s is at 10 s`);
  const r = await fetch(base + link + '/aac?t=17');
  const f = join(dataDir, 'sync-out.mp4');
  writeFileSync(f, Buffer.from(await r.arrayBuffer()));
  // (From 0.5 s: a beep already sounding when the stream starts has no silence before it to detect.)
  const all = onsets(f);
  const flashes = all.flashes.filter(x => x > 0.5), beeps = all.beeps;
  assert.ok(flashes.length >= 5 && beeps.length >= 5, `found ${flashes.length} flashes, ${beeps.length} beeps`);
  for (let i = 0; i < 5; i++) {
    const near = beeps.reduce((b, x) => Math.abs(x - flashes[i]) < Math.abs(b - flashes[i]) ? x : b, Infinity);
    assert.ok(Math.abs(near - flashes[i]) < 0.1, `flash at ${flashes[i]} s, nearest beep at ${near} s`);
  }
  // The player shows start + element time: a flash must land on a whole second of film time.
  for (const x of flashes.slice(0, 5)) assert.ok(Math.abs(((start + x) % 1 + 1) % 1 - 0) < 0.1 || Math.abs((start + x) % 1 - 1) < 0.1, `flash at film time ${start + x}`);
});

test('a release whose audio starts late (like Onslaught) gets silence, not a gap, so the sound stays in place', { skip }, async () => {
  // Browsers play audio packets back to back: a timestamp gap at the start made Onslaught's sound 11 s early.
  const link = await linkFor(cookie, 'late');
  for (const at of [0, 2, 12]) {
    const { start } = await (await fetch(base + link + '/start?t=' + at)).json();
    const f = join(dataDir, `late-${at}.mp4`);
    writeFileSync(f, Buffer.from(await (await fetch(base + link + '/aac?t=' + at)).arrayBuffer()));
    const pts = sel => spawnSync('ffprobe', ['-v', 'error', '-select_streams', sel, '-show_entries', 'packet=pts_time', '-of', 'csv=p=0', f], { maxBuffer: 1e8 })
      .stdout.toString().trim().split('\n').map(Number).filter(Number.isFinite).sort((a, b) => a - b);
    const a = pts('a:0'), v = pts('v:0');
    const gap = Math.max(...a.slice(1).map((x, i) => x - a[i]));
    assert.ok(gap < 0.1, `from ${at}: largest gap between audio packets ${gap.toFixed(2)} s`);
    assert.ok(Math.abs(a[0] - v[0]) < 0.15, `from ${at}: audio starts at ${a[0]}, video at ${v[0]}`);
    assert.ok(Math.abs(start - (at <= 0 ? 0 : start)) < 1e-9 && start <= at + 0.01, `from ${at}: start ${start}`);
  }
});
