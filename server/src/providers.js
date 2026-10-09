/* The communal accounts: Premiumize, TorBox and IPTV, used through Beacon so no browser ever
 * holds a key or the IPTV login. Every media link that comes back is rewritten to an encrypted,
 * expiring /api/stream/<token> link, so video flows provider → Sol → viewer (one address on
 * each account) and VLC playlists carry no provider login.
 *
 *   GET|POST /api/pm/<path>         Premiumize API (allowlisted paths; deletes are admin-only)
 *   GET|POST /api/tb/<path>         TorBox API (allowlisted paths)
 *   GET  /api/iptv/player_api       Xtream player_api.php (login added here)
 *   GET  /api/iptv/live/<id>.m3u8   a live channel, playlist rewritten; ?k=<stream key> or the cookie
 *   GET  /api/stream/<token>        the media itself (Range supported), no cookie needed
 */
'use strict';

import { fetchUpstream, pipeMedia, UpstreamError } from './upstream.js';
import { liveAudio } from './liveaudio.js';

const PM_BASE = 'https://www.premiumize.me/api/';
const TB_BASE = 'https://api.torbox.app/v1/api/';
const PM_PATHS = new Set(['account/info', 'item/listall', 'folder/list', 'item/details', 'transfer/list', 'transfer/create', 'transfer/directdl', 'cache/check']);
const PM_ADMIN = new Set(['transfer/delete', 'transfer/clearfinished']);
const TB_PATHS = new Set(['torrents/mylist', 'torrents/requestdl', 'torrents/createtorrent']);
const LINK_KEYS = new Set(['link', 'stream_link', 'location']);
const STREAM_TTL = 12 * 3600e3;
const SLOT_IDLE_MS = 30e3;

export function providers({ config, vault, log = {} }) {
  const live = new Map(); // uid → { channel, at }: who is watching Live TV right now
  const PM = config.bases?.premiumize || PM_BASE, TB = config.bases?.torbox || TB_BASE; // tests point these at fakes
  const opts = { allowPrivate: !!config.allowPrivateUpstream };
  const audio = liveAudio({ enabled: config.liveAudioFix !== false, log });

  const has = {
    premiumize: !!config.premiumizeKey,
    torbox: !!config.torboxKey,
    iptv: !!(config.iptv?.server && config.iptv?.username && config.iptv?.password)
  };

  function streamLink(url, uid, kind = 'file', ch) {
    return '/api/stream/' + vault.seal({ u: url, uid, k: kind, ...(ch ? { ch } : {}) }, STREAM_TTL);
  }

  // Replace every provider media URL in a JSON response with a Beacon stream link.
  function rewriteLinks(v, uid, key = '') {
    if (Array.isArray(v)) return v.map(x => rewriteLinks(x, uid, key));
    if (v && typeof v === 'object') {
      // Premiumize often returns the original file again as the "browser-friendly" stream_link
      // (same file, same Dolby/DTS audio). Drop it so the UI doesn't promise a version that plays.
      if (typeof v.link === 'string' && v.stream_link === v.link) v = { ...v, stream_link: '' };
      return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, rewriteLinks(x, uid, k)]));
    }
    if (typeof v === 'string' && LINK_KEYS.has(key) && /^https?:\/\//i.test(v)) return streamLink(v, uid);
    return v;
  }

  function appendParams(target, params = {}) {
    for (const [k, v] of Object.entries(params)) {
      if (Array.isArray(v)) v.forEach(x => target.append(k + '[]', String(x)));
      else if (v != null) target.set(k, String(v));
    }
  }

  async function json(r, what) {
    const text = await r.text();
    try { return JSON.parse(text); } catch { throw new UpstreamError(502, `${what} sent something unexpected (HTTP ${r.status})`); }
  }

  async function premiumize({ user, method, path, query, body }) {
    if (!has.premiumize) throw new UpstreamError(404, "Empyrean's Premiumize account isn't set up");
    if (PM_ADMIN.has(path) && !user.admin) throw new UpstreamError(403, 'Only an admin can delete from the shared Premiumize account');
    if (!PM_PATHS.has(path) && !PM_ADMIN.has(path)) throw new UpstreamError(404, 'Not a Premiumize call Beacon makes');
    let r;
    if (method === 'GET') {
      const u = new URL(PM + path);
      for (const [k, v] of query) if (k !== 'apikey') u.searchParams.append(k, v);
      u.searchParams.set('apikey', config.premiumizeKey);
      r = await fetchUpstream(u.href, {}, opts);
    } else {
      const form = new URLSearchParams({ apikey: config.premiumizeKey });
      appendParams(form, body?.params);
      r = await fetchUpstream(PM + path, { method: 'POST', body: form }, opts);
    }
    if (method !== 'GET' || path.startsWith('transfer/')) log.info?.(`premiumize ${path} by ${user.name}`);
    return rewriteLinks(await json(r, 'Premiumize'), user.id);
  }

  async function torbox({ user, method, path, query, body }) {
    if (!has.torbox) throw new UpstreamError(404, "Empyrean's TorBox account isn't set up");
    if (!TB_PATHS.has(path)) throw new UpstreamError(404, 'Not a TorBox call Beacon makes');
    const u = new URL(TB + path);
    for (const [k, v] of query) if (k !== 'token') u.searchParams.append(k, v);
    if (path === 'torrents/requestdl') u.searchParams.set('token', config.torboxKey);
    const init = { method, headers: { Authorization: 'Bearer ' + config.torboxKey } };
    if (path === 'torrents/createtorrent') {
      if (method !== 'POST' || typeof body?.magnet !== 'string' || !body.magnet.startsWith('magnet:')) throw new UpstreamError(400, 'Need { magnet }');
      const fd = new FormData();
      fd.append('magnet', body.magnet);
      init.method = 'POST';
      init.body = fd;
      log.info?.(`torbox add by ${user.name}`);
    }
    const out = await json(await fetchUpstream(u.href, init, opts), 'TorBox');
    if (path === 'torrents/requestdl' && typeof out?.data === 'string') out.data = streamLink(out.data, user.id);
    return out;
  }

  /* ---------- IPTV ---------- */
  function iptvBase() {
    if (!has.iptv) throw new UpstreamError(404, "Empyrean's Live TV account isn't set up");
    return config.iptv.server.replace(/\/+$/, '');
  }

  async function iptvApi({ user, query }) {
    const u = new URL(iptvBase() + '/player_api.php');
    for (const [k, v] of query) if (k !== 'username' && k !== 'password') u.searchParams.append(k, v);
    u.searchParams.set('username', config.iptv.username);
    u.searchParams.set('password', config.iptv.password);
    const out = await json(await fetchUpstream(u.href, {}, { ...opts, timeout: 60000 }), 'The Live TV provider');
    // Never hand the login (or the provider's own server details) to the browser.
    if (out && typeof out === 'object' && !Array.isArray(out)) {
      if (out.user_info) {
        const { username, password, ...rest } = out.user_info;
        out.user_info = { ...rest, username: 'Empyrean' };
      }
      delete out.server_info;
    }
    return out;
  }

  // One Live TV slot per person watching; the plan allows config.iptv.maxStreams at once.
  function takeSlot(user, channel) {
    const now = Date.now();
    for (const [uid, s] of live) if (now - s.at > SLOT_IDLE_MS) live.delete(uid);
    if (!live.has(user.id) && live.size >= config.iptv.maxStreams) {
      throw new UpstreamError(429, `All ${config.iptv.maxStreams} Live TV slots are in use right now. Try again when someone stops watching.`);
    }
    live.set(user.id, { channel, at: now });
  }

  async function hlsPlaylist(url, user, ch) {
    const r = await fetchUpstream(url, {}, opts);
    if (!r.ok) throw new UpstreamError(r.status === 404 ? 404 : 502, `Live TV provider returned HTTP ${r.status}`);
    const base = r.url || url;
    const text = await r.text();
    if (!text.startsWith('#EXTM3U')) throw new UpstreamError(502, 'Live TV provider sent something that is not a playlist');
    const link = ref => {
      const abs = new URL(ref, base).href;
      return streamLink(abs, user.id, /\.m3u8(\?|$)/i.test(abs) ? 'hls' : 'file', ch);
    };
    return text.split(/\r?\n/).map(line => {
      if (!line) return line;
      if (line.startsWith('#')) {
        line = line.replace(/URI="([^"]+)"/g, (_, ref) => `URI="${link(ref)}"`);
        // Dolby audio is converted to AAC on the way through (liveaudio.js), so say so to the player.
        return audio.on ? line.replace(/CODECS="([^"]*)"/, (_, c) => `CODECS="${c.replace(/\b(ac-3|ec-3)\b/g, 'mp4a.40.2')}"`) : line;
      }
      return link(line.trim());
    }).join('\n');
  }

  async function iptvLive({ user, id }) {
    if (!/^\d{1,12}$/.test(id)) throw new UpstreamError(400, 'Bad channel');
    takeSlot(user, id);
    const a = config.iptv;
    return hlsPlaylist(`${iptvBase()}/live/${encodeURIComponent(a.username)}/${encodeURIComponent(a.password)}/${id}.m3u8`, user, id);
  }

  /* ---------- /api/stream/<token> ---------- */
  async function stream({ req, res, data, user }) {
    if (data.k === 'hls') {
      if (live.has(user.id)) live.get(user.id).at = Date.now();
      const body = await hlsPlaylist(data.u, user, data.ch);
      res.writeHead(200, { 'Content-Type': 'application/vnd.apple.mpegurl', 'Cache-Control': 'no-store' });
      return res.end(body);
    }
    if (live.has(user.id) && /\.(ts|m4s|aac|mp4)(\?|$)/i.test(data.u)) live.get(user.id).at = Date.now();
    // Live TV MPEG-TS segments: fetched whole so their audio can be fixed for browsers if needed.
    if (data.ch && audio.on && !/\.(key|bin|m4s|mp4|aac|vtt)(\?|$)/i.test(data.u)) {
      const r = await fetchUpstream(data.u, {}, opts);
      if (!r.ok) throw new UpstreamError(r.status === 404 ? 404 : 502, `Live TV provider returned HTTP ${r.status}`);
      const seg = Buffer.from(await r.arrayBuffer());
      const isTs = seg[0] === 0x47; // MPEG-TS sync byte
      const body = isTs ? await audio.fix(data.ch, seg) : seg;
      res.writeHead(200, { 'Content-Type': isTs ? 'video/mp2t' : (r.headers.get('content-type') || 'application/octet-stream'), 'Content-Length': body.length, 'Cache-Control': 'no-store' });
      return res.end(req.method === 'HEAD' ? undefined : body);
    }
    return pipeMedia(req, res, data.u, opts);
  }

  /* ---------- Express (Barr's OpenScrapers engine): search pages fetched through the VPN ---------- */
  function expressHosts(defaults) {
    const hosts = new Set();
    let packs = [];
    try { packs = JSON.parse(defaults?.local?.['beacon:express:packages:v1'] || '[]'); } catch {}
    for (const pack of Array.isArray(packs) ? packs : []) {
      for (const p of pack.providers || []) {
        if (!p.supported) continue;
        for (const u of [p.rules?.base_url, ...(p.rules?.fallback_urls || [])]) {
          try { const x = new URL(u); if (x.protocol === 'https:') hosts.add(x.host); } catch {}
        }
      }
    }
    return hosts;
  }

  async function expressFetch({ user, url, accept, defaults }) {
    let u;
    try { u = new URL(url); } catch { throw new UpstreamError(400, 'Bad search URL'); }
    if (u.protocol !== 'https:' || u.username || u.password) throw new UpstreamError(400, 'Public HTTPS URL required');
    if (!expressHosts(defaults).has(u.host)) throw new UpstreamError(403, `${u.host} isn't one of the shared Express providers`);
    const r = await fetchUpstream(u.href, { headers: { Accept: /json/.test(accept || '') ? 'application/json' : 'text/html', 'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36' } }, { ...opts, timeout: 12000 });
    const body = Buffer.from(await r.arrayBuffer());
    if (body.length > 2.5e6) throw new UpstreamError(502, 'Search page too large');
    return { status: r.status, body };
  }

  // Which address Sol's provider traffic leaves from (should be ProtonVPN, not the home connection).
  async function netcheck() {
    const r = await fetchUpstream(config.bases?.ipinfo || 'https://ipinfo.io/json', {}, { ...opts, timeout: 10000 });
    const b = await json(r, 'The IP-check service');
    return { ip: b.ip, city: b.city, region: b.region, country: b.country, org: b.org };
  }

  function liveSlots() {
    const now = Date.now();
    return { max: config.iptv?.maxStreams || 0, inUse: [...live.values()].filter(s => now - s.at <= SLOT_IDLE_MS).length };
  }

  return { has, premiumize, torbox, iptvApi, iptvLive, stream, liveSlots, netcheck, expressFetch };
}
