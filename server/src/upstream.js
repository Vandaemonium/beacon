/* Requests to outside services. On Sol they leave through Gluetun's HTTP proxy (ProtonVPN):
 * compose sets HTTP(S)_PROXY + NODE_USE_ENV_PROXY=1, and NO_PROXY keeps Jellyfin local.
 * Nothing here will fetch a private or local address, so Beacon can't be used to reach inside Sol.
 */
'use strict';

import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { Readable } from 'node:stream';

const PRIVATE = [
  /^127\./, /^10\./, /^192\.168\./, /^172\.(1[6-9]|2\d|3[01])\./, /^169\.254\./, /^0\./, /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./,
  /^::1$/, /^::$/, /^f[cd]/i, /^fe80:/i, /^::ffff:(127|10|192\.168|172\.(1[6-9]|2\d|3[01])|169\.254)\./i
];

export class UpstreamError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export async function assertPublic(url, { allowPrivate = false } = {}) {
  let u;
  try { u = new URL(url); } catch { throw new UpstreamError(400, 'Bad provider URL'); }
  if (!['http:', 'https:'].includes(u.protocol)) throw new UpstreamError(400, 'Only http(s) providers');
  if (allowPrivate) return u;
  const host = u.hostname.replace(/^\[|\]$/g, '');
  const addrs = isIP(host) ? [host] : (await lookup(host, { all: true }).catch(() => [])).map(a => a.address);
  if (!addrs.length) throw new UpstreamError(502, `Can't resolve ${host}`);
  if (addrs.some(a => PRIVATE.some(re => re.test(a)))) throw new UpstreamError(403, 'Refusing a private address');
  return u;
}

export async function fetchUpstream(url, opts = {}, { timeout = 30000, allowPrivate = false } = {}) {
  await assertPublic(url, { allowPrivate });
  try {
    return await fetch(url, { redirect: 'follow', ...opts, signal: opts.signal || AbortSignal.timeout(timeout) });
  } catch (e) {
    if (e.name === 'TimeoutError') throw new UpstreamError(504, 'The provider took too long to answer');
    throw new UpstreamError(502, "Couldn't reach the provider");
  }
}

const PASS = ['content-type', 'content-length', 'content-range', 'accept-ranges', 'last-modified', 'etag'];

/** Pipe an upstream media response (honouring Range) into res. Ends when either side closes. */
export async function pipeMedia(req, res, url, { headers = {}, allowPrivate = false } = {}) {
  const ac = new AbortController();
  req.on('close', () => ac.abort());
  const up = await fetchUpstream(url, {
    headers: { ...headers, ...(req.headers.range ? { Range: req.headers.range } : {}) },
    signal: ac.signal
  }, { allowPrivate });
  if (!up.ok && up.status !== 206) throw new UpstreamError(up.status === 404 ? 404 : 502, `Provider returned HTTP ${up.status}`);
  const out = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
  for (const h of PASS) { const v = up.headers.get(h); if (v) out[h] = v; }
  res.writeHead(up.status, out);
  if (req.method === 'HEAD' || !up.body) { ac.abort(); return res.end(); }
  const body = Readable.fromWeb(up.body);
  body.on('error', () => res.destroy());
  body.pipe(res);
  await new Promise(r => res.on('close', r));
}
