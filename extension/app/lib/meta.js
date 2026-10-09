/* Beacon Hub 1.0 metadata: one normalized title model for Trakt + Cinemeta.
 * Artwork comes from Cinemeta / MetaHub (keyless, IMDb-ID based).
 * Episode lists come from Trakt when a Client ID is configured and from Cinemeta otherwise;
 * both are merged so thumbnails and synopses fill in wherever either source has them.
 */
'use strict';
import { cache, fetchJson } from './store.js';

export const CINEMETA = 'https://v3-cinemeta.strem.io';
const METAHUB = 'https://images.metahub.space';

export const poster = imdb => imdb ? `${METAHUB}/poster/medium/${imdb}/img` : '';
export const backdrop = imdb => imdb ? `${METAHUB}/background/medium/${imdb}/img` : '';
export const logo = imdb => imdb ? `${METAHUB}/logo/medium/${imdb}/img` : '';

export const pad = n => String(n).padStart(2, '0');
export const epCode = (s, e) => `S${pad(s)}E${pad(e)}`;

export function keyOf(item) {
  if (!item) return '';
  const ids = item.ids || {};
  const type = item.type === 'series' ? 'show' : item.type;
  if (ids.imdb) return `${type}:${ids.imdb}`;
  if (ids.trakt) return `${type}:trakt${ids.trakt}`;
  return `${type}:${String(item.title || '').toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${item.year || ''}`;
}

export function withArt(item) {
  if (!item) return item;
  const imdb = item.ids?.imdb;
  if (!item.poster && imdb) item.poster = poster(imdb);
  if (!item.backdrop && imdb) item.backdrop = backdrop(imdb);
  if (!item.logo && imdb) item.logo = logo(imdb);
  return item;
}

/* ---------- Trakt → model ---------- */
export function fromTrakt(obj, type) {
  if (!obj) return null;
  const t = type === 'shows' ? 'show' : type === 'movies' ? 'movie' : type;
  return withArt({
    type: t,
    title: obj.title || 'Untitled',
    year: obj.year || null,
    ids: { ...(obj.ids || {}) },
    overview: obj.overview || '',
    tagline: obj.tagline || '',
    runtime: obj.runtime || null,
    genres: obj.genres || [],
    rating: typeof obj.rating === 'number' ? obj.rating : null,
    votes: obj.votes || 0,
    certification: obj.certification || '',
    released: obj.released || obj.first_aired || '',
    network: obj.network || '',
    status: obj.status || '',
    airedEpisodes: obj.aired_episodes || null,
    trailer: obj.trailer || '',
  });
}

/** Unwrap any Trakt list row ({movie}, {show}, {show, episode}, {type, ...}) */
export function unwrapTrakt(row) {
  if (!row) return null;
  if (row.movie) return { item: fromTrakt(row.movie, 'movie'), row };
  if (row.show && row.episode) return { item: fromTrakt(row.show, 'show'), episode: row.episode, row };
  if (row.show) return { item: fromTrakt(row.show, 'show'), row };
  if (row.season && row.show) return { item: fromTrakt(row.show, 'show'), row };
  if (row.title && row.ids) return { item: fromTrakt(row, row.first_aired !== undefined || row.aired_episodes !== undefined ? 'show' : 'movie'), row };
  return null;
}

/* ---------- Cinemeta → model ---------- */
export function fromCinemeta(m) {
  if (!m) return null;
  const year = Number(String(m.year || m.releaseInfo || '').match(/\d{4}/)?.[0]) || null;
  const rating = Number(m.imdbRating);
  return {
    type: m.type === 'series' ? 'show' : 'movie',
    title: m.name || 'Untitled',
    year,
    ids: { imdb: /^tt\d+/.test(m.imdb_id || m.id || '') ? (m.imdb_id || m.id).match(/^tt\d+/)[0] : undefined, tmdb: m.moviedb_id || undefined },
    overview: m.description || '',
    runtime: Number(String(m.runtime || '').match(/\d+/)?.[0]) || null,
    genres: (m.genres || m.genre || []).map(g => String(g)),
    rating: Number.isFinite(rating) && rating > 0 ? rating : null,
    certification: m.certification || '',
    released: m.released || '',
    status: m.status || '',
    poster: /^https:/.test(m.poster || '') ? m.poster : (m.imdb_id || /^tt/.test(m.id || '') ? poster(m.imdb_id || m.id) : ''),
    backdrop: /^https:/.test(m.background || '') ? m.background : '',
    logo: /^https:/.test(m.logo || '') ? m.logo : '',
    _cinemeta: true,
  };
}

const memo = new Map();
async function cm(path, ttl = 6 * 3600e3) {
  if (memo.has(path)) return memo.get(path);
  const p = (async () => {
    const cached = await cache.fresh('cm:' + path, ttl);
    if (cached) return cached;
    const { body } = await fetchJson(CINEMETA + path, {}, 15000);
    return cache.stamp('cm:' + path, body);
  })();
  memo.set(path, p);
  p.catch(() => memo.delete(path));
  return p;
}

export async function cinemetaCatalog(type, id, extra = '') {
  const t = type === 'show' ? 'series' : type;
  const data = await cm(`/catalog/${t}/${id}${extra ? '/' + extra : ''}.json`);
  return (data?.metas || []).map(fromCinemeta).filter(Boolean).map(withArt);
}
export async function cinemetaSearch(type, query) {
  const t = type === 'show' ? 'series' : type;
  const data = await cm(`/catalog/${t}/top/search=${encodeURIComponent(query)}.json`, 3600e3);
  return (data?.metas || []).map(fromCinemeta).filter(Boolean).map(withArt);
}
export async function cinemetaMeta(type, imdb) {
  if (!imdb) return null;
  const t = type === 'show' ? 'series' : type;
  try {
    const data = await cm(`/meta/${t}/${imdb}.json`, 3 * 24 * 3600e3);
    return data?.meta || null;
  } catch { return null; }
}

/** Merge extra Cinemeta art/fields into a Trakt-sourced item without overwriting good data. */
export async function enrich(item) {
  if (!item?.ids?.imdb) return item;
  const m = await cinemetaMeta(item.type, item.ids.imdb);
  if (!m) return item;
  const c = fromCinemeta(m);
  for (const k of ['overview', 'runtime', 'certification', 'released']) if (!item[k] && c[k]) item[k] = c[k];
  if (!item.genres?.length && c.genres?.length) item.genres = c.genres;
  if (item.rating == null && c.rating != null) item.rating = c.rating;
  if (c.poster) item.poster = c.poster;
  if (c.backdrop) item.backdrop = c.backdrop;
  if (c.logo) item.logo = c.logo;
  item._cm = m;
  return item;
}

/* ---------- Episode metadata ---------- */
function cmEpisodes(meta) {
  const out = [];
  for (const v of meta?.videos || []) {
    let season = Number(v.season), number = Number(v.episode ?? v.number);
    const idm = String(v.id || '').match(/:(\d+):(\d+)$/);
    if (!Number.isInteger(season) && idm) season = Number(idm[1]);
    if (!(Number.isInteger(number) && number > 0) && idm) number = Number(idm[2]);
    if (!Number.isInteger(season) || !Number.isInteger(number) || number <= 0) continue;
    out.push({
      season, number,
      title: v.name || v.title || '',
      overview: v.overview || v.description || '',
      aired: v.released || v.firstAired || '',
      thumbnail: /^https:/.test(v.thumbnail || '') ? v.thumbnail : '',
      runtime: null, ids: {},
    });
  }
  return out;
}

/**
 * Returns [{number, title, episodes:[{season, number, title, overview, aired, thumbnail, runtime, ids}]}]
 * Uses Trakt seasons (authoritative numbering) when available, Cinemeta otherwise, merged together.
 */
export async function seasonsFor(item, trakt) {
  const byKey = new Map();
  let traktSeasons = null;
  if (trakt?.hasClient() && (item.ids?.trakt || item.ids?.slug || item.ids?.imdb)) {
    try { traktSeasons = await trakt.seasons(item.ids.trakt || item.ids.slug || item.ids.imdb); } catch (e) { console.warn('Trakt seasons failed', e); }
  }
  if (traktSeasons) {
    for (const s of traktSeasons) for (const e of s.episodes || []) {
      byKey.set(`${e.season}:${e.number}`, {
        season: e.season, number: e.number, title: e.title || '', overview: e.overview || '',
        aired: e.first_aired || '', runtime: e.runtime || null, ids: e.ids || {}, thumbnail: '',
      });
    }
  }
  const meta = await cinemetaMeta('show', item.ids?.imdb);
  for (const e of cmEpisodes(meta)) {
    const k = `${e.season}:${e.number}`;
    const existing = byKey.get(k);
    if (existing) {
      if (!existing.thumbnail) existing.thumbnail = e.thumbnail;
      if (!existing.overview) existing.overview = e.overview;
      if (!existing.title) existing.title = e.title;
      if (!existing.aired) existing.aired = e.aired;
    } else if (!traktSeasons) byKey.set(k, e);
  }
  const seasons = new Map();
  for (const e of byKey.values()) {
    if (!seasons.has(e.season)) seasons.set(e.season, []);
    seasons.get(e.season).push(e);
  }
  return [...seasons.entries()]
    .sort(([a], [b]) => (a === 0) - (b === 0) || a - b)
    .map(([number, eps]) => ({ number, title: number === 0 ? 'Specials' : `Season ${number}`, episodes: eps.sort((a, b) => a.number - b.number) }));
}

/* ---------- Filename parsing (cloud files) ---------- */
const JUNK = /\b(2160p|1080p|720p|576p|480p|4k|uhd|hdr10\+?|hdr|dv|dolby ?vision|bluray|blu-ray|bdrip|brrip|webrip|web-?dl|web|hdtv|dvdrip|remux|x264|x265|h\.?264|h\.?265|hevc|avc|aac\d?(\.\d)?|ac3|eac3|ddp?\d?(\.\d)?|dts(-hd)?|truehd|atmos|10bit|proper|repack|extended|unrated|imax|internal|multi|subbed|dubbed)\b/ig;

export function parseRelease(name) {
  const raw = String(name || '').split('/').pop();
  const base = raw.replace(/\.(mkv|mp4|avi|m4v|mov|webm|ts|wmv)$/i, '');
  const clean = base.replace(/[._]+/g, ' ').replace(/\s+/g, ' ').trim();
  const ep = clean.match(/\bS(\d{1,2})\s?E(\d{1,3})(?:\s?-?\s?E?(\d{1,3}))?\b/i) || clean.match(/\b(\d{1,2})x(\d{2,3})\b/);
  const seasonOnly = !ep && (clean.match(/\bS(\d{1,2})\b(?!\s?E\d)/i) || clean.match(/\bSeason\s?(\d{1,2})\b/i));
  const yearM = clean.match(/[\[( ]((?:19|20)\d{2})[\]) ]?/);
  let cut = clean.length;
  for (const m of [ep, seasonOnly, yearM]) if (m && m.index < cut && m.index > 0) cut = m.index;
  let title = clean.slice(0, cut).replace(JUNK, ' ').replace(/[\[\]()-]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!title) title = clean.replace(JUNK, ' ').trim();
  const res = quality(raw);
  return {
    title,
    year: yearM ? Number(yearM[1]) : null,
    season: ep ? Number(ep[1]) : seasonOnly ? Number(seasonOnly[1]) : null,
    episode: ep ? Number(ep[2]) : null,
    episodeEnd: ep && ep[3] ? Number(ep[3]) : null,
    isPack: !!seasonOnly || /\bcomplete\b/i.test(clean),
    type: ep || seasonOnly ? 'show' : 'movie',
    quality: res,
  };
}

export function quality(text) {
  const s = String(text || '');
  if (/\b(2160p|4k|uhd)\b/i.test(s)) return '4K';
  if (/\b1080[pi]\b/i.test(s)) return '1080p';
  if (/\b720p\b/i.test(s)) return '720p';
  if (/\b(480p|576p|sd|dvdrip)\b/i.test(s)) return 'SD';
  return '';
}

export const norm = s => String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').replace(/\b(the|a|an)\b/g, ' ').replace(/\s+/g, ' ').trim();

export function fmtRuntime(min) {
  if (!min) return '';
  const h = Math.floor(min / 60), m = min % 60;
  return h ? `${h}h${m ? ' ' + m + 'm' : ''}` : `${m}m`;
}
export function fmtTime(sec) {
  sec = Math.max(0, Math.floor(sec || 0));
  const h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), s = sec % 60;
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}
export function fmtBytes(n) {
  n = Number(n);
  if (!Number.isFinite(n) || n <= 0) return '';
  const u = ['B', 'KB', 'MB', 'GB', 'TB']; let i = 0;
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(n >= 10 || i < 3 ? 0 : 1)} ${u[i]}`;
}
export function fmtDate(d, opts = { month: 'short', day: 'numeric', year: 'numeric' }) {
  if (!d) return '';
  const date = new Date(d);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString(undefined, opts);
}
