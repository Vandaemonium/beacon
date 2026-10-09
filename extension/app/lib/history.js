/* Beacon Hub 1.0 local watch history / resume positions.
 * Uses the same storage key as Beacon 3.x (beacon:media:history:v1) so the old Media Hub
 * history page keeps working; 4.0 records add structured fields alongside the old ones.
 */
'use strict';
import { keyOf, epCode } from './meta.js';
import { emit } from './store.js';

const KEY = 'beacon:media:history:v1';
const MAX = 300;

function read() { try { const v = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; } }
function write(list) { localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX))); emit('history'); }

export function contentId(item, ep) {
  if (!item) return '';
  if (item.type === 'movie') return keyOf(item);
  return `episode:${keyOf(item).replace(/^show:/, '')}:${ep.season}:${ep.number}`;
}
const slim = item => ({ type: item.type, title: item.title, year: item.year, ids: item.ids, poster: item.poster || '', backdrop: item.backdrop || '', logo: item.logo || '' });

export const history = {
  all: read,
  get: id => read().find(r => r.id === id) || null,

  update(item, ep, { position, duration, url, source, completed, sourceInfo } = {}) {
    const id = contentId(item, ep);
    const list = read();
    const old = list.find(r => r.id === id) || {};
    const rec = {
      ...old, id, v: 4,
      kind: item.type === 'movie' ? 'movie' : 'episode',
      title: item.type === 'movie' ? item.title : `${item.title} · ${epCode(ep.season, ep.number)}${ep.title ? ' · ' + ep.title : ''}`,
      item: slim(item),
      season: ep?.season ?? null, episode: ep?.number ?? null, epTitle: ep?.title || '',
      source: source ?? old.source ?? '',
      url: typeof url === 'string' && url.startsWith('https://') ? url : (old.url || ''),
      position: Number.isFinite(position) ? position : (old.position || 0),
      duration: Number.isFinite(duration) && duration > 0 ? duration : (old.duration || 0),
      completed: completed ?? old.completed ?? false,
      sourceInfo: sourceInfo || old.sourceInfo || null,
      updated: Date.now(),
    };
    write([rec, ...list.filter(r => r.id !== id)]);
    return rec;
  },

  remove(id) { write(read().filter(r => r.id !== id)); },
  clear() { write([]); },

  /** Seconds to resume from, or 0. */
  resumeAt(item, ep) {
    const r = history.get(contentId(item, ep));
    if (!r || r.completed || (r.position || 0) < 30) return 0;
    if (r.duration && (r.duration - r.position < 90 || r.position / r.duration > 0.94)) return 0;
    return Math.floor(r.position);
  },
  inProgress() {
    return read().filter(r => r.v === 4 && !r.completed && r.position >= 30 && (!r.duration || r.position / r.duration < 0.94));
  },
  /** legacy (3.x) records that only have a direct URL */
  legacy() { return read().filter(r => r.v !== 4 && r.url && r.position >= 30); },
  watched(item, ep) { const r = history.get(contentId(item, ep)); return !!r?.completed; },
  completedEpisodes() { return read().filter(r => r.v === 4 && r.kind === 'episode' && r.completed); },
};
