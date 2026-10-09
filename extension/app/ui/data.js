/* Beacon Hub 1.0 — builds the content for every poster row from Trakt, Cinemeta, Premiumize and local history. */
'use strict';
import { trakt } from '../lib/trakt.js';
import { pm } from '../lib/premiumize.js';
import { history, contentId } from '../lib/history.js';
import { cinemetaCatalog, keyOf, seasonsFor, withArt, epCode } from '../lib/meta.js';
import { prefs } from '../lib/store.js';

const year = new Date().getFullYear();
export const interleave = (a, b) => { const out = []; for (let i = 0; i < Math.max(a.length, b.length); i++) { if (a[i]) out.push(a[i]); if (b[i]) out.push(b[i]); } return out; };
const poster = item => ({ item });

/* ---------- Continue Watching (local + Trakt playback) ---------- */
export function continueWatching(type = null) {
  const hidden = new Set(prefs().hiddenPlayback || []);
  const out = new Map();
  for (const r of history.inProgress()) {
    if (!r.item) continue;
    const item = withArt({ ...r.item });
    const ep = r.kind === 'episode' ? { season: r.season, number: r.episode, title: r.epTitle } : null;
    out.set(r.id, { item, episode: ep, progress: r.duration ? r.position / r.duration : 0, when: r.updated, local: r, wide: true });
  }
  for (const p of trakt.data.playback || []) {
    if (hidden.has(p.id)) continue;
    const ep = p.episode ? { season: p.episode.season, number: p.episode.number, title: p.episode.title, ids: p.episode.ids } : null;
    const id = contentId(p.item, ep);
    const when = Date.parse(p.paused_at) || 0;
    const existing = out.get(id);
    if (existing && existing.when >= when) { existing.traktPlayback = p; continue; }
    out.set(id, { item: p.item, episode: ep, progress: (p.progress || 0) / 100, when, traktPlayback: p, wide: true, local: existing?.local });
  }
  let list = [...out.values()].filter(e => e.progress < 0.94).sort((a, b) => b.when - a.when);
  if (type) list = list.filter(e => e.item.type === type);
  return list.slice(0, 30);
}

/* ---------- Up Next ---------- */
export async function upNext() {
  if (trakt.connected()) {
    return trakt.data.upNext.filter(u => u.episode && (!u.episode.first_aired || Date.parse(u.episode.first_aired) <= Date.now()))
      .map(u => ({ item: u.item, episode: { season: u.episode.season, number: u.episode.number, title: u.episode.title, ids: u.episode.ids }, wide: true, sub: `${epCode(u.episode.season, u.episode.number)}${u.episode.title ? ' · ' + u.episode.title : ''}`, upNext: true }));
  }
  // Local fallback: next episode after the latest completed one per show (metadata confirmed).
  const latest = new Map();
  for (const r of history.completedEpisodes()) {
    const k = keyOf(r.item);
    if (!latest.has(k) || latest.get(k).updated < r.updated) latest.set(k, r);
  }
  const out = [];
  for (const r of [...latest.values()].sort((a, b) => b.updated - a.updated).slice(0, 8)) {
    try {
      const seasons = await seasonsFor(r.item, trakt);
      const eps = seasons.filter(s => s.number > 0).flatMap(s => s.episodes);
      const i = eps.findIndex(e => e.season === r.season && e.number === r.episode);
      const next = i >= 0 ? eps[i + 1] : null;
      if (next && (!next.aired || Date.parse(next.aired) <= Date.now()) && !history.watched(r.item, next))
        out.push({ item: withArt({ ...r.item }), episode: next, wide: true, sub: `${epCode(next.season, next.number)}${next.title ? ' · ' + next.title : ''}`, upNext: true });
    } catch {}
  }
  return out;
}

/* ---------- Trakt rows ---------- */
export const watchlist = (type = null) => {
  const w = trakt.data.watchlist;
  const all = type === 'movie' ? w.movies : type === 'show' ? w.shows : [...w.movies, ...w.shows].sort((a, b) => String(b.listedAt || '').localeCompare(String(a.listedAt || '')));
  return all.map(poster);
};
export function myLists(type = null, { includeLiked = false } = {}) {
  const lists = [...trakt.data.lists, ...(includeLiked ? trakt.data.liked : [])];
  return lists.map(l => ({ list: l, entries: l.items.filter(x => !type || x.item.type === type).map(x => ({ item: x.item })) }))
    .filter(x => x.entries.length);
}
export const likedLists = () => trakt.data.liked.map(l => ({ list: l, entries: l.items.map(x => ({ item: x.item })) })).filter(x => x.entries.length);

export function watchedMovies() {
  return Object.values(trakt.data.watchedMovies).sort((a, b) => String(b.last).localeCompare(String(a.last))).map(w => ({ item: w.item, watched: true }));
}
export function watchedShows() {
  return Object.values(trakt.data.watchedShows).sort((a, b) => String(b.last).localeCompare(String(a.last))).map(w => ({ item: w.item, sub: `${w.eps.length} episode${w.eps.length === 1 ? '' : 's'} watched` }));
}
export function recentlyWatched() {
  const out = new Map();
  for (const h of trakt.data.history || []) {
    const ep = h.episode ? { season: h.episode.season, number: h.episode.number, title: h.episode.title } : null;
    const id = contentId(h.item, ep);
    if (!out.has(id)) out.set(id, { item: h.item, episode: ep, when: Date.parse(h.watched_at) || 0, wide: true, watched: true, sub: ep ? `${epCode(ep.season, ep.number)}${ep.title ? ' · ' + ep.title : ''}` : 'Watched' });
  }
  for (const r of history.all().filter(r => r.v === 4 && r.completed)) {
    const ep = r.kind === 'episode' ? { season: r.season, number: r.episode, title: r.epTitle } : null;
    if (!out.has(r.id)) out.set(r.id, { item: withArt({ ...r.item }), episode: ep, when: r.updated, wide: true, watched: true, sub: ep ? `${epCode(ep.season, ep.number)}${ep.title ? ' · ' + ep.title : ''}` : 'Watched' });
  }
  return [...out.values()].sort((a, b) => b.when - a.when).slice(0, 40);
}
export function upcoming() {
  return (trakt.data.calendar || []).filter(c => Date.parse(c.first_aired) > Date.now() - 6 * 3600e3).map(c => ({
    item: c.item, episode: { season: c.episode.season, number: c.episode.number, title: c.episode.title }, wide: true,
    sub: `${epCode(c.episode.season, c.episode.number)} · ${new Date(c.first_aired).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}`, upcoming: c.first_aired,
  }));
}
export const recommended = (type = null) => {
  const r = trakt.data.recommended;
  return (type === 'movie' ? r.movies : type === 'show' ? r.shows : interleave(r.movies, r.shows)).map(poster);
};

/* ---------- Discovery (Trakt public with Client ID, Cinemeta otherwise) ---------- */
export async function discover(kind, type) {
  if (trakt.hasClient()) {
    try {
      if (kind === 'recent') return (await trakt.recentlyReleased(type)).map(poster);
      return (await trakt.catalog(kind, type, 30)).map(poster);
    } catch (e) { console.warn('Trakt discovery failed, falling back to Cinemeta', e); }
  }
  const map = { trending: ['top', ''], popular: ['imdbRating', ''], recent: ['year', `genre=${year}`], anticipated: ['year', `genre=${year + 1}`] };
  const [id, extra] = map[kind] || map.trending;
  return (await cinemetaCatalog(type, id, extra)).map(poster);
}
export async function recentlyReleasedMixed() {
  const [m, s] = await Promise.all([discover('recent', 'movie').catch(() => []), discover('recent', 'show').catch(() => [])]);
  return interleave(m, s);
}

/* ---------- Premiumize ---------- */
export function premiumizeRow(type = null) {
  if (!pm.connected()) return [];
  const lib = pm.library();
  const groups = type === 'movie' ? lib.movies : type === 'show' ? lib.shows : [...lib.movies, ...lib.shows].sort((a, b) => b.newest - a.newest);
  return groups.slice(0, 40).map(g => g.match
    ? { item: withArt({ ...g.match }), cloud: true, group: g }
    : { item: { type: g.kind, title: g.title, year: g.year, ids: {}, _unmatched: true }, cloud: true, group: g });
}

/* ---------- Watched / progress decoration ---------- */
export function decorate(entry) {
  const { item, episode } = entry;
  if (entry.watched == null) {
    if (item.type === 'movie') entry.watched = trakt.movieWatched(item) || history.watched(item, null);
    else if (episode) entry.watched = trakt.episodeWatched(item, episode.season, episode.number) || history.watched(item, episode);
  }
  if (entry.progress == null && item.type === 'movie') {
    const r = history.get(contentId(item, null));
    if (r && !r.completed && r.duration) entry.progress = r.position / r.duration;
  }
  if (item.type === 'show' && !episode && entry.sub == null) {
    const n = trakt.watchedEpisodeCount(item);
    if (n && item.airedEpisodes) entry.showProgress = Math.min(1, n / item.airedEpisodes);
  }
  return entry;
}

/* ---------- What should "Play" do for a title? ---------- */
export async function playTarget(item) {
  if (item.type === 'movie') {
    let resumeAt = history.resumeAt(item, null);
    const tp = (trakt.data.playback || []).find(p => p.type === 'movie' && keyOf(p.item) === keyOf(item));
    return { episode: null, resumeAt, resumePct: !resumeAt && tp ? tp.progress : 0, label: resumeAt || tp ? 'Resume' : 'Play' };
  }
  const k = keyOf(item);
  const local = history.inProgress().filter(r => r.kind === 'episode' && r.item && keyOf(r.item) === k).sort((a, b) => b.updated - a.updated)[0];
  const tp = (trakt.data.playback || []).filter(p => p.episode && keyOf(p.item) === k).sort((a, b) => String(b.paused_at).localeCompare(String(a.paused_at)))[0];
  if (local && (!tp || local.updated >= Date.parse(tp.paused_at))) {
    const ep = { season: local.season, number: local.episode, title: local.epTitle };
    return { episode: ep, resumeAt: history.resumeAt(item, ep), label: `Resume ${epCode(ep.season, ep.number)}` };
  }
  if (tp) { const ep = { season: tp.episode.season, number: tp.episode.number, title: tp.episode.title }; return { episode: ep, resumeAt: 0, resumePct: tp.progress, label: `Resume ${epCode(ep.season, ep.number)}` }; }
  const un = (trakt.data.upNext || []).find(u => keyOf(u.item) === k);
  if (un?.episode) return { episode: { season: un.episode.season, number: un.episode.number, title: un.episode.title }, resumeAt: 0, label: `Play ${epCode(un.episode.season, un.episode.number)}` };
  try {
    const seasons = await seasonsFor(item, trakt);
    const eps = seasons.filter(s => s.number > 0).flatMap(s => s.episodes);
    const watched = e => trakt.episodeWatched(item, e.season, e.number) || history.watched(item, e);
    let lastIdx = -1; eps.forEach((e, i) => { if (watched(e)) lastIdx = i; });
    const next = eps[lastIdx + 1] && (!eps[lastIdx + 1].aired || Date.parse(eps[lastIdx + 1].aired) <= Date.now()) ? eps[lastIdx + 1] : (lastIdx < 0 ? eps[0] : null);
    if (next) return { episode: next, resumeAt: 0, label: `${lastIdx >= 0 ? 'Next' : 'Play'} ${epCode(next.season, next.number)}`, seasons };
    return { episode: null, label: 'Episodes', seasons };
  } catch { return { episode: null, label: 'Episodes' }; }
}
