/* Communal accounts: Premiumize, TorBox, IPTV and stream links, against fake providers. */
'use strict';

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../src/app.js';
import { jellyfinClient } from '../src/jellyfin.js';
import { openStore } from '../src/store.js';
import { assertPublic } from '../src/upstream.js';

const PM_KEY = 'pm-secret-key', TB_KEY = 'tb-secret-key', IPTV_USER = 'iptvuser', IPTV_PASS = 'iptv-pass-123';
const MOVIE = Buffer.from('0123456789'.repeat(100));
let jf, fake, app, base, fakeBase, dataDir;
const seen = { tbForm: null, pmPosts: [] };

function listen(s) { return new Promise(r => s.listen(0, '127.0.0.1', () => r(s))); }
const json = (res, st, v) => { res.writeHead(st, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(v)); };

before(async () => {
  const users = {
    'u-admin': { Id: 'u-admin', Name: 'cory', pw: 'a', Policy: { IsAdministrator: true } },
    'u-friend': { Id: 'u-friend', Name: 'coworker', pw: 'f', Policy: { IsAdministrator: false } },
    'u-two': { Id: 'u-two', Name: 'second', pw: 's', Policy: { IsAdministrator: false } }
  };
  jf = await listen(createServer(async (req, res) => {
    const chunks = []; for await (const c of req) chunks.push(c);
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks)) : {};
    const pub = u => ({ Id: u.Id, Name: u.Name, Policy: u.Policy });
    if (req.url === '/Users/AuthenticateByName') {
      const u = Object.values(users).find(x => x.Name === body.Username && x.pw === body.Pw);
      return u ? json(res, 200, { User: pub(u), AccessToken: 't' }) : json(res, 401, {});
    }
    if (req.url === '/Sessions/Logout') return json(res, 204, {});
    const m = req.url.match(/^\/Users\/(.+)$/);
    if (m && users[m[1]]) return json(res, 200, pub(users[m[1]]));
    if (req.url === '/Users') return json(res, 200, Object.values(users).map(pub));
    json(res, 404, {});
  }));

  fake = await listen(createServer(async (req, res) => {
    const u = new URL(req.url, 'http://x');
    const chunks = []; for await (const c of req) chunks.push(c);
    const raw = Buffer.concat(chunks).toString();
    const media = `http://127.0.0.1:${fake.address().port}/media/movie.mp4`;
    if (u.pathname.startsWith('/pm/')) {
      const key = req.method === 'GET' ? u.searchParams.get('apikey') : new URLSearchParams(raw).get('apikey');
      if (key !== PM_KEY) return json(res, 200, { status: 'error', message: 'bad key' });
      if (req.method === 'POST') seen.pmPosts.push(u.pathname);
      if (u.pathname === '/pm/transfer/directdl') return json(res, 200, { status: 'success', content: [{ path: 'a.mkv', link: media, stream_link: media }] });
      if (u.pathname === '/pm/item/details') return json(res, 200, { status: 'success', id: u.searchParams.get('id'), link: media, stream_link: media + '?s=1' });
      return json(res, 200, { status: 'success', customer_id: 7 });
    }
    if (u.pathname.startsWith('/tb/')) {
      if (req.headers.authorization !== 'Bearer ' + TB_KEY) return json(res, 401, { success: false, detail: 'bad key' });
      if (u.pathname === '/tb/torrents/requestdl') return json(res, 200, { success: u.searchParams.get('token') === TB_KEY, data: media });
      if (u.pathname === '/tb/torrents/createtorrent') { seen.tbForm = raw; return json(res, 200, { success: true, data: { torrent_id: 9 } }); }
      return json(res, 200, { success: true, data: [] });
    }
    if (u.pathname === '/ipinfo') return json(res, 200, { ip: '203.0.113.9', city: 'Chicago', country: 'US', org: 'AS0 Proton AG', extra: 'dropped' });
    if (u.pathname === '/iptv/player_api.php') {
      if (u.searchParams.get('username') !== IPTV_USER || u.searchParams.get('password') !== IPTV_PASS) return json(res, 200, { user_info: { auth: 0 } });
      return json(res, 200, { user_info: { auth: 1, username: IPTV_USER, password: IPTV_PASS, max_connections: '1' }, server_info: { url: 'secret.host' } });
    }
    if (u.pathname === `/iptv/live/${IPTV_USER}/${IPTV_PASS}/123.m3u8`) {
      res.writeHead(200, { 'Content-Type': 'application/vnd.apple.mpegurl' });
      return res.end(`#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI="key.bin"\n#EXTINF:6,\nseg1.ts?token=${IPTV_PASS}\n#EXTINF:6,\nhttp://127.0.0.1:${fake.address().port}/iptv/sub/index.m3u8\n`);
    }
    if (u.pathname === `/iptv/live/${IPTV_USER}/${IPTV_PASS}/seg1.ts`) { res.writeHead(200, { 'Content-Type': 'video/mp2t' }); return res.end('TSDATA'); }
    if (u.pathname === '/media/movie.mp4') {
      const m = /bytes=(\d+)-(\d*)/.exec(req.headers.range || '');
      if (m) {
        const s = Number(m[1]), e = m[2] ? Number(m[2]) : MOVIE.length - 1;
        res.writeHead(206, { 'Content-Type': 'video/mp4', 'Content-Range': `bytes ${s}-${e}/${MOVIE.length}`, 'Content-Length': e - s + 1, 'Accept-Ranges': 'bytes' });
        return res.end(MOVIE.subarray(s, e + 1));
      }
      res.writeHead(200, { 'Content-Type': 'video/mp4', 'Content-Length': MOVIE.length });
      return res.end(MOVIE);
    }
    json(res, 404, {});
  }));
  fakeBase = `http://127.0.0.1:${fake.address().port}`;

  dataDir = mkdtempSync(join(tmpdir(), 'beacon-prov-'));
  const pack = [{ id: 'p', name: 'Test pack', providers: [
    { name: 'Good', enabled: true, supported: true, rules: { base_url: 'https://good.example', fallback_urls: ['https://mirror.example'] } },
    { name: 'Unsupported', enabled: false, supported: false, rules: { base_url: 'https://bad.example' } }] }];
  writeFileSync(join(dataDir, 'shared-defaults.json'), JSON.stringify({ version: 2, local: { 'beacon:express:packages:v1': JSON.stringify(pack), 'beacon:stremio:addons:v1': '[]' } }));
  const config = {
    webDir: new URL('../../web/', import.meta.url).pathname, appDir: new URL('../../extension/', import.meta.url).pathname,
    sessionSecret: 'z'.repeat(40), sessionDays: 30, cookieSecure: false, trustProxy: true, origins: [], traktClientId: null,
    premiumizeKey: PM_KEY, torboxKey: TB_KEY,
    iptv: { server: fakeBase + '/iptv', username: IPTV_USER, password: IPTV_PASS, maxStreams: 1 },
    bases: { premiumize: fakeBase + '/pm/', torbox: fakeBase + '/tb/', ipinfo: fakeBase + '/ipinfo' },
    allowPrivateUpstream: true
  };
  app = createApp({ config, jellyfin: jellyfinClient({ url: `http://127.0.0.1:${jf.address().port}`, apiKey: 'k' }), store: openStore(dataDir), log: {} });
  await listen(app);
  base = `http://127.0.0.1:${app.address().port}`;
});

after(() => { app.close(); jf.close(); fake.close(); rmSync(dataDir, { recursive: true, force: true }); });

let n = 0;
async function req(path, { body, cookie, headers = {}, method } = {}) {
  const r = await fetch(base + path, {
    method: method || (body === undefined ? 'GET' : 'POST'),
    headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(cookie ? { Cookie: cookie } : {}), 'X-Forwarded-For': `10.1.0.${++n}`, ...headers },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const text = await r.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  return { status: r.status, data, text, headers: r.headers };
}
async function login(username, password) {
  const r = await req('/api/login', { body: { username, password } });
  return r.headers.get('set-cookie')?.split(';')[0];
}
const absent = (text, ...secrets) => secrets.forEach(s => assert.ok(!text.includes(s), `response leaked ${s}`));

let admin, friend, two;
test('setup: admin lets two coworkers in', async () => {
  admin = await login('cory', 'a');
  for (const id of ['u-friend', 'u-two']) await req('/api/admin/allow', { body: { id, allowed: true }, cookie: admin });
  friend = await login('coworker', 'f');
  two = await login('second', 's');
  assert.ok(admin && friend && two);
});

test('config says which shared accounts exist, and never includes a key', async () => {
  const r = await req('/api/config', { cookie: friend });
  assert.deepEqual(r.data.providers, { premiumize: true, torbox: true, iptv: true });
  assert.ok(r.data.streamKey);
  absent(r.text, PM_KEY, TB_KEY, IPTV_PASS);
});

test('Premiumize: key added on Sol, media links become Beacon stream links that play with Range', async () => {
  const info = await req('/api/pm/item/details?id=abc', { cookie: friend });
  assert.equal(info.data.status, 'success');
  assert.match(info.data.link, /^\/api\/stream\//);
  assert.match(info.data.stream_link, /^\/api\/stream\//);
  absent(info.text, PM_KEY, fakeBase, '/media/');

  const part = await req(info.data.link, { headers: { Range: 'bytes=10-19' } });
  assert.equal(part.status, 206, 'no cookie needed: this is what VLC does');
  assert.equal(part.text, '0123456789');
  assert.equal(part.headers.get('content-range'), `bytes 10-19/${MOVIE.length}`);

  assert.equal((await req('/api/pm/account/info')).status, 401, 'API calls need the login');
  assert.equal((await req('/api/pm/user/delete', { cookie: friend })).status, 404, 'only the calls Beacon makes');
});

test('Premiumize: deletes on the shared account are admin-only', async () => {
  const del = { body: { params: { id: 't1' } } };
  assert.equal((await req('/api/pm/transfer/delete', { ...del, cookie: friend })).status, 403);
  assert.equal((await req('/api/pm/transfer/delete', { ...del, cookie: admin })).data.status, 'success');
  assert.deepEqual(seen.pmPosts, ['/pm/transfer/delete']);
});

test('TorBox: requestdl link rewritten; adding a magnet works from JSON', async () => {
  const r = await req('/api/tb/torrents/requestdl?torrent_id=1&file_id=2', { cookie: friend });
  assert.match(r.data.data, /^\/api\/stream\//);
  absent(r.text, TB_KEY);
  const add = await req('/api/tb/torrents/createtorrent', { body: { magnet: 'magnet:?xt=urn:btih:abc' }, cookie: friend });
  assert.equal(add.data.data.torrent_id, 9);
  assert.match(seen.tbForm, /magnet:\?xt=urn:btih:abc/);
  assert.equal((await req('/api/tb/torrents/createtorrent', { body: { magnet: 'http://x' }, cookie: friend })).status, 400);
});

test('IPTV: the login never reaches the browser, in the API or in playlists', async () => {
  const api = await req('/api/iptv/player_api', { cookie: friend });
  assert.equal(String(api.data.user_info.auth), '1');
  assert.equal(api.data.server_info, undefined);
  absent(api.text, IPTV_PASS, IPTV_USER);

  const pl = await req('/api/iptv/live/123.m3u8', { cookie: friend });
  assert.equal(pl.status, 200);
  assert.match(pl.text, /^#EXTM3U/);
  absent(pl.text, IPTV_PASS, IPTV_USER, fakeBase);
  const lines = pl.text.split('\n');
  assert.match(lines.find(l => l.startsWith('#EXT-X-KEY')), /URI="\/api\/stream\//);
  const seg = lines.find(l => l.startsWith('/api/stream/'));
  assert.equal((await req(seg)).text, 'TSDATA');
});

test('IPTV: a second viewer waits for a free slot (plan allows 1)', async () => {
  // friend holds the slot from the previous test
  const r = await req('/api/iptv/live/123.m3u8', { cookie: two });
  assert.equal(r.status, 429);
  assert.match(r.data.error, /All 1 Live TV slots/);
  assert.equal((await req('/api/iptv/live/123.m3u8', { cookie: friend })).status, 200, 'the holder keeps watching');
});

test('VLC-style links: Live TV opens with the stream key alone; fakes and revoked users are refused', async () => {
  const { streamKey } = (await req('/api/config', { cookie: friend })).data;
  assert.equal((await req(`/api/iptv/live/123.m3u8?k=${streamKey}`)).status, 200);
  assert.equal((await req('/api/iptv/live/123.m3u8?k=forged')).status, 401);
  const media = (await req('/api/pm/item/details?id=z', { cookie: friend })).data.link;
  assert.equal((await req(`/api/iptv/live/123.m3u8?k=${media.slice(12)}`)).status, 401, 'a stream token is not a stream key');

  await req('/api/admin/allow', { body: { id: 'u-friend', allowed: false }, cookie: admin });
  assert.equal((await req(media)).status, 401, 'removing someone kills their links too');
  assert.equal((await req(`/api/iptv/live/123.m3u8?k=${streamKey}`)).status, 401);
  assert.equal((await req('/api/stream/nonsense')).status, 401);
});

test('outside fetches refuse private and local addresses', async () => {
  for (const u of ['http://127.0.0.1:8096/', 'http://192.168.1.5/', 'http://10.0.0.179/', 'http://[::1]/', 'http://169.254.169.254/']) {
    await assert.rejects(assertPublic(u), { status: 403 }, u);
  }
  await assert.rejects(assertPublic('file:///etc/passwd'), { status: 400 });
  await assert.rejects(assertPublic('http://host.docker.internal:8096/'), { status: 403 });
  await assert.rejects(assertPublic('http://localhost/'), { status: 403 });
});

test('connection check reports the address Sol leaves from', async () => {
  const r = await req('/api/netcheck', { cookie: admin });
  assert.deepEqual(r.data, { ip: '203.0.113.9', city: 'Chicago', country: 'US', org: 'AS0 Proton AG' });
  assert.equal((await req('/api/netcheck')).status, 401);
});

test('shared defaults are served to signed-in users', async () => {
  assert.equal((await req('/api/defaults')).status, 401);
  const d = (await req('/api/defaults', { cookie: admin })).data;
  assert.equal(d.version, 2);
  assert.ok(d.local['beacon:express:packages:v1'].includes('good.example'));
});

test('Express fetches only the shared packages\' supported sites, over https', async () => {
  const f = url => req('/api/express/fetch?url=' + encodeURIComponent(url), { cookie: admin });
  assert.equal((await f('https://bad.example/search?q=x')).status, 403, 'unsupported provider');
  assert.equal((await f('https://evil.example/')).status, 403, 'not in any package');
  assert.equal((await f('http://good.example/')).status, 400, 'https only');
  assert.equal((await f('https://user:pw@good.example/')).status, 400);
  assert.equal((await f(fakeBase + '/media/movie.mp4')).status, 400, 'not a way into local services');
  assert.equal((await req('/api/express/fetch?url=' + encodeURIComponent('https://good.example/'))).status, 401);
});

test('Premiumize: a "browser-friendly" link that is just the original file again is dropped', async () => {
  const r = await req('/api/pm/transfer/directdl', { body: { params: { src: 'magnet:?xt=urn:btih:abc' } }, cookie: admin });
  assert.match(r.data.content[0].link, /^\/api\/stream\//);
  assert.equal(r.data.content[0].stream_link, '');
  const d = await req('/api/pm/item/details?id=keep', { cookie: admin });
  assert.match(d.data.stream_link, /^\/api\/stream\//, 'a real, different copy is kept');
});
