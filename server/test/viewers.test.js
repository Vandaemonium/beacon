/* The viewer limit: Sol's home upload carries every stream, so only so many people may watch at once. */
'use strict';

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../src/app.js';
import { jellyfinClient } from '../src/jellyfin.js';
import { openStore } from '../src/store.js';
import { monitor } from '../src/monitor.js';

let jf, fake, app, base, dataDir, admin, friend;
const sent = [];
const listen = s => new Promise(r => s.listen(0, '127.0.0.1', () => r(s)));
const json = (res, v, st = 200) => { res.writeHead(st, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(v)); };

before(async () => {
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
      return u ? json(res, { User: pub(u), AccessToken: 't' }) : json(res, {}, 401);
    }
    const m = req.url.match(/^\/Users\/(.+)$/);
    if (m && users[m[1]]) return json(res, pub(users[m[1]]));
    json(res, {}, 204);
  }));
  // A "film" that trickles out slowly, so a stream stays open while the test runs.
  fake = await listen(createServer((req, res) => {
    if (req.url.startsWith('/pm/')) return json(res, { status: 'success', link: `http://127.0.0.1:${fake.address().port}/slow.mp4` });
    res.writeHead(200, { 'Content-Type': 'video/mp4' });
    const t = setInterval(() => res.write(Buffer.alloc(1024)), 50);
    res.on('close', () => clearInterval(t));
  }));
  dataDir = mkdtempSync(join(tmpdir(), 'beacon-view-'));
  const config = {
    webDir: new URL('../../web/', import.meta.url).pathname, appDir: new URL('../../extension/', import.meta.url).pathname,
    sessionSecret: 'v'.repeat(40), sessionDays: 1, cookieSecure: false, trustProxy: false, origins: [],
    premiumizeKey: 'k', iptv: {}, bases: { premiumize: `http://127.0.0.1:${fake.address().port}/pm/` }, allowPrivateUpstream: true,
    maxViewers: 1
  };
  const mon = monitor({ dataDir, post: async b => { sent.push(b); return { ok: true }; } });
  app = createApp({ config, jellyfin: jellyfinClient({ url: `http://127.0.0.1:${jf.address().port}`, apiKey: 'k' }), store: openStore(dataDir), log: {}, monitor: mon });
  await listen(app);
  base = `http://127.0.0.1:${app.address().port}`;
  const login = async (username, password) => (await fetch(base + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) })).headers.get('set-cookie').split(';')[0];
  admin = await login('cory', 'a');
  await fetch(base + '/api/admin/allow', { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: admin }, body: JSON.stringify({ id: 'u-friend', allowed: true }) });
  friend = await login('coworker', 'f');
});

after(() => { app?.close(); jf?.close(); fake?.close(); rmSync(dataDir, { recursive: true, force: true }); });

const linkFor = async c => (await (await fetch(base + '/api/pm/item/details?id=x', { headers: { Cookie: c } })).json()).link;

test('with room for 1, a second person waits; the first can still open more streams (seeks, segments)', async () => {
  const a = new AbortController();
  const first = await fetch(base + await linkFor(admin), { signal: a.signal });
  assert.equal(first.status, 200);
  const again = new AbortController();
  assert.equal((await fetch(base + await linkFor(admin), { signal: again.signal })).status, 200, 'same person, another stream');
  again.abort();
  const blocked = await fetch(base + await linkFor(friend));
  assert.equal(blocked.status, 429);
  assert.match((await blocked.json()).error, /limit of 1 people watching/);
  const cfg = await (await fetch(base + '/api/config', { headers: { Cookie: admin } })).json();
  assert.deepEqual(cfg.viewers, { watching: 1, max: 1 });
  a.abort();
});

test("turning someone away reaches Discord and the admin's activity page; coworkers can't see it", async () => {
  await new Promise(r => setTimeout(r, 50));
  assert.ok(sent.some(s => s.title === '🚦 Beacon is full' && /coworker was turned away/.test(s.text)), JSON.stringify(sent));
  const act = await (await fetch(base + '/api/admin/activity', { headers: { Cookie: admin } })).json();
  assert.equal(act.today.limitHits.viewers, 1);
  assert.ok(act.today.watchers.cory >= 1);
  assert.ok(act.recent.some(e => e.kind === 'limit'));
  assert.equal((await fetch(base + '/api/admin/activity', { headers: { Cookie: friend } })).status, 403);
});
