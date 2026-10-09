/* Beacon server tests against a fake Jellyfin. Run: npm test (from server/). */
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

const API_KEY = 'test-api-key';
const USERS = {
  'u-admin': { Id: 'u-admin', Name: 'cory', pw: 'admin-pw', Policy: { IsAdministrator: true, IsDisabled: false } },
  'u-friend': { Id: 'u-friend', Name: 'coworker', pw: 'friend-pw', Policy: { IsAdministrator: false, IsDisabled: false } },
  'u-off': { Id: 'u-off', Name: 'gone', pw: 'off-pw', Policy: { IsAdministrator: false, IsDisabled: true } }
};
const logouts = [];

let fakeJf, app, base, dataDir;

function startFakeJellyfin() {
  return new Promise(resolve => {
    const s = createServer(async (req, res) => {
      const auth = req.headers.authorization || '';
      const chunks = [];
      for await (const c of req) chunks.push(c);
      const body = chunks.length ? JSON.parse(Buffer.concat(chunks)) : {};
      const json = (st, v) => { res.writeHead(st, { 'Content-Type': 'application/json' }); res.end(v === undefined ? '' : JSON.stringify(v)); };
      const pub = u => ({ Id: u.Id, Name: u.Name, Policy: u.Policy });
      if (req.method === 'POST' && req.url === '/Users/AuthenticateByName') {
        const u = Object.values(USERS).find(x => x.Name === body.Username && x.pw === body.Pw);
        return u ? json(200, { User: pub(u), AccessToken: 'tok-' + u.Id }) : json(401);
      }
      if (req.method === 'POST' && req.url === '/Sessions/Logout') { logouts.push(auth); return json(204); }
      if (!auth.includes(`Token="${API_KEY}"`)) return json(401);
      if (req.url === '/Users') return json(200, Object.values(USERS).map(pub));
      const m = req.url.match(/^\/Users\/([^/]+)$/);
      if (m) return USERS[decodeURIComponent(m[1])] ? json(200, pub(USERS[decodeURIComponent(m[1])])) : json(404);
      json(404);
    });
    s.listen(0, '127.0.0.1', () => resolve(s));
  });
}

before(async () => {
  fakeJf = await startFakeJellyfin();
  dataDir = mkdtempSync(join(tmpdir(), 'beacon-test-'));
  const config = {
    webDir: new URL('../../web/', import.meta.url).pathname,
    sessionSecret: 'x'.repeat(40), sessionDays: 30, cookieSecure: false, trustProxy: true, origins: []
  };
  const jellyfin = jellyfinClient({ url: `http://127.0.0.1:${fakeJf.address().port}`, apiKey: API_KEY });
  app = createApp({ config, jellyfin, store: openStore(dataDir), log: {} });
  await new Promise(r => app.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${app.address().port}`;
});

after(() => {
  app.close();
  fakeJf.close();
  rmSync(dataDir, { recursive: true, force: true });
});

let ipCounter = 0;
function freshIp() { return `10.0.0.${++ipCounter}`; }

async function req(path, { body, cookie, headers = {}, ip } = {}) {
  const r = await fetch(base + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(cookie ? { Cookie: cookie } : {}),
      'X-Forwarded-For': ip || '10.9.9.9',
      ...headers
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: 'manual'
  });
  const text = await r.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: r.status, data, headers: r.headers };
}

async function login(username, password, ip = freshIp()) {
  const r = await req('/api/login', { body: { username, password }, ip });
  const set = r.headers.get('set-cookie');
  return { ...r, cookie: set ? set.split(';')[0] : null };
}

test('health needs no login', async () => {
  assert.deepEqual((await req('/api/health')).data, { ok: true });
});

test('wrong password is refused, and an address is locked out after 5 failures', async () => {
  const ip = freshIp();
  for (let i = 0; i < 5; i++) assert.equal((await login('cory', 'nope', ip)).status, 401);
  assert.equal((await login('cory', 'admin-pw', ip)).status, 429);
  assert.equal((await login('cory', 'admin-pw')).status, 200, 'other addresses are not affected');
});

test('admin signs in, gets a hardened cookie, and the Jellyfin session is ended', async () => {
  const before = logouts.length;
  const r = await login('cory', 'admin-pw');
  assert.equal(r.status, 200);
  assert.deepEqual(r.data, { id: 'u-admin', name: 'cory', admin: true });
  const set = r.headers.get('set-cookie');
  assert.match(set, /HttpOnly/);
  assert.match(set, /SameSite=Lax/);
  assert.equal((await req('/api/me', { cookie: r.cookie })).data.admin, true);
  await new Promise(res => setTimeout(res, 50));
  assert.ok(logouts.slice(before).some(a => a.includes('Token="tok-u-admin"')));
});

test('a Jellyfin user not on the allowlist is refused until an admin adds them', async () => {
  assert.equal((await login('coworker', 'friend-pw')).status, 403);
  const admin = await login('cory', 'admin-pw');
  const add = await req('/api/admin/allow', { body: { id: 'u-friend', allowed: true }, cookie: admin.cookie });
  assert.deepEqual(add.data, { id: 'u-friend', allowed: true });
  const friend = await login('coworker', 'friend-pw');
  assert.equal(friend.status, 200);
  assert.equal((await req('/api/me', { cookie: friend.cookie })).data.admin, false);

  // Removing them ends their existing session at once.
  await req('/api/admin/allow', { body: { id: 'u-friend', allowed: false }, cookie: admin.cookie });
  assert.equal((await req('/api/me', { cookie: friend.cookie })).status, 401);
});

test('admin pages are admin-only', async () => {
  const admin = await login('cory', 'admin-pw');
  await req('/api/admin/allow', { body: { id: 'u-friend', allowed: true }, cookie: admin.cookie });
  const friend = await login('coworker', 'friend-pw');
  assert.equal((await req('/api/admin/users', { cookie: friend.cookie })).status, 403);
  assert.equal((await req('/api/admin/users')).status, 401);
  const list = await req('/api/admin/users', { cookie: admin.cookie });
  assert.deepEqual(list.data.map(u => [u.name, u.allowed]), [['cory', true], ['coworker', true], ['gone', false]]);
});

test('disabled Jellyfin users cannot sign in', async () => {
  assert.equal((await login('gone', 'off-pw')).status, 401);
});

test('a tampered or missing cookie is not a session', async () => {
  const admin = await login('cory', 'admin-pw');
  const [name, value] = admin.cookie.split('=');
  const forged = Buffer.from(JSON.stringify({ uid: 'u-admin', name: 'cory', exp: Date.now() + 1e9 })).toString('base64url');
  assert.equal((await req('/api/me', { cookie: `${name}=${forged}.${value.split('.')[1]}` })).status, 401);
  assert.equal((await req('/api/me', { cookie: `${name}=garbage` })).status, 401);
  assert.equal((await req('/api/me')).status, 401);
});

test('cross-site posts and non-JSON posts are refused', async () => {
  const admin = await login('cory', 'admin-pw');
  const evil = await req('/api/admin/allow', { body: { id: 'u-friend', allowed: true }, cookie: admin.cookie, headers: { Origin: 'https://evil.example' } });
  assert.equal(evil.status, 403);
  const form = await fetch(base + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'username=cory&password=admin-pw' });
  assert.equal(form.status, 415);
});

test('static files are served with security headers, and nothing outside web/', async () => {
  const page = await req('/');
  assert.equal(page.status, 200);
  assert.match(page.headers.get('content-security-policy'), /default-src 'self'/);
  assert.equal(page.headers.get('x-frame-options'), 'DENY');
  assert.equal((await req('/app.js')).status, 200);
  assert.equal((await req('/%2e%2e/server/package.json')).status, 404);
  assert.equal((await req('/..%2fserver%2fpackage.json')).status, 404);
  assert.equal((await req('/api/nope')).status, 404);
});
