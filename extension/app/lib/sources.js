/* Beacon Hub 1.0 source search.
 * Queries every configured provider in parallel — installed Stremio-protocol add-ons,
 * enabled Express providers (via express.js) and your Premiumize / TorBox cloud —
 * so one failing provider never blocks the others. Searches are built from IMDb IDs,
 * titles, years and S00E00 codes; nothing is ever marked watched by a search.
 */
'use strict';
import { quality, parseRelease, epCode, fmtBytes, norm } from './meta.js';
import { pm } from './premiumize.js';
import { torbox } from './torbox.js';
import { sourceCompat } from './compat.js';

const ADDONS_KEY = 'beacon:stremio:addons:v1';

export function installedAddons() {
  try { const a = JSON.parse(localStorage.getItem(ADDONS_KEY) || '[]'); return Array.isArray(a) ? a : []; } catch { return []; }
}
const resourceRule = (a, name) => (a.resources || []).find(r => typeof r === 'string' ? r === name : r?.name === name);
function supports(a, type, id) {
  const rule = resourceRule(a, 'stream');
  if (!rule || !(a.types || []).includes(type)) return false;
  if (typeof rule === 'object' && Array.isArray(rule.types) && !rule.types.includes(type)) return false;
  const prefixes = typeof rule === 'object' && Array.isArray(rule.idPrefixes) ? rule.idPrefixes : a.idPrefixes;
  return !Array.isArray(prefixes) || !prefixes.length || prefixes.some(p => id.startsWith(p));
}
function endpoint(a, type, id) {
  const root = new URL(a.url);
  root.pathname = root.pathname.replace(/manifest\.json$/, '') + ['stream', type, id].map(encodeURIComponent).join('/') + '.json';
  root.search = '';
  return root.href;
}
export function streamProviders(type) {
  const t = type === 'movie' ? 'movie' : 'series';
  return installedAddons().filter(a => a.enabled && resourceRule(a, 'stream') && (a.types || []).includes(t));
}
export function providerSummary() {
  const addons = installedAddons();
  return {
    addons: addons.length,
    streamAddons: addons.filter(a => a.enabled && resourceRule(a, 'stream')).length,
    express: window.BeaconExpress?.enabledCount?.() ?? (window.BeaconExpress?.hasEnabled() ? 1 : 0),
  };
}

/* ---------- parsing helpers ---------- */
const TAGS = [
  [/\b(dolby ?vision|dovi|\bdv\b)/i, 'Dolby Vision'], [/\bhdr10\+/i, 'HDR10+'], [/\bhdr(10)?\b/i, 'HDR'],
  [/\b(x265|h\.?265|hevc)\b/i, 'HEVC'], [/\bav1\b/i, 'AV1'], [/\b(x264|h\.?264|avc)\b/i, 'H.264'],
  [/\bremux\b/i, 'REMUX'], [/\b(blu-?ray|bdrip|brrip)\b/i, 'BluRay'], [/\bweb-?(dl|rip)?\b/i, 'WEB'],
  [/\batmos\b/i, 'Atmos'], [/\b(dts(-hd)?( ma)?|truehd)\b/i, 'DTS/TrueHD'], [/\b(ddp?5\.1|eac3|ac3|dd\+)\b/i, 'Dolby Digital'], [/\b10.?bit\b/i, '10-bit'],
];
const tagsOf = s => { const out = []; for (const [re, t] of TAGS) if (re.test(s) && !out.includes(t)) out.push(t); if (out.includes('HDR10+')) return out.filter(t => t !== 'HDR'); return out; };
function sizeFrom(text) {
  const m = String(text || '').match(/(?:💾\s*)?(\d+(?:[.,]\d+)?)\s*(TB|GB|MB|GiB|MiB)\b/i);
  if (!m) return 0;
  const n = parseFloat(m[1].replace(',', '.'));
  const u = m[2].toUpperCase().replace('I', '');
  return n * { TB: 1024 ** 4, GB: 1024 ** 3, MB: 1024 ** 2 }[u];
}
const seedersFrom = text => Number(String(text || '').match(/👤\s*(\d+)/)?.[1]) || Number(String(text || '').match(/\bseed(?:ers|s)?[:\s]+(\d+)/i)?.[1]) || null;
const siteFrom = text => String(text || '').match(/⚙️\s*([^\n]+)/)?.[1]?.trim() || '';
const hashFromMagnet = m => String(m || '').match(/btih:([a-f0-9]{40}|[a-z2-7]{32})/i)?.[1]?.toLowerCase() || null;

function episodeRelation(text, ep) {
  if (!ep) return 'exact';
  const p = parseRelease(text);
  if (p.season === ep.season && p.episode != null) {
    if (p.episode === ep.number || (p.episodeEnd && ep.number >= p.episode && ep.number <= p.episodeEnd)) return 'exact';
    return 'other';
  }
  if (p.season === ep.season && p.isPack) return 'pack';
  if (/\b(complete|all seasons|s\d{1,2}\s?-\s?s?\d{1,2})\b/i.test(text) && p.episode == null) return 'pack';
  if (p.season == null && p.episode == null) return 'unknown';
  return 'other';
}

function fromStremio(addon, s, ep) {
  const text = [s.name, s.title, s.description].filter(Boolean).join('\n');
  const firstLine = String(s.title || s.description || '').split('\n')[0];
  const filename = s.behaviorHints?.filename || firstLine || s.name || 'Source';
  const magnet = typeof s.url === 'string' && s.url.startsWith('magnet:') ? s.url : (s.infoHash ? `magnet:?xt=urn:btih:${s.infoHash}` : null);
  const direct = typeof s.url === 'string' && /^https:\/\//i.test(s.url) ? s.url : null;
  const rel = episodeRelation(filename + ' ' + firstLine, ep);
  return {
    provider: addon.name, providerKind: 'Add-on',
    kind: direct ? 'direct' : magnet ? 'magnet' : s.externalUrl ? 'external' : 'unknown',
    title: filename, label: String(s.name || '').replace(/\n/g, ' · '),
    quality: quality(text) || 'Unknown', size: sizeFrom(text), seeders: seedersFrom(text), site: siteFrom(text),
    tags: tagsOf(text), url: direct, magnet, infoHash: (s.infoHash || hashFromMagnet(magnet) || '').toLowerCase() || null,
    fileIdx: Number.isInteger(s.fileIdx) ? s.fileIdx : null, filenameHint: s.behaviorHints?.filename || '',
    isPack: rel === 'pack', external: s.externalUrl || null,
  };
}
function fromExpress(ruleName, it, ep) {
  const text = [it.title, it.quality, it.size].join(' ');
  const magnet = typeof it.url === 'string' && it.url.startsWith('magnet:') ? it.url : (it.infoHash ? `magnet:?xt=urn:btih:${it.infoHash}` : null);
  const direct = typeof it.url === 'string' && /^https:\/\//i.test(it.url) ? it.url : null;
  return {
    provider: ruleName, providerKind: 'Express',
    kind: direct ? 'direct' : magnet ? 'magnet' : 'unknown',
    title: it.title, label: '', quality: quality(text) || 'Unknown', size: sizeFrom(it.size) || sizeFrom(it.title), seeders: null, site: '',
    tags: tagsOf(text), url: direct, magnet, infoHash: (it.infoHash || hashFromMagnet(magnet) || '').toLowerCase() || null,
    fileIdx: null, filenameHint: '', isPack: episodeRelation(it.title, ep) === 'pack',
  };
}

/* ---------- search ---------- */
export function searchIds(item, ep) {
  const imdb = item.ids?.imdb;
  const stremioType = item.type === 'movie' ? 'movie' : 'series';
  const base = imdb || (item.ids?.tmdb ? `tmdb:${item.ids.tmdb}` : '');
  const id = base && ep ? `${base}:${ep.season}:${ep.number}` : base;
  return { stremioType, id, code: ep ? epCode(ep.season, ep.number) : '', query: ep ? `${item.title} ${epCode(ep.season, ep.number)}` : `${item.title}${item.year ? ' ' + item.year : ''}` };
}

export async function searchSources(item, ep, onUpdate) {
  const { stremioType, id, code, query } = searchIds(item, ep);
  const state = { query, code, id, providers: [], sources: [], done: false };
  const seen = new Set();
  const push = list => {
    for (const s of list) {
      const k = s.infoHash ? s.infoHash + ':' + (s.fileIdx ?? '') : s.url || s.pmFile?.id || s.title + s.provider;
      if (seen.has(k)) continue;
      seen.add(k); state.sources.push(s);
    }
    sortSources(state.sources);
  };
  const emitState = () => onUpdate?.({ ...state, providers: [...state.providers], sources: [...state.sources] });
  const track = (name, kind, fn) => {
    const p = { name, kind, status: 'pending', count: 0, error: '' };
    state.providers.push(p);
    return (async () => {
      try { const list = await fn(); p.count = list.length; p.status = 'ok'; push(list); }
      catch (e) { p.status = 'error'; p.error = e?.name === 'TimeoutError' ? 'Timed out' : /Failed to fetch/i.test(e?.message) ? 'Network error or blocked by provider' : (e?.message || String(e)); }
      emitState();
    })();
  };

  const jobs = [];
  // 1. Your cloud first
  if (pm.connected()) jobs.push(track('Premiumize cloud', 'Cloud', async () => {
    if (!pm.files.length) await pm.refresh();
    return pm.filesFor(item, ep?.season ?? null, ep?.number ?? null).map(({ file, parsed }) => ({
      provider: 'Premiumize', providerKind: 'Cloud', kind: 'pmfile', title: file.name, label: 'In your cloud',
      quality: parsed.quality || quality(file.name) || 'Unknown', size: file.size, seeders: null, tags: tagsOf(file.name),
      pmFile: file, cached: true, isPack: false, cloud: true,
    }));
  }));
  if (torbox.connected()) jobs.push(track('TorBox cloud', 'Cloud', async () => {
    await torbox.refresh();
    return torbox.filesFor(item, ep?.season, ep?.number).map(f => ({
      provider: 'TorBox', providerKind: 'Cloud', kind: 'torboxfile', title: f.name, label: 'In your cloud',
      quality: quality(f.name) || 'Unknown', size: f.size, tags: tagsOf(f.name), tbFile: f, cached: true, cloud: true,
    }));
  }));
  // 2. Stremio-protocol add-ons
  if (id) for (const addon of streamProviders(item.type)) {
    if (!supports(addon, stremioType, id)) {
      state.providers.push({ name: addon.name, kind: 'Add-on', status: 'skipped', count: 0, error: 'Does not support this ID type' });
      continue;
    }
    jobs.push(track(addon.name, 'Add-on', async () => {
      const r = await fetch(endpoint(addon, stremioType, id), { signal: AbortSignal.timeout(20000), headers: { Accept: 'application/json' } });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const data = await r.json();
      return (Array.isArray(data.streams) ? data.streams : []).map(s => fromStremio(addon, s, ep)).filter(s => s.kind !== 'unknown');
    }));
  }
  // 3. Express providers (existing Beacon 2.9+ engine)
  if (window.BeaconExpress?.searchRule && window.BeaconExpress.hasEnabled()) {
    const media = { name: item.title, year: item.year, releaseInfo: String(item.year || ''), id: item.ids?.imdb || '' };
    const vid = ep ? `${item.ids?.imdb || 'x'}:${ep.season}:${ep.number}` : (item.ids?.imdb || '');
    const rules = window.BeaconExpress.enabledRules();
    for (const rule of rules) {
      jobs.push(track(rule.name, 'Express', async () => {
        const items = await window.BeaconExpress.searchRule(rule, media, stremioType, vid);
        return items.map(it => fromExpress(rule.name, it, ep)).filter(s => {
          if (s.kind === 'unknown') return false;
          if (!ep) return true;
          const rel = episodeRelation(s.title, ep);
          return rel === 'exact' || rel === 'pack';
        });
      }));
    }
  }
  emitState();
  await Promise.all(jobs);

  // 4. Premiumize instant-availability check for torrent results
  if (pm.connected()) {
    const hashes = state.sources.filter(s => s.infoHash && !s.cloud).map(s => s.infoHash);
    if (hashes.length) {
      const res = await pm.cacheCheck(hashes);
      for (const s of state.sources) if (s.infoHash && res.has(s.infoHash)) { const c = res.get(s.infoHash); s.cached = c.cached; s.transcoded = c.cached && c.transcoded; }
      sortSources(state.sources);
    }
  }
  state.done = true;
  emitState();
  return state;
}

const QRANK = { '4K': 0, '1080p': 1, '720p': 2, 'SD': 3, 'Unknown': 4 };
export function sortSources(list) {
  const pref = window.BeaconPreferences?.get?.().quality || '1080p';
  const order = pref === '1080p' ? { '1080p': 0, '4K': 1, '720p': 2, SD: 3, Unknown: 4 } : pref === '720p' ? { '720p': 0, '1080p': 1, SD: 2, '4K': 3, Unknown: 4 } : QRANK;
  const CR = { ok: 0, unknown: 1, maybe: 1, no: 2 };
  const cr = s => CR[sourceCompat(s).verdict];
  return list.sort((a, b) =>
    (b.cloud ? 1 : 0) - (a.cloud ? 1 : 0) ||
    cr(a) - cr(b) ||
    (b.cached ? 1 : 0) - (a.cached ? 1 : 0) ||
    (a.isPack ? 1 : 0) - (b.isPack ? 1 : 0) ||
    (order[a.quality] ?? 4) - (order[b.quality] ?? 4) ||
    (b.seeders || 0) - (a.seeders || 0) ||
    (b.size || 0) - (a.size || 0));
}

/** Choose the right file from a multi-file torrent / pack. */
export function pickFile(files, ep, hint) {
  const vids = files.filter(f => /\.(mkv|mp4|avi|m4v|mov|webm|ts)$/i.test(f.path || f.name || '') && !/\bsample\b/i.test(f.path || f.name || ''));
  if (!vids.length) throw new Error('No video files found in this source');
  if (hint) { const h = vids.find(f => (f.path || f.name || '').endsWith(hint)); if (h) return h; }
  if (ep) {
    const m = vids.find(f => { const p = parseRelease(f.path || f.name); return p.season === ep.season && p.episode === ep.number; });
    if (m) return m;
    const m2 = vids.find(f => new RegExp(`\\b${ep.season}x0?${ep.number}\\b|\\bE0?${ep.number}\\b`, 'i').test(f.path || f.name));
    if (m2) return m2;
    throw new Error(`${epCode(ep.season, ep.number)} was not found inside this ${vids.length}-file pack`);
  }
  return vids.sort((a, b) => (b.size || 0) - (a.size || 0))[0];
}

/** Resolve any source to {url, alt, label}. Throws with a readable message. */
export async function resolveSource(src, item, ep) {
  if (src.kind === 'direct') return { url: src.url, label: src.provider };
  if (src.kind === 'pmfile') { const p = await pm.playable(src.pmFile); return { url: p.link, alt: p.stream_link, label: 'Premiumize cloud' }; }
  if (src.kind === 'torboxfile') return { url: await torbox.link(src.tbFile.torrentId, src.tbFile.fileId), label: 'TorBox cloud' };
  if (src.kind === 'magnet') {
    if (pm.connected()) {
      let r;
      try { r = await pm.directdl(src.magnet); } catch (e) { throw Object.assign(new Error('Premiumize: ' + e.message), { canSave: true }); }
      const files = (r.content || []).map(c => ({ ...c, name: c.path }));
      if (!files.length) throw Object.assign(new Error('Not cached on Premiumize yet. Save it to your cloud and play it once the transfer finishes.'), { canSave: true });
      const f = pickFile(files, ep, src.filenameHint);
      return { url: f.link, alt: f.stream_link || '', label: 'Premiumize' };
    }
    if (torbox.connected()) return { url: await torbox.instant(src.magnet, files => pickFile(files, ep, src.filenameHint)), label: 'TorBox' };
    throw new Error('Torrent sources need Premiumize (or TorBox) connected in Settings');
  }
  if (src.kind === 'external') throw new Error('This provider only offers an external link, which can’t play inside Beacon');
  throw new Error('This source has no playable link');
}

/** For automatic next-episode selection: find a source similar to the one used before. */
export function similarSource(list, info) {
  if (!info) return null;
  const playable = list.filter(s => s.kind !== 'external' && !s.isPack && sourceCompat(s).verdict !== 'no');
  return playable.find(s => s.cloud) ||
    playable.find(s => s.provider === info.provider && s.quality === info.quality && (s.cached || s.kind === 'direct')) ||
    playable.find(s => s.quality === info.quality && (s.cached || s.kind === 'direct')) || null;
}

export const describe = s => [s.size ? fmtBytes(s.size) : '', s.seeders != null ? `${s.seeders} seeders` : '', s.site].filter(Boolean).join(' · ');
export const sameTitle = (a, b) => norm(a) === norm(b);
