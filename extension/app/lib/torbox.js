/* Beacon Hub 1.0 TorBox helper — keeps the TorBox support from Beacon 2.x/3.x available in the new UI. */
'use strict';
import { hubKey, fetchJson } from './store.js';
import { parseRelease, norm } from './meta.js';

const BASE = 'https://api.torbox.app/v1/api/';
const VIDEO = /\.(mkv|mp4|avi|m4v|mov|webm|ts)$/i;

async function tb(path, { query = {}, method = 'GET', body } = {}) {
  const key = hubKey('torbox');
  if (!key) throw new Error('Connect TorBox in Settings');
  const u = new URL(BASE + path);
  for (const [k, v] of Object.entries(query)) u.searchParams.set(k, String(v));
  if (path === 'torrents/requestdl') u.searchParams.set('token', key);
  const { body: data } = await fetchJson(u.href, { method, headers: { Authorization: 'Bearer ' + key }, body }, 25000);
  if (data?.success === false) throw new Error(data.detail || data.error || 'TorBox request failed');
  return data?.data;
}

export const torbox = {
  list: [], loadedAt: 0,
  connected: () => !!hubKey('torbox'),
  async refresh(force = false) {
    if (!torbox.connected()) return [];
    if (!force && Date.now() - torbox.loadedAt < 5 * 60e3) return torbox.list;
    const data = await tb('torrents/mylist', { query: { limit: 200 } });
    torbox.list = Array.isArray(data) ? data : [];
    torbox.loadedAt = Date.now();
    return torbox.list;
  },
  filesFor(item, season, episode) {
    const t = norm(item.title); const out = [];
    for (const tor of torbox.list) {
      if (!['cached', 'completed', 'uploading', 'seeding'].includes(tor.download_state) && !tor.download_finished) continue;
      for (const f of tor.files || []) {
        const name = f.short_name || f.name || '';
        if (!VIDEO.test(name)) continue;
        const p = parseRelease(name);
        if (norm(p.title) !== t) continue;
        if (item.type === 'movie' ? p.type !== 'movie' : (p.season !== season || p.episode !== episode)) continue;
        out.push({ torrentId: tor.id, fileId: f.id, name, size: f.size, parsed: p });
      }
    }
    return out;
  },
  async link(torrentId, fileId) {
    const d = await tb('torrents/requestdl', { query: { torrent_id: torrentId, file_id: fileId } });
    const url = typeof d === 'string' ? d : d?.url || d?.link;
    if (!url) throw new Error('TorBox did not return a link');
    return url;
  },
  async add(magnet) {
    const fd = new FormData(); fd.append('magnet', magnet);
    return tb('torrents/createtorrent', { method: 'POST', body: fd });
  },
  /** Add a magnet and, if TorBox has it cached, return a playable file link. */
  async instant(magnet, pickFile) {
    const res = await torbox.add(magnet);
    const id = res?.torrent_id;
    if (id == null) throw new Error('TorBox did not return a torrent ID');
    for (let i = 0; i < 4; i++) {
      const data = await tb('torrents/mylist', { query: { id } });
      const tor = Array.isArray(data) ? data.find(x => String(x.id) === String(id)) : data;
      const files = (tor?.files || []).filter(f => VIDEO.test(f.short_name || f.name || ''));
      if (files.length && (tor.download_finished || ['cached', 'completed', 'uploading', 'seeding'].includes(tor.download_state))) {
        const f = pickFile(files.map(x => ({ ...x, path: x.short_name || x.name })));
        return torbox.link(id, f.id);
      }
      await new Promise(r => setTimeout(r, 1500));
    }
    throw new Error('Added to TorBox — not cached yet. It will appear in your TorBox cloud when the download finishes.');
  },
};
