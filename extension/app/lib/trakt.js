/* Beacon Hub 1.0 Trakt client (official API v2).
 * Auth: OAuth device-code flow — no password is ever entered into Beacon.
 * Tokens live in chrome.storage.local (extension-private) and refresh automatically.
 * Your own Trakt API app's Client ID / Secret are entered in Settings — nothing is hard-coded.
 */
'use strict';
import { cache, secrets, fetchJson, emit } from './store.js';
import { fromTrakt, unwrapTrakt, keyOf } from './meta.js';

export const API = 'https://api.trakt.tv';
// The extension returns to its chromiumapp.org address; the website returns to its own beacon.html.
// Both must be listed under the Trakt app's Redirect URIs.
const hasIdentity = () => typeof chrome !== 'undefined' && !!chrome?.identity?.launchWebAuthFlow;
const REDIRECT = () => hasIdentity() ? chrome.identity.getRedirectURL() : location.origin + '/beacon.html';
const PKCE_KEY = 'beacon:trakt:pkce';
const CLIENT_ID = 'oMs5Elo0Jyxv0-WhaSpYULdKwsjHDopq1DuINOs96qA';
const base64url = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
const DATA_KEY = 'trakt:data:v1';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const today = (offsetDays = 0) => new Date(Date.now() + offsetDays * 864e5).toISOString().slice(0, 10);

const clean = it => { const { _cm, ...rest } = it || {}; return rest; };
function idsBody(item) {
  const ids = {};
  for (const k of ['trakt', 'slug', 'imdb', 'tmdb', 'tvdb']) if (item?.ids?.[k]) ids[k] = item.ids[k];
  return { ids };
}

const emptyData = () => ({
  watchlist: { movies: [], shows: [] },
  lists: [], liked: [],
  watchedMovies: {},      // key -> {plays, last}
  watchedShows: {},       // key -> {item, last, plays, eps:[ 's:e', ...]}
  playback: [], history: [], ratings: {}, recommended: { movies: [], shows: [] },
  upNext: [], calendar: [], progress: {},
  acts: {}, lastSync: 0,
});

class TraktClient {
  constructor() {
    this.config = null; this.tokens = null; this.user = null;
    this.data = emptyData();
    this._refreshing = null; this._syncing = null;
  }

  async load() {
    this.config = await secrets.get('trakt:config') || { clientId: CLIENT_ID };
    if (!this.config.clientId) this.config.clientId = CLIENT_ID;
    delete this.config.clientSecret;
    this.tokens = await secrets.get('trakt:tokens');
    this.needsReconnect = !!(await secrets.get('trakt:needsReconnect'));
    this.user = await cache.get('trakt:user');
    const d = await cache.get(DATA_KEY);
    if (d) this.data = { ...emptyData(), ...d };
    return this;
  }
  hasClient() { return !!this.config?.clientId; }
  /** Trakt rejected the saved session (revoked access, expired refresh token). Keep data, ask the user to reconnect. */
  async markExpired(reason = '') {
    if (this.needsReconnect) return;
    this.needsReconnect = true;
    await secrets.set('trakt:needsReconnect', { at: Date.now(), reason: String(reason).slice(0, 200) });
    emit('trakt:status');
  }
  async clearExpired() {
    if (!this.needsReconnect) return;
    this.needsReconnect = false;
    await secrets.del('trakt:needsReconnect');
    emit('trakt:status');
  }
  connected() { return !!(this.config?.clientId && this.tokens?.access_token); }

  async saveConfig(clientId) {
    this.config = { clientId: String(clientId || CLIENT_ID).trim() };
    await secrets.set('trakt:config', this.config);
    emit('trakt:status');
  }

  headers(auth) {
    const h = { 'Content-Type': 'application/json', 'trakt-api-version': '2', 'trakt-api-key': this.config.clientId };
    if (auth && this.tokens?.access_token) h.Authorization = 'Bearer ' + this.tokens.access_token;
    return h;
  }

  async request(path, { method = 'GET', body, auth = false, retry = true } = {}) {
    if (!this.hasClient()) throw new Error('Trakt is not configured');
    if (auth) {
      if (!this.tokens?.access_token) throw new Error('Connect your Trakt account in Settings');
      await this.ensureFresh();
    }
    const url = path.startsWith('http') ? path : API + path;
    try {
      const { body: data, headers } = await fetchJson(url, { method, headers: this.headers(auth), body: body ? JSON.stringify(body) : undefined }, 25000);
      return { data, headers };
    } catch (e) {
      if (e.status === 401 && auth && retry && this.tokens?.refresh_token) {
        await this.refresh(true);
        return this.request(path, { method, body, auth, retry: false });
      }
      // Still unauthorized after a successful token refresh: the session itself is no longer valid.
      if (e.status === 401 && auth && !retry) await this.markExpired('Trakt rejected the access token');
      if (e.status === 429 && retry) {
        const wait = Math.min(15, Number(e.headers?.get('Retry-After')) || 2);
        await sleep(wait * 1000);
        return this.request(path, { method, body, auth, retry: false });
      }
      throw e;
    }
  }
  async get(path, auth = false) { return (await this.request(path, { auth })).data; }

  redirectUrl() { return REDIRECT(); }

  /* ---------- OAuth 2.0 / PKCE: Chrome Identity in the extension, a page redirect on the web ---------- */
  async connectPKCE() {
    if (!this.hasClient()) await this.saveConfig(CLIENT_ID);
    const verifier = base64url(crypto.getRandomValues(new Uint8Array(48)));
    const challenge = base64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
    const state = base64url(crypto.getRandomValues(new Uint8Array(24)));
    const redirect = REDIRECT();
    const auth = new URL('https://auth.trakt.tv/oauth/authorize');
    for (const [k,v] of Object.entries({ response_type:'code', client_id:this.config.clientId,
      redirect_uri:redirect, state, code_challenge:challenge, code_challenge_method:'S256' })) auth.searchParams.set(k,v);
    if (!hasIdentity()) {
      // Website: leave for Trakt; completeRedirect() finishes when Trakt sends the browser back.
      sessionStorage.setItem(PKCE_KEY, JSON.stringify({ verifier, state, back: location.hash }));
      location.assign(auth.toString());
      return new Promise(() => {});
    }
    const responseUrl = await chrome.identity.launchWebAuthFlow({ url:auth.toString(), interactive:true });
    if (!responseUrl) throw new Error('Trakt authorization was cancelled');
    const callback = new URL(responseUrl);
    if (callback.origin !== new URL(redirect).origin || callback.pathname !== new URL(redirect).pathname) throw new Error('Unexpected Trakt redirect');
    if (callback.searchParams.get('state') !== state) throw new Error('Trakt authorization state mismatch');
    if (callback.searchParams.get('error')) throw new Error(callback.searchParams.get('error_description') || callback.searchParams.get('error'));
    const code = callback.searchParams.get('code');
    if (!code) throw new Error('Trakt did not return an authorization code');
    return this.exchangeCode(code, verifier, redirect);
  }
  /** Website only: finish a sign-in when Trakt sends the browser back with ?code=…&state=…  → true if it did. */
  async completeRedirect() {
    const q = new URLSearchParams(location.search);
    if (hasIdentity() || !q.has('state') || !(q.has('code') || q.has('error'))) return false;
    const saved = JSON.parse(sessionStorage.getItem(PKCE_KEY) || 'null');
    sessionStorage.removeItem(PKCE_KEY);
    window.history.replaceState(null, '', location.pathname + (saved?.back || ''));
    if (!saved || q.get('state') !== saved.state) throw new Error('Trakt authorization state mismatch');
    if (q.get('error')) throw new Error(q.get('error_description') || q.get('error'));
    return this.exchangeCode(q.get('code'), saved.verifier, REDIRECT());
  }
  async exchangeCode(code, verifier, redirect) {
    const { body } = await fetchJson(API + '/oauth/token', { method:'POST',
      headers:{ 'Content-Type':'application/json' },
      body:JSON.stringify({ code, client_id:this.config.clientId, redirect_uri:redirect,
        code_verifier:verifier, grant_type:'authorization_code' }) });
    await this.storeTokens(body);
    await this.fetchUser();
    emit('trakt:status');
    return true;
  }
  async storeTokens(t) {
    this.tokens = {
      access_token: t.access_token, refresh_token: t.refresh_token,
      expires_at: ((t.created_at || Math.floor(Date.now() / 1000)) + (t.expires_in || 86400)) * 1000,
    };
    await secrets.set('trakt:tokens', this.tokens);
    await this.clearExpired();
  }
  async ensureFresh() {
    if (this.tokens?.expires_at && Date.now() > this.tokens.expires_at - 10 * 60e3) await this.refresh();
  }
  async refresh(force = false) {
    if (this._refreshing) return this._refreshing;
    const work = async () => {
      // Coordinate tabs of the same extension origin. Refresh tokens are single-use.
      const stored = await secrets.get('trakt:tokens');
      if (stored?.refresh_token && stored.refresh_token !== this.tokens?.refresh_token) { this.tokens = stored; return; }
      if (!this.tokens?.refresh_token) throw new Error('Trakt is not connected');
      if (this.needsReconnect) throw new Error('Your Trakt sign-in has expired — reconnect Trakt in Settings');
      if (!force && this.tokens.expires_at && Date.now() < this.tokens.expires_at - 10 * 60e3) return;
      const prior = this.tokens.refresh_token;
      try {
        const { body } = await fetchJson(API + '/oauth/token', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh_token: prior, client_id: this.config.clientId,
            redirect_uri: REDIRECT(), grant_type: 'refresh_token' }),
        });
        await this.storeTokens(body);
      } catch (e) {
        // A second tab may have rotated the token while we were requesting.
        const current = await secrets.get('trakt:tokens');
        if (current?.access_token && current.refresh_token !== prior) { this.tokens = current; await this.clearExpired(); return; }
        // Trakt rejected the refresh token itself (revoked, expired or already used elsewhere).
        // Keep the cached lists, but flag the session so the UI asks the user to reconnect.
        if (e.status === 400 || e.status === 401) {
          await this.markExpired(e.body?.error_description || e.body?.error || 'Refresh token rejected');
          throw new Error('Your Trakt sign-in has expired — reconnect Trakt in Settings');
        }
        throw e;
      }
    };
    this._refreshing = (async () => {
      try {
        if (typeof navigator !== 'undefined' && navigator.locks?.request) {
          return await navigator.locks.request('beacon-trakt-refresh', { mode: 'exclusive' }, work);
        }
        return await work();
      } finally { this._refreshing = null; }
    })();
    return this._refreshing;
  }
  async fetchUser() {
    try {
      const s = await this.get('/users/settings', true);
      this.user = { username: s.user?.username, slug: s.user?.ids?.slug || s.user?.username, name: s.user?.name || s.user?.username, avatar: s.user?.images?.avatar?.full || '', vip: !!s.user?.vip };
      await cache.set('trakt:user', this.user);
    } catch (e) { console.warn('Trakt user fetch failed', e); }
    return this.user;
  }
  async clearSession() {
    this.tokens = null; this.user = null; this.data = emptyData();
    this.needsReconnect = false; await secrets.del('trakt:needsReconnect');
    await secrets.del('trakt:tokens'); await cache.del('trakt:user'); await cache.del(DATA_KEY);
  }
  async disconnect() {
    if (this.tokens?.access_token) {
      try { await fetchJson(API + '/oauth/revoke', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: this.tokens.access_token, client_id: this.config.clientId }) }); } catch {}
    }
    await this.clearSession();
    emit('trakt:status'); emit('trakt:data');
  }

  /* ---------- Public catalogs (Client ID only) ---------- */
  async pub(path, ttl = 3 * 3600e3) {
    const key = 'trakt:pub:' + path;
    const hit = await cache.fresh(key, ttl);
    if (hit) return hit;
    try { return await cache.stamp(key, await this.get(path)); }
    catch (e) { const stale = await cache.get(key); if (stale?.data) return stale.data; throw e; }
  }
  async catalog(kind, type, limit = 30) {
    const t = type === 'movie' ? 'movies' : 'shows';
    const rows = await this.pub(`/${t}/${kind}?extended=full&limit=${limit}`);
    return (rows || []).map(r => unwrapTrakt(r)?.item).filter(Boolean);
  }
  async recentlyReleased(type) {
    if (type === 'movie') {
      const rows = await this.pub(`/calendars/all/dvd/${today(-45)}/45?extended=full&languages=en`, 6 * 3600e3);
      return dedupe((rows || []).map(r => fromTrakt(r.movie, 'movie'))).filter(i => i.votes >= 5).sort((a, b) => b.votes - a.votes).slice(0, 40);
    }
    const rows = await this.pub(`/calendars/all/shows/premieres/${today(-30)}/30?extended=full&languages=en`, 6 * 3600e3);
    return dedupe((rows || []).map(r => fromTrakt(r.show, 'show'))).filter(i => i.votes >= 3).sort((a, b) => b.votes - a.votes).slice(0, 40);
  }
  async seasons(id) {
    return this.pub(`/shows/${encodeURIComponent(id)}/seasons?extended=full,episodes`, 12 * 3600e3);
  }
  async search(query, type) {
    const t = type === 'movie' ? 'movie' : type === 'show' ? 'show' : 'movie,show';
    const rows = await this.get(`/search/${t}?query=${encodeURIComponent(query)}&extended=full&limit=40`);
    return (rows || []).map(r => unwrapTrakt(r)?.item).filter(Boolean);
  }

  /* ---------- Sync ---------- */
  sync(force = false) {
    if (!this.connected()) return Promise.resolve(false);
    if (this._syncing) return this._syncing;
    this._syncing = (async () => {
      // Pick up a reconnect or token rotation done in another Beacon Hub tab.
      const stored = await secrets.get('trakt:tokens');
      if (stored?.access_token) this.tokens = stored;
      this.needsReconnect = !!(await secrets.get('trakt:needsReconnect'));
      if (this.needsReconnect) { emit('trakt:status'); return ['Trakt sign-in expired — reconnect in Settings']; }
      return this._sync(force);
    })().finally(() => { this._syncing = null; });
    return this._syncing;
  }
  async _sync(force) {
    emit('trakt:syncing', true);
    const d = this.data;
    const errors = [];
    const step = async (name, fn) => { try { await fn(); } catch (e) { console.warn('Trakt sync step failed', name, e); errors.push(`${name}: ${e.message}`); } };
    let acts = {};
    try { acts = await this.get('/sync/last_activities', true); } catch (e) { errors.push('activity: ' + e.message); }
    if (!this.user) await this.fetchUser();
    const sig = parts => JSON.stringify(parts);
    const changed = (name, parts) => {
      const s = sig(parts);
      if (force || d.acts[name] !== s) { d.acts[name] = s; return true; }
      return false;
    };
    const A = acts || {};
    if (changed('watchlist', [A.watchlist?.updated_at, A.movies?.watchlisted_at, A.shows?.watchlisted_at])) await step('watchlist', async () => {
      const [m, s] = await Promise.all([this.get('/sync/watchlist/movies?extended=full', true), this.get('/sync/watchlist/shows?extended=full', true)]);
      const newest = rows => [...(rows || [])].sort((a, b) => String(b.listed_at).localeCompare(String(a.listed_at)));
      d.watchlist = {
        movies: newest(m).map(r => Object.assign(fromTrakt(r.movie, 'movie'), { listedAt: r.listed_at })),
        shows: newest(s).map(r => Object.assign(fromTrakt(r.show, 'show'), { listedAt: r.listed_at })),
      };
    });
    if (changed('lists', [A.lists?.updated_at])) await step('lists', async () => {
      const lists = await this.get('/users/me/lists', true);
      const old = new Map(d.lists.map(l => [l.ids.trakt, l]));
      d.lists = [];
      for (const l of lists || []) {
        const prev = old.get(l.ids.trakt);
        let items = prev && prev.updated_at === l.updated_at && !force ? prev.items : null;
        if (!items) items = listItems(await this.get(`/users/me/lists/${l.ids.trakt}/items?extended=full`, true));
        d.lists.push({ ids: l.ids, name: l.name, description: l.description || '', updated_at: l.updated_at, item_count: l.item_count, privacy: l.privacy, items, own: true });
      }
    });
    if (changed('liked', [A.lists?.liked_at, A.lists?.updated_at])) await step('liked lists', async () => {
      const likes = await this.get('/users/likes/lists?limit=100', true);
      d.liked = [];
      for (const row of likes || []) {
        const l = row.list; if (!l?.ids?.trakt) continue;
        let items = [];
        try { items = listItems(await this.get(`/lists/${l.ids.trakt}/items?extended=full`, true)); } catch (e) { console.warn('liked list items', e); }
        d.liked.push({ ids: l.ids, name: l.name, description: l.description || '', updated_at: l.updated_at, item_count: l.item_count, user: l.user?.username || l.user?.ids?.slug || '', items, own: false });
      }
    });
    if (changed('watched', [A.movies?.watched_at, A.episodes?.watched_at])) await step('watched', async () => {
      const [m, s] = await Promise.all([this.get('/sync/watched/movies?extended=full', true), this.get('/sync/watched/shows?extended=full', true)]);
      d.watchedMovies = {};
      for (const r of m || []) { const it = fromTrakt(r.movie, 'movie'); d.watchedMovies[keyOf(it)] = { plays: r.plays, last: r.last_watched_at, item: it }; }
      d.watchedShows = {};
      for (const r of s || []) {
        const it = fromTrakt(r.show, 'show');
        const eps = [];
        for (const se of r.seasons || []) for (const e of se.episodes || []) eps.push(`${se.number}:${e.number}`);
        d.watchedShows[keyOf(it)] = { item: it, last: r.last_watched_at, plays: r.plays, eps };
      }
      const h = await this.get('/sync/history?limit=40&extended=full', true);
      d.history = (h || []).map(r => { const u = unwrapTrakt(r); return u && { item: u.item, episode: r.episode || null, watched_at: r.watched_at, id: r.id }; }).filter(Boolean);
    });
    if (changed('playback', [A.movies?.paused_at, A.episodes?.paused_at, A.movies?.watched_at, A.episodes?.watched_at])) await step('playback', async () => {
      const rows = await this.get('/sync/playback?extended=full&limit=40', true);
      d.playback = (rows || []).map(r => { const u = unwrapTrakt(r); return u && { id: r.id, progress: r.progress, paused_at: r.paused_at, type: r.type, item: u.item, episode: r.episode || null }; }).filter(Boolean);
    });
    if (changed('ratings', [A.movies?.rated_at, A.shows?.rated_at])) await step('ratings', async () => {
      const [m, s] = await Promise.all([this.get('/sync/ratings/movies', true), this.get('/sync/ratings/shows', true)]);
      d.ratings = {};
      for (const r of m || []) d.ratings[keyOf(fromTrakt(r.movie, 'movie'))] = r.rating;
      for (const r of s || []) d.ratings[keyOf(fromTrakt(r.show, 'show'))] = r.rating;
    });
    const stale = (name, ms) => force || !d.acts['t:' + name] || Date.now() - d.acts['t:' + name] > ms;
    const touch = name => { d.acts['t:' + name] = Date.now(); };
    if (stale('recommended', 6 * 3600e3)) await step('recommendations', async () => {
      const [m, s] = await Promise.all([this.get('/recommendations/movies?limit=40&ignore_collected=true&ignore_watchlisted=true&extended=full', true), this.get('/recommendations/shows?limit=40&ignore_collected=true&ignore_watchlisted=true&extended=full', true)]);
      d.recommended = { movies: (m || []).map(x => fromTrakt(x, 'movie')), shows: (s || []).map(x => fromTrakt(x, 'show')) };
      touch('recommended');
    });
    if (stale('calendar', 3 * 3600e3)) await step('calendar', async () => {
      const rows = await this.get(`/calendars/my/shows/${today(-1)}/21?extended=full`, true);
      d.calendar = (rows || []).map(r => ({ first_aired: r.first_aired, episode: r.episode, item: fromTrakt(r.show, 'show') }));
      touch('calendar');
    });
    await step('up next', () => this.computeUpNext(force));
    d.lastSync = Date.now();
    d.lastErrors = errors.slice(0, 12);
    await cache.set(DATA_KEY, d);
    emit('trakt:syncing', false);
    emit('trakt:data');
    if (errors.length) emit('trakt:sync-errors', errors);
    return errors.length ? errors : true;
  }

  async computeUpNext(force) {
    const d = this.data;
    const shows = Object.values(d.watchedShows).sort((a, b) => String(b.last).localeCompare(String(a.last))).slice(0, 18);
    const out = [];
    await Promise.all(shows.map(async ws => {
      const id = ws.item.ids.trakt || ws.item.ids.slug;
      if (!id) return;
      let p = d.progress[id];
      if (force || !p || p.last !== ws.last || Date.now() - (p.at || 0) > 24 * 3600e3) {
        try {
          const prog = await this.get(`/shows/${id}/progress/watched?hidden=false&specials=false&count_specials=false&extended=full`, true);
          p = { last: ws.last, at: Date.now(), next: prog?.next_episode || null, aired: prog?.aired, completed: prog?.completed };
          d.progress[id] = p;
        } catch { return; }
      }
      if (p.next) out.push({ item: ws.item, episode: p.next, last: ws.last, aired: p.aired, completed: p.completed });
    }));
    d.upNext = out.sort((a, b) => String(b.last).localeCompare(String(a.last)));
  }

  /* ---------- State helpers ---------- */
  isWatchlisted(item) {
    const k = keyOf(item); const arr = item.type === 'movie' ? this.data.watchlist.movies : this.data.watchlist.shows;
    return arr.some(x => keyOf(x) === k);
  }
  movieWatched(item) { return !!this.data.watchedMovies[keyOf(item)]; }
  episodeWatched(item, s, e) { return !!this.data.watchedShows[keyOf(item)]?.eps?.includes(`${s}:${e}`); }
  watchedEpisodeCount(item) { return this.data.watchedShows[keyOf(item)]?.eps?.length || 0; }
  listsContaining(item) {
    const k = keyOf(item);
    return new Set(this.data.lists.filter(l => l.items.some(x => keyOf(x.item) === k)).map(l => l.ids.trakt));
  }
  rating(item) { return this.data.ratings[keyOf(item)] || null; }
  async persist() { await cache.set(DATA_KEY, this.data); emit('trakt:data'); }

  /* ---------- Mutations (optimistic, then confirmed by Trakt) ---------- */
  async setWatchlist(item, add) {
    const field = item.type === 'movie' ? 'movies' : 'shows';
    await this.request(add ? '/sync/watchlist' : '/sync/watchlist/remove', { method: 'POST', auth: true, body: { [field]: [idsBody(item)] } });
    const k = keyOf(item);
    const arr = this.data.watchlist[field].filter(x => keyOf(x) !== k);
    if (add) arr.unshift({ ...clean(item), listedAt: new Date().toISOString() });
    this.data.watchlist[field] = arr;
    await this.persist();
  }
  async setListMembership(listId, item, add) {
    const field = item.type === 'movie' ? 'movies' : 'shows';
    await this.request(`/users/me/lists/${listId}/items${add ? '' : '/remove'}`, { method: 'POST', auth: true, body: { [field]: [idsBody(item)] } });
    const list = this.data.lists.find(l => l.ids.trakt === listId);
    if (list) {
      const k = keyOf(item);
      list.items = list.items.filter(x => keyOf(x.item) !== k);
      if (add) list.items.push({ item: clean(item), type: item.type, listed_at: new Date().toISOString() });
      list.item_count = list.items.length;
    }
    await this.persist();
  }
  async createList(name) {
    const l = (await this.request('/users/me/lists', { method: 'POST', auth: true, body: { name, privacy: 'private' } })).data;
    this.data.lists.push({ ids: l.ids, name: l.name, description: '', updated_at: l.updated_at, item_count: 0, items: [], own: true });
    await this.persist();
    return l;
  }
  async setWatched(item, episode, watched) {
    const now = new Date().toISOString();
    let body;
    if (item.type === 'movie') body = { movies: [{ ...idsBody(item), ...(watched ? { watched_at: now } : {}) }] };
    else body = { shows: [{ ...idsBody(item), seasons: [{ number: episode.season, episodes: [{ number: episode.number, ...(watched ? { watched_at: now } : {}) }] }] }] };
    await this.request(watched ? '/sync/history' : '/sync/history/remove', { method: 'POST', auth: true, body });
    this.applyWatched(item, episode, watched);
    await this.persist();
  }
  applyWatched(item, episode, watched) {
    const k = keyOf(item);
    if (item.type === 'movie') {
      if (watched) this.data.watchedMovies[k] = { plays: (this.data.watchedMovies[k]?.plays || 0) + 1, last: new Date().toISOString(), item: clean(item) };
      else delete this.data.watchedMovies[k];
    } else if (episode) {
      const ws = this.data.watchedShows[k] || (this.data.watchedShows[k] = { item: clean(item), last: null, plays: 0, eps: [] });
      const tag = `${episode.season}:${episode.number}`;
      ws.eps = ws.eps.filter(x => x !== tag);
      if (watched) { ws.eps.push(tag); ws.last = new Date().toISOString(); }
      const id = item.ids.trakt || item.ids.slug; if (id && this.data.progress[id]) this.data.progress[id].at = 0;
    }
  }
  async rate(item, rating) {
    const field = item.type === 'movie' ? 'movies' : 'shows';
    if (rating) await this.request('/sync/ratings', { method: 'POST', auth: true, body: { [field]: [{ ...idsBody(item), rating }] } });
    else await this.request('/sync/ratings/remove', { method: 'POST', auth: true, body: { [field]: [idsBody(item)] } });
    if (rating) this.data.ratings[keyOf(item)] = rating; else delete this.data.ratings[keyOf(item)];
    await this.persist();
  }
  async removePlayback(id) {
    await this.request(`/sync/playback/${id}`, { method: 'DELETE', auth: true });
    this.data.playback = this.data.playback.filter(p => p.id !== id);
    await this.persist();
  }
  /** action: start | pause | stop. Returns response data or null. Trakt marks watched on stop >= 80%. */
  async scrobble(action, item, episode, progress) {
    if (!this.connected()) return null;
    const body = { progress: Math.max(0, Math.min(100, Number(progress.toFixed(2)))), app_version: '1.2.0' };
    if (item.type === 'movie') body.movie = idsBody(item);
    else { body.show = idsBody(item); body.episode = { season: episode.season, number: episode.number }; }
    try {
      const { data } = await this.request(`/scrobble/${action}`, { method: 'POST', auth: true, body });
      if (action === 'stop' && data?.action === 'scrobble') { this.applyWatched(item, episode, true); await this.persist(); }
      return data;
    } catch (e) {
      if (e.status === 409) return { action: 'duplicate' }; // already scrobbled recently — do not mark again
      console.warn('scrobble failed', action, e);
      return null;
    }
  }
}

function listItems(rows) {
  const out = [];
  for (const r of rows || []) {
    const u = unwrapTrakt(r);
    if (!u?.item) continue;
    out.push({ item: u.item, type: u.item.type, rank: r.rank, listed_at: r.listed_at });
  }
  return out;
}
function dedupe(items) {
  const seen = new Set();
  return items.filter(i => { const k = keyOf(i); if (seen.has(k)) return false; seen.add(k); return true; });
}

export const trakt = new TraktClient();
