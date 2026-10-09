/* Beacon HTTP server: the login, the allowlist, and the web UI's static files.
 * Routes:
 *   GET  /api/health            no login
 *   POST /api/login             { username, password } → session cookie
 *   POST /api/logout
 *   GET  /api/me                → { id, name, admin }
 *   GET  /api/admin/users       Jellyfin users + whether each may use Beacon (admins only)
 *   POST /api/admin/allow       { id, allowed } (admins only)
 *   GET|PUT|DELETE /api/secrets/<key>   the signed-in user's own saved values (Trakt sign-in etc.)
 *   everything else             static files: WEB_DIR (sign-in page, public), then APP_DIR
 *                               (Barr's Beacon Hub UI, signed-in users only)
 * Who may use Beacon: enabled Jellyfin admins, plus users on the allowlist.
 */
'use strict';

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, normalize, extname, sep } from 'node:path';
import { COOKIE, issue, verify, parseCookies, cookieHeader } from './session.js';
import { failureLimiter } from './ratelimit.js';

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8'
};

// connect-src: the UI calls Trakt, Cinemeta and add-ons straight from the browser (they all allow it).
const SECURITY_HEADERS = {
  'Content-Security-Policy': "default-src 'self'; img-src 'self' data: blob: https:; media-src 'self' blob: https:; connect-src 'self' https:; worker-src 'self' blob:; style-src 'self'; font-src 'self'; script-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'same-origin',
  'X-Frame-Options': 'DENY'
};

const USER_TTL_MS = 60e3;
const MAX_BODY = 64 * 1024;
const SECRET_KEY = /^[A-Za-z0-9:._-]{1,64}$/;

const safeDecode = s => { try { return decodeURIComponent(s); } catch { return ''; } };

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export function createApp({ config, jellyfin, store, log = console }) {
  const limiter = failureLimiter();
  const userCache = new Map();

  async function jellyfinUser(uid) {
    const hit = userCache.get(uid);
    if (hit && Date.now() - hit.at < USER_TTL_MS) return hit.user;
    const user = await jellyfin.user(uid);
    userCache.set(uid, { user, at: Date.now() });
    return user;
  }

  function mayUse(user) {
    return !!user && !user.disabled && (user.admin || store.isAllowed(user.id));
  }

  function clientIp(req) {
    if (config.trustProxy) {
      const xff = req.headers['x-forwarded-for'];
      // The right-most entry is the one our own proxy added; anything left of it is client-supplied.
      if (xff) return xff.split(',').at(-1).trim();
    }
    return req.socket.remoteAddress || 'unknown';
  }

  function send(res, status, body, headers = {}) {
    const json = body === undefined ? '' : JSON.stringify(body);
    res.writeHead(status, { ...SECURITY_HEADERS, 'Cache-Control': 'no-store', ...(json ? { 'Content-Type': MIME['.json'] } : {}), ...headers });
    res.end(json);
  }

  async function readBody(req) {
    if (!String(req.headers['content-type'] || '').startsWith('application/json')) throw new HttpError(415, 'Expected JSON');
    let size = 0;
    const chunks = [];
    for await (const c of req) {
      size += c.length;
      if (size > MAX_BODY) throw new HttpError(413, 'Request too large');
      chunks.push(c);
    }
    try { return JSON.parse(Buffer.concat(chunks).toString() || '{}'); } catch { throw new HttpError(400, 'Bad JSON'); }
  }

  // State-changing requests must come from Beacon's own pages (blocks cross-site form posts).
  function checkOrigin(req) {
    const origin = req.headers.origin;
    if (!origin) return;
    let host;
    try { host = new URL(origin).host; } catch { throw new HttpError(403, 'Bad origin'); }
    if (host !== req.headers.host && !config.origins.includes(origin)) throw new HttpError(403, 'Cross-site request refused');
  }

  async function currentUser(req) {
    const s = verify(parseCookies(req.headers.cookie)[COOKIE], { secret: config.sessionSecret });
    if (!s) return null;
    const user = await jellyfinUser(s.uid);
    return mayUse(user) ? user : null;
  }

  async function requireUser(req, { admin = false } = {}) {
    const user = await currentUser(req);
    if (!user) throw new HttpError(401, 'Not signed in');
    if (admin && !user.admin) throw new HttpError(403, 'Admins only');
    return user;
  }

  // /api/secrets/<key>: what the extension kept in chrome.storage.local, now per user on Sol.
  async function secretsRoute(req, key) {
    if (!SECRET_KEY.test(key)) throw new HttpError(400, 'Bad key');
    const me = await requireUser(req);
    if (req.method === 'GET') return { value: store.secret(me.id, key) };
    checkOrigin(req);
    if (req.method === 'PUT') {
      const { value } = await readBody(req);
      if (value === undefined) throw new HttpError(400, 'Need { value }');
      store.setSecret(me.id, key, value);
      return { ok: true };
    }
    if (req.method === 'DELETE') { store.delSecret(me.id, key); return { ok: true }; }
    throw new HttpError(405, 'Method not allowed');
  }

  const routes = {
    'GET /api/health': async () => ({ ok: true }),

    'POST /api/login': async (req, res) => {
      checkOrigin(req);
      const ip = clientIp(req);
      const wait = limiter.blockedFor(ip);
      if (wait) throw new HttpError(429, `Too many attempts. Try again in ${Math.ceil(wait / 60)} min.`);
      const { username, password } = await readBody(req);
      if (typeof username !== 'string' || typeof password !== 'string' || !username || username.length > 128 || password.length > 1024) {
        throw new HttpError(400, 'Username and password are required');
      }
      const user = await jellyfin.authenticate(username, password);
      if (!user) {
        limiter.fail(ip);
        log.info?.(`login failed for "${username}" from ${ip}`);
        throw new HttpError(401, 'Wrong username or password');
      }
      limiter.clear(ip);
      userCache.set(user.id, { user: { ...user, disabled: false }, at: Date.now() });
      if (!mayUse({ ...user, disabled: false })) {
        log.info?.(`login refused for ${user.name}: not on the allowlist`);
        throw new HttpError(403, "Your Jellyfin account works, but it isn't on Beacon's list yet. Ask the admin to add you.");
      }
      log.info?.(`login ok: ${user.name} from ${ip}`);
      const token = issue(user, { secret: config.sessionSecret, days: config.sessionDays });
      res.setHeader('Set-Cookie', cookieHeader(token, { secure: config.cookieSecure, maxAgeSeconds: config.sessionDays * 86400 }));
      return { id: user.id, name: user.name, admin: user.admin };
    },

    'POST /api/logout': async (req, res) => {
      checkOrigin(req);
      res.setHeader('Set-Cookie', cookieHeader('', { secure: config.cookieSecure, maxAgeSeconds: 0 }));
      return { ok: true };
    },

    'GET /api/me': async req => {
      const u = await requireUser(req);
      return { id: u.id, name: u.name, admin: u.admin };
    },

    'GET /api/admin/users': async req => {
      await requireUser(req, { admin: true });
      const list = await jellyfin.users();
      return list
        .map(u => ({ id: u.id, name: u.name, admin: u.admin, disabled: u.disabled, allowed: u.admin || store.isAllowed(u.id) }))
        .sort((a, b) => a.name.localeCompare(b.name));
    },

    'POST /api/admin/allow': async req => {
      checkOrigin(req);
      const me = await requireUser(req, { admin: true });
      const { id, allowed } = await readBody(req);
      if (typeof id !== 'string' || typeof allowed !== 'boolean') throw new HttpError(400, 'Need { id, allowed }');
      const target = await jellyfin.user(id);
      if (!target) throw new HttpError(404, 'No such Jellyfin user');
      if (allowed) store.allow(target.id, target.name, me.name); else store.revoke(target.id);
      userCache.delete(target.id);
      log.info?.(`${me.name} ${allowed ? 'allowed' : 'removed'} ${target.name}`);
      return { id: target.id, allowed: target.admin || store.isAllowed(target.id) };
    }
  };

  // → absolute path of an existing file under root, or null
  async function findFile(dir, rel) {
    if (!dir) return null;
    const root = normalize(dir.endsWith(sep) ? dir : dir + sep);
    const file = normalize(join(root, rel));
    if (!file.startsWith(root)) return null;
    try { return (await stat(file)).isFile() ? file : null; } catch { return null; }
  }

  async function serveStatic(req, res, pathname) {
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, { error: 'Method not allowed' });
    let rel;
    try { rel = decodeURIComponent(pathname); } catch { return send(res, 400, { error: 'Bad path' }); }
    if (rel.endsWith('/')) rel += 'index.html';
    if (rel.split('/').some(p => p.startsWith('.'))) return send(res, 404, { error: 'Not found' });
    let file = await findFile(config.webDir, rel);
    if (!file) {
      file = await findFile(config.appDir, rel);
      if (file && !(await currentUser(req))) {
        // The app itself is for signed-in users only: pages go to the sign-in page, the rest gets 401.
        if (extname(file) === '.html') { res.writeHead(302, { ...SECURITY_HEADERS, Location: '/' }); return res.end(); }
        return send(res, 401, { error: 'Not signed in' });
      }
    }
    if (!file) return send(res, 404, { error: 'Not found' });
    try {
      const body = await readFile(file);
      res.writeHead(200, {
        ...SECURITY_HEADERS,
        'Content-Type': MIME[extname(file)] || 'application/octet-stream',
        'Content-Length': body.length,
        'Cache-Control': extname(file) === '.html' ? 'no-cache' : 'public, max-age=300'
      });
      res.end(req.method === 'HEAD' ? undefined : body);
    } catch {
      send(res, 404, { error: 'Not found' });
    }
  }

  async function handle(req, res) {
    const { pathname } = new URL(req.url, 'http://beacon');
    const route = routes[`${req.method} ${pathname}`];
    try {
      if (pathname.startsWith('/api/secrets/')) return send(res, 200, await secretsRoute(req, safeDecode(pathname.slice(13))));
      if (route) {
        const out = await route(req, res);
        return send(res, 200, out);
      }
      if (pathname.startsWith('/api/')) return send(res, 404, { error: 'No such API route' });
      return await serveStatic(req, res, pathname);
    } catch (e) {
      if (e instanceof HttpError) return send(res, e.status, { error: e.message });
      log.error?.(`${req.method} ${pathname} failed:`, e.message);
      return send(res, 502, { error: 'Beacon could not reach a service it needs. Try again shortly.' });
    }
  }

  return createServer((req, res) => { handle(req, res); });
}
