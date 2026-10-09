/* Signed session cookies: "<payload>.<hmac>", payload = base64url JSON { uid, name, exp }.
 * Stateless, so sessions survive restarts. Revocation happens elsewhere: every request
 * re-checks the allowlist (and periodically Jellyfin), so removing someone takes effect at once.
 */
'use strict';

import { createHmac, timingSafeEqual } from 'node:crypto';

export const COOKIE = 'beacon_session';

function sign(data, secret) {
  return createHmac('sha256', secret).update(data).digest('base64url');
}

export function issue(user, { secret, days }) {
  const payload = Buffer.from(JSON.stringify({ uid: user.id, name: user.name, exp: Date.now() + days * 864e5 })).toString('base64url');
  return payload + '.' + sign(payload, secret);
}

export function verify(token, { secret }) {
  if (typeof token !== 'string') return null;
  const dot = token.indexOf('.');
  if (dot < 1) return null;
  const payload = token.slice(0, dot), mac = Buffer.from(token.slice(dot + 1));
  const want = Buffer.from(sign(payload, secret));
  if (mac.length !== want.length || !timingSafeEqual(mac, want)) return null;
  try {
    const s = JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (!s.uid || typeof s.exp !== 'number' || s.exp < Date.now()) return null;
    return s;
  } catch { return null; }
}

export function parseCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export function cookieHeader(value, { secure, maxAgeSeconds }) {
  const attrs = [`${COOKIE}=${value}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${maxAgeSeconds}`];
  if (secure) attrs.push('Secure');
  return attrs.join('; ');
}
