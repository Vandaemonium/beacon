/* Beacon Hub 1.0 Premiumize client — documented REST API with the account's API key
 * (same key and storage slot used by Beacon's original Media Hub).
 */
'use strict';
import { cache, hubKey, setHubKey, fetchJson, emit } from './store.js';
import { parseRelease, norm, cinemetaSearch } from './meta.js';

const BASE = 'https://www.premiumize.me/api/';
const VIDEO = /\.(mkv|mp4|avi|m4v|mov|webm|ts|wmv|mpg|mpeg)$/i;
const MATCH_KEY = 'beacon:pm:match:v1';

export const isVideo = f => VIDEO.test(f.name || f.path || '') || /^video\//.test(f.mime_type || '');

async function call(path, params = {}, method = 'GET', key = hubKey('premiumize')) {
  if (!key) throw new Error('Connect Premiumize in Settings');
  let url = BASE + path, opts = { method };
  if (method === 'GET') {
    const u = new URL(url); u.searchParams.set('apikey', key);
    for (const [k, v] of Object.entries(params)) {
      if (Array.isArray(v)) v.forEach(x => u.searchParams.append(k + '[]', x)); else if (v != null) u.searchParams.set(k, v);
    }
    url = u.href;
  } else {
    const body = new URLSearchParams({ apikey: key });
    for (const [k, v] of Object.entries(params)) if (Array.isArray(v)) v.forEach(x => body.append(k + '[]', x)); else if (v != null) body.set(k, v);
    opts.body = body;
  }
  const { body } = await fetchJson(url, opts, 30000);
  if (body?.status !== 'success') throw new Error(body?.message || 'Premiumize request failed');
  return body;
}

let matchMap = {};
try { matchMap = JSON.parse(localStorage.getItem(MATCH_KEY) || '{}'); } catch {}
const saveMatches = () => { try { localStorage.setItem(MATCH_KEY, JSON.stringify(matchMap)); } catch {} };

export const pm = {
  files: [], transfers: [], account: null, loadedAt: 0, error: '',
  connected: () => !!hubKey('premiumize'),

  async connect(key) {
    const info = await call('account/info', {}, 'GET', key.trim());
    setHubKey('premiumize', key.trim());
    pm.account = info; emit('pm:status');
    await pm.refresh(true);
    return info;
  },
  async disconnect() {
    setHubKey('premiumize', '');
    pm.files = []; pm.transfers = []; pm.account = null;
    await cache.del('pm:files');
    emit('pm:status'); emit('pm:data');
  },

  async load() {
    const c = await cache.get('pm:files');
    if (c?.data) { pm.files = c.data; pm.loadedAt = c.at; }
    return pm;
  },

  async refresh(force = false) {
    if (!pm.connected()) return;
    if (!force && Date.now() - pm.loadedAt < 5 * 60e3) return;
    emit('pm:loading', true);
    try {
      const [acct, files, transfers] = await Promise.allSettled([call('account/info'), pm.listAll(), call('transfer/list')]);
      if (acct.status === 'fulfilled') pm.account = acct.value;
      if (files.status === 'fulfilled') { pm.files = files.value; pm.loadedAt = Date.now(); await cache.set('pm:files', { at: pm.loadedAt, data: pm.files }); pm.error = ''; }
      else pm.error = files.reason?.message || 'Could not list cloud files';
      if (transfers.status === 'fulfilled') pm.transfers = transfers.value.transfers || [];
    } finally {
      // Even a successful empty-library response should be cached.
      // Otherwise the home-page row can recursively refresh an empty account.
      if (!pm.loadedAt) pm.loadedAt = Date.now();
      emit('pm:loading', false); emit('pm:data');
    }
  },

  async listAll() {
    try {
      const r = await call('item/listall');
      return (r.files || []).filter(isVideo).filter(f => !(/\bsample\b/i.test(f.name) && (f.size || 0) < 150e6))
        .map(f => ({ id: f.id, name: f.name, path: f.path || f.name, size: f.size, created_at: f.created_at || 0 }));
    } catch (e) {
      // Fall back to walking folders (older accounts / API variations).
      const out = [];
      const walk = async (id, depth) => {
        const r = await call('folder/list', id ? { id } : {});
        for (const x of r.content || []) {
          if (x.type === 'folder' && depth < 4) await walk(x.id, depth + 1);
          else if (x.type === 'file' && isVideo(x)) out.push({ id: x.id, name: x.name, path: x.name, size: x.size, created_at: x.created_at || 0, link: x.link, stream_link: x.stream_link });
        }
      };
      await walk('', 0);
      return out;
    }
  },

  async transfersList() { const r = await call('transfer/list'); pm.transfers = r.transfers || []; emit('pm:data'); return pm.transfers; },
  details: id => call('item/details', { id }),
  createTransfer: src => call('transfer/create', { src }, 'POST'),
  deleteTransfer: id => call('transfer/delete', { id }, 'POST'),
  clearFinished: () => call('transfer/clearfinished', {}, 'POST'),
  directdl: src => call('transfer/directdl', { src }, 'POST'),

  /** Returns Map(hashLower -> {cached, filename, filesize}) */
  async cacheCheck(hashes) {
    const out = new Map();
    const list = [...new Set(hashes.filter(Boolean).map(h => h.toLowerCase()))];
    for (let i = 0; i < list.length; i += 80) {
      const chunk = list.slice(i, i + 80);
      try {
        const r = await call('cache/check', { items: chunk });
        chunk.forEach((h, j) => out.set(h, { cached: !!r.response?.[j], transcoded: !!r.transcoded?.[j], filename: r.filename?.[j] || '', filesize: r.filesize?.[j] || 0 }));
      } catch (e) { console.warn('PM cache check failed', e); }
    }
    return out;
  },

  /** Group cloud videos into movies / shows / other with parsed release info. */
  library() {
    const movies = new Map(), shows = new Map(), other = [];
    for (const f of pm.files) {
      const p = parseRelease(f.name);
      if (!p.title || p.title.length < 2) { other.push({ file: f, parsed: p }); continue; }
      if (p.type === 'show') {
        const k = norm(p.title);
        if (!shows.has(k)) shows.set(k, { kind: 'show', title: p.title, year: null, files: [], newest: 0 });
        const g = shows.get(k); g.files.push({ file: f, parsed: p }); g.newest = Math.max(g.newest, f.created_at || 0);
      } else {
        const k = norm(p.title) + '|' + (p.year || '');
        if (!movies.has(k)) movies.set(k, { kind: 'movie', title: p.title, year: p.year, files: [], newest: 0 });
        const g = movies.get(k); g.files.push({ file: f, parsed: p }); g.newest = Math.max(g.newest, f.created_at || 0);
      }
    }
    const attach = g => { g.match = matchMap[matchKey(g)]?.item || null; return g; };
    return {
      movies: [...movies.values()].map(attach).sort((a, b) => b.newest - a.newest),
      shows: [...shows.values()].map(attach).sort((a, b) => b.newest - a.newest),
      other,
    };
  },

  /** Resolve posters/metadata for library groups via Cinemeta (confident matches only). */
  async matchLibrary(limit = 60) {
    const lib = pm.library();
    const groups = [...lib.movies, ...lib.shows].filter(g => !(matchKey(g) in matchMap)).slice(0, limit);
    let changed = false;
    for (const g of groups) {
      try {
        const results = await cinemetaSearch(g.kind, g.title);
        const t = norm(g.title);
        const hit = results.find(r => norm(r.title) === t && (g.kind === 'show' || !g.year || !r.year || Math.abs(r.year - g.year) <= 1));
        matchMap[matchKey(g)] = { at: Date.now(), item: hit ? { type: hit.type, title: hit.title, year: hit.year, ids: hit.ids, poster: hit.poster, backdrop: hit.backdrop, logo: hit.logo, overview: hit.overview, rating: hit.rating, genres: hit.genres, runtime: hit.runtime } : null };
        changed = true;
      } catch { /* leave unmatched; try again next refresh */ }
    }
    if (changed) { saveMatches(); emit('pm:data'); }
  },

  /** Cloud files that correspond to a title / episode. */
  filesFor(item, season = null, episode = null) {
    const t = norm(item.title);
    if (!t) return [];
    return pm.files.map(f => ({ file: f, parsed: parseRelease(f.name) })).filter(({ parsed: p }) => {
      if (norm(p.title) !== t) return false;
      if (item.type === 'movie') return p.type === 'movie' && (!p.year || !item.year || Math.abs(p.year - item.year) <= 1);
      if (season == null) return p.type === 'show';
      if (p.season !== season) return false;
      if (episode == null) return true;
      return p.episode === episode || (p.episodeEnd && episode >= p.episode && episode <= p.episodeEnd);
    });
  },

  /** Resolve a cloud file to playable URLs. */
  async playable(file) {
    if (file.link) return { link: file.link, stream_link: file.stream_link || '' };
    const d = await pm.details(file.id);
    return { link: d.link, stream_link: d.stream_link || '', duration: d.duration, resy: d.resy };
  },

  clearMatches() { matchMap = {}; saveMatches(); },
};

const matchKey = g => `${g.kind}|${norm(g.title)}|${g.year || ''}`;
