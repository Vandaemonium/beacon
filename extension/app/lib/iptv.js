/* Beacon Hub 1.1 — IPTV (Xtream Codes API) client for the new Live TV screen.
 * Uses exactly the same saved login, favorites, recent channels and hidden categories as the
 * classic Live TV page (index.html / app.js), so nothing has to be set up twice.
 * All requests go straight from this browser to your provider, so a browser VPN extension can cover them
 * (Settings › Connection & VPN confirms it).
 */
'use strict';
import { cache, emit } from './store.js';

const ACCOUNT = 'beacon:web:account';
const norm = v => String(v || '').trim().replace(/\/+$/, '');
const sleep = ms => new Promise(r => setTimeout(r, ms));

function decode64(v) { try { return decodeURIComponent(escape(atob(v || ''))); } catch { return v || ''; } }

export const iptv = {
  account: null, categories: [], channels: [], loadedAt: 0, error: '',
  prefs: { favorites: [], recent: [], hiddenLiveCategories: [], hiddenMovieCategories: [], hiddenSeriesCategories: [] },
  epg: new Map(),

  load() {
    const raw = sessionStorage.getItem(ACCOUNT) || localStorage.getItem(ACCOUNT);
    try { iptv.account = raw ? JSON.parse(raw) : null; } catch { iptv.account = null; }
    iptv.loadPrefs();
    return iptv;
  },
  signedIn: () => !!iptv.account?.server,
  remember: () => localStorage.getItem('beacon:web:remember') === '1',

  /** Same ID formula as app.js so favorites / recents are shared with the classic page. */
  accountId() {
    const a = iptv.account;
    return a ? btoa(unescape(encodeURIComponent(`${a.server}\n${a.username}`))).replace(/[^a-z0-9]/gi, '').slice(0, 40) : 'none';
  },
  prefKey: () => `beacon:web:prefs:${iptv.accountId()}`,
  loadPrefs() {
    const base = { favorites: [], recent: [], hiddenLiveCategories: [], hiddenMovieCategories: [], hiddenSeriesCategories: [] };
    try { iptv.prefs = { ...base, ...JSON.parse(localStorage.getItem(iptv.prefKey()) || '{}') }; } catch { iptv.prefs = base; }
  },
  savePrefs() { localStorage.setItem(iptv.prefKey(), JSON.stringify(iptv.prefs)); emit('iptv:prefs'); },

  url(action = '', params = {}) {
    const a = iptv.account;
    const u = new URL(`${a.server}/player_api.php`);
    u.searchParams.set('username', a.username); u.searchParams.set('password', a.password);
    if (action) u.searchParams.set('action', action);
    for (const [k, v] of Object.entries(params)) u.searchParams.set(k, String(v));
    return u;
  },
  async api(action = '', params = {}, timeout = 25000) {
    let r;
    try { r = await fetch(iptv.url(action, params), { signal: AbortSignal.timeout(timeout), cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer' }); }
    catch (e) {
      if (e?.name === 'TimeoutError') throw new Error('Your provider took too long to respond.');
      throw new Error('Couldn’t reach your IPTV provider. Check the server address and that your browser VPN is connected.');
    }
    if (!r.ok) throw new Error(`Provider returned HTTP ${r.status}`);
    return r.json();
  },

  async signIn({ server, username, password }, remember) {
    const account = { server: norm(server), username: String(username || '').trim(), password: String(password || '') };
    if (!/^https?:\/\//i.test(account.server)) throw new Error('Server URL must start with http:// or https://');
    if (!account.username || !account.password) throw new Error('Username and password are required.');
    const prev = iptv.account;
    iptv.account = account;
    try {
      const res = await iptv.api('', {}, 20000);
      if (String(res?.user_info?.auth) !== '1') throw new Error('Your provider rejected that login.');
      iptv.info = res.user_info;
    } catch (e) { iptv.account = prev; throw e; }
    const payload = JSON.stringify(account);
    if (remember) { localStorage.setItem(ACCOUNT, payload); sessionStorage.removeItem(ACCOUNT); }
    else { sessionStorage.setItem(ACCOUNT, payload); localStorage.removeItem(ACCOUNT); }
    localStorage.setItem('beacon:web:remember', remember ? '1' : '0');
    iptv.loadPrefs();
    iptv.channels = []; iptv.categories = []; iptv.loadedAt = 0; iptv.epg.clear();
    emit('iptv:status');
    return account;
  },
  signOut() {
    localStorage.removeItem(ACCOUNT); sessionStorage.removeItem(ACCOUNT);
    iptv.account = null; iptv.channels = []; iptv.categories = []; iptv.loadedAt = 0; iptv.epg.clear();
    emit('iptv:status');
  },

  cacheKey: () => 'iptv:live:' + iptv.accountId(),
  /** Loads categories + channels; uses a 6-hour cache so the screen opens instantly. */
  async refresh(force = false) {
    if (!iptv.signedIn()) return;
    if (!force && iptv.channels.length && Date.now() - iptv.loadedAt < 6 * 3600e3) return;
    if (!force && !iptv.channels.length) {
      const c = await cache.get(iptv.cacheKey());
      if (c?.data?.channels?.length) {
        Object.assign(iptv, { categories: c.data.categories, channels: c.data.channels, loadedAt: c.at });
        emit('iptv:data');
        if (Date.now() - c.at < 6 * 3600e3) return;
      }
    }
    try {
      const [cats, streams] = await Promise.all([iptv.api('get_live_categories'), iptv.api('get_live_streams', {}, 60000)]);
      iptv.categories = (Array.isArray(cats) ? cats : []).map(c => ({ id: String(c.category_id), name: String(c.category_name || 'Other') }));
      iptv.channels = (Array.isArray(streams) ? streams : []).map(s => ({
        id: String(s.stream_id), name: String(s.name || 'Channel').trim(), logo: /^https?:\/\//i.test(s.stream_icon || '') ? s.stream_icon : '',
        cat: String(s.category_id ?? ''), num: Number(s.num) || 0, epgId: s.epg_channel_id || '', archive: !!Number(s.tv_archive),
      }));
      iptv.loadedAt = Date.now(); iptv.error = '';
      await cache.set(iptv.cacheKey(), { at: iptv.loadedAt, data: { categories: iptv.categories, channels: iptv.channels } });
    } catch (e) { iptv.error = e.message; if (!iptv.channels.length) throw e; }
    emit('iptv:data');
  },

  visibleCategories() {
    const hidden = new Set((iptv.prefs.hiddenLiveCategories || []).map(String));
    return iptv.categories.filter(c => !hidden.has(c.id));
  },
  visibleChannels() {
    const hidden = new Set((iptv.prefs.hiddenLiveCategories || []).map(String));
    return iptv.channels.filter(c => !hidden.has(c.cat));
  },
  byId(id) { return iptv.channels.find(c => c.id === String(id)) || null; },
  isFav: ch => iptv.prefs.favorites.includes(`live:${ch.id}`),
  toggleFav(ch) {
    const key = `live:${ch.id}`;
    iptv.prefs.favorites = iptv.prefs.favorites.includes(key) ? iptv.prefs.favorites.filter(x => x !== key) : [key, ...iptv.prefs.favorites];
    iptv.savePrefs();
    return iptv.isFav(ch);
  },
  favorites() { return iptv.prefs.favorites.filter(k => k.startsWith('live:')).map(k => iptv.byId(k.slice(5))).filter(Boolean); },
  recent() { return (iptv.prefs.recent || []).map(id => iptv.byId(id)).filter(Boolean); },
  markWatched(ch) {
    iptv.prefs.recent = [ch.id, ...(iptv.prefs.recent || []).map(String).filter(x => x !== ch.id)].slice(0, 50);
    iptv.savePrefs();
  },
  setCategoryHidden(id, hide) {
    const set = new Set((iptv.prefs.hiddenLiveCategories || []).map(String));
    if (hide) set.add(String(id)); else set.delete(String(id));
    iptv.prefs.hiddenLiveCategories = [...set];
    iptv.savePrefs();
  },

  streamUrl(ch) {
    const a = iptv.account;
    return `${a.server}/live/${encodeURIComponent(a.username)}/${encodeURIComponent(a.password)}/${ch.id}.m3u8`;
  },

  /* ---------- EPG (now / next), fetched lazily with limited concurrency ---------- */
  _queue: [], _active: 0,
  guide(ch) {
    const hit = iptv.epg.get(ch.id);
    if (hit && (Date.now() - hit.at < 10 * 60e3) && (!hit.list[0] || hit.list[0].end > Date.now())) return Promise.resolve(hit.list);
    if (hit?.pending) return hit.pending;
    const pending = new Promise(resolve => { iptv._queue.push({ ch, resolve }); iptv._pump(); });
    iptv.epg.set(ch.id, { ...(hit || {}), pending, list: hit?.list || [], at: hit?.at || 0 });
    return pending;
  },
  async _pump() {
    while (iptv._active < 4 && iptv._queue.length) {
      const { ch, resolve } = iptv._queue.shift();
      iptv._active++;
      (async () => {
        let list = [];
        try {
          const d = await iptv.api('get_short_epg', { stream_id: ch.id, limit: 3 }, 12000);
          list = (d?.epg_listings || []).map(x => {
            const start = Number(x.start_timestamp) * 1000 || Date.parse(String(x.start || '').replace(' ', 'T')) || 0;
            const end = Number(x.stop_timestamp) * 1000 || Date.parse(String(x.end || x.stop || '').replace(' ', 'T')) || 0;
            return { title: decode64(x.title) || 'Program', desc: decode64(x.description), start, end };
          }).filter(p => !p.end || p.end > Date.now()).slice(0, 2);
        } catch { list = []; }
        iptv.epg.set(ch.id, { list, at: Date.now() });
        resolve(list);
        iptv._active--;
        await sleep(30);
        iptv._pump();
      })();
    }
  },
};

export const fmtClock = t => t ? new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '';
export const progressOf = p => p?.start && p?.end ? Math.min(1, Math.max(0, (Date.now() - p.start) / (p.end - p.start))) : 0;
