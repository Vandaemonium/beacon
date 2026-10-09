/* Beacon Hub 1.0 — pages: Home, Movies, TV Shows, My Lists, Premiumize, Search, See-all grids. */
'use strict';
import { h, btn, icon, clear, toast, art, confirmDialog, promptDialog } from './dom.js';
import { actions } from './actions.js';
import { row, grid, emptyState, posterCard } from './cards.js';
import { hero } from './hero.js';
import * as D from './data.js';
import { trakt } from '../lib/trakt.js';
import { pm } from '../lib/premiumize.js';
import { history, contentId } from '../lib/history.js';
import { liveHomeRow } from './live.js';
import { prefs, setPref } from '../lib/store.js';
import { cinemetaSearch, fmtBytes, fmtDate, norm } from '../lib/meta.js';

/* ---------- row registry (for "See all") ---------- */
const registry = new Map();
export function defRow(opts) {
  registry.set(opts.id, opts);
  if (opts.more === undefined) opts.more = '#/grid/' + encodeURIComponent(opts.id);
  return row(opts);
}
const hiddenRow = id => !!prefs().hiddenRows?.[id];

function traktPromo() {
  return h('section.promo', h('div.promo-art', icon('sync')),
    h('div.promo-text', h('h3', 'Bring your Trakt library into Beacon'), h('p', 'Connect Trakt to see your watchlist, custom lists, Up Next and personal recommendations — and keep watch history in sync.')),
    btn('Connect Trakt', { kind: 'primary', onClick: () => actions.navigate('#/settings') }));
}

function continueRow(id, type) {
  return defRow({ id, title: 'Continue Watching', wide: true, load: () => D.continueWatching(type).map(e => ({ ...e, onRemove: el => removeContinue(e, el) })) });
}
async function removeContinue(entry, el) {
  const id = contentId(entry.item, entry.episode);
  if (entry.traktPlayback && trakt.connected()) {
    const choice = await confirmDialog({ title: 'Remove from Continue Watching?', body: 'This title’s progress is also saved on Trakt. Remove it from Trakt too, or just hide it in Beacon?', ok: 'Remove from Trakt too', cancel: 'Cancel', extra: { label: 'Hide in Beacon only', value: 'hide' }, danger: true });
    if (!choice) return;
    if (choice === true) { try { await trakt.removePlayback(entry.traktPlayback.id); } catch (e) { return toast('Trakt: ' + e.message, { error: true }); } }
    else setPref('hiddenPlayback', [...(prefs().hiddenPlayback || []), entry.traktPlayback.id]);
  }
  if (entry.local) history.remove(id);
  el.remove();
  toast('Removed from Continue Watching');
}

/* ---------- Home ---------- */
export function homePage() {
  const page = h('div.page.home');
  page.append(hero(async () => {
    if (trakt.connected()) {
      const rec = D.recommended();
      if (rec.length) return rec.slice(0, 8);
    }
    return D.discover('trending', 'movie');
  }, { eyebrow: trakt.connected() ? 'Recommended for you' : 'Trending now' }));
  let rows = buildHomeRows();
  page.append(rows);
  return { el: page, refresh() { const n = buildHomeRows(); rows.replaceWith(n); rows = n; } };
}
function buildHomeRows() {
  const wrap = h('div.rows');
  const add = (id, make) => { if (!hiddenRow(id)) wrap.append(make()); };
  add('home-continue', () => continueRow('home-continue', null));
  add('home-upnext', () => defRow({ id: 'home-upnext', title: 'Next Episodes', wide: true, load: D.upNext }));
  if (!hiddenRow('home-live')) { const lr = liveHomeRow(); if (lr) wrap.append(lr); }
  if (!trakt.connected()) wrap.append(traktPromo());
  else {
    add('home-watchlist', () => defRow({ id: 'home-watchlist', title: 'My Trakt Watchlist', load: () => D.watchlist() }));
    if (!hiddenRow('home-lists')) {
      const lists = [...trakt.data.lists].sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at))).slice(0, 3);
      for (const l of lists) wrap.append(defRow({ id: 'list-' + l.ids.trakt, title: l.name, subtitle: 'Your list', load: () => l.items.map(x => ({ item: x.item })) }));
    }
  }
  add('home-trending-movies', () => defRow({ id: 'home-trending-movies', title: 'Top 10 Movies Today', ranked: true, max: 10, load: () => D.discover('trending', 'movie') }));
  add('home-trending-shows', () => defRow({ id: 'home-trending-shows', title: 'Trending TV Shows', load: () => D.discover('trending', 'show') }));
  add('home-recent', () => defRow({ id: 'home-recent', title: 'Recently Released', load: D.recentlyReleasedMixed }));
  if (trakt.connected()) add('home-recommended', () => defRow({ id: 'home-recommended', title: 'Recommended for You', load: () => D.recommended() }));
  if (pm.connected()) add('home-pm', () => defRow({ id: 'home-pm', title: 'Recently Added to Premiumize', load: async () => { if (!pm.files.length && Date.now() - pm.loadedAt > 5 * 60e3) await pm.refresh(); return D.premiumizeRow(); }, more: '#/premiumize' }));
  return wrap;
}

/* ---------- Movies ---------- */
export function moviesPage() {
  const page = h('div.page.movies');
  page.append(hero(() => D.discover('trending', 'movie'), { eyebrow: 'Trending movie' }));
  let rows = buildMovieRows();
  page.append(rows);
  return { el: page, refresh() { const n = buildMovieRows(); rows.replaceWith(n); rows = n; } };
}
function buildMovieRows() {
  const wrap = h('div.rows');
  wrap.append(continueRow('movies-continue', 'movie'));
  if (trakt.connected()) {
    wrap.append(defRow({ id: 'movies-watchlist', title: 'My Movie Watchlist', load: () => D.watchlist('movie'), empty: h('p.row-empty', 'Your Trakt movie watchlist is empty.') }));
    for (const { list, entries } of D.myLists('movie')) wrap.append(defRow({ id: `list-${list.ids.trakt}-movie`, title: list.name, subtitle: 'Your list', load: () => entries }));
  } else wrap.append(traktPromo());
  wrap.append(defRow({ id: 'movies-trending', title: 'Top 10 Movies Today', ranked: true, max: 10, load: () => D.discover('trending', 'movie') }));
  wrap.append(defRow({ id: 'movies-popular', title: trakt.hasClient() ? 'Popular' : 'Top Rated', load: () => D.discover('popular', 'movie') }));
  if (trakt.connected()) wrap.append(defRow({ id: 'movies-recommended', title: 'Recommended for You', load: () => D.recommended('movie') }));
  wrap.append(defRow({ id: 'movies-recent', title: 'Recently Released', load: () => D.discover('recent', 'movie') }));
  wrap.append(defRow({ id: 'movies-anticipated', title: 'Most Anticipated', load: () => D.discover('anticipated', 'movie') }));
  if (trakt.connected()) for (const { list, entries } of D.likedLists().map(x => ({ ...x, entries: x.entries.filter(e => e.item.type === 'movie') })).filter(x => x.entries.length)) wrap.append(defRow({ id: `liked-${list.ids.trakt}-movie`, title: list.name, subtitle: list.user ? `Liked list · ${list.user}` : 'Liked list', load: () => entries }));
  if (pm.connected()) wrap.append(defRow({ id: 'movies-pm', title: 'Premiumize Movies', load: async () => { if (!pm.files.length && Date.now() - pm.loadedAt > 5 * 60e3) await pm.refresh(); return D.premiumizeRow('movie'); }, more: '#/premiumize' }));
  return wrap;
}

/* ---------- TV ---------- */
export function showsPage() {
  const page = h('div.page.shows');
  page.append(hero(() => D.discover('trending', 'show'), { eyebrow: 'Trending series' }));
  let rows = buildShowRows();
  page.append(rows);
  return { el: page, refresh() { const n = buildShowRows(); rows.replaceWith(n); rows = n; } };
}
function buildShowRows() {
  const wrap = h('div.rows');
  wrap.append(continueRow('shows-continue', 'show'));
  wrap.append(defRow({ id: 'shows-upnext', title: 'Next Episodes', wide: true, load: D.upNext }));
  if (trakt.connected()) {
    wrap.append(defRow({ id: 'shows-watchlist', title: 'My TV Watchlist', load: () => D.watchlist('show'), empty: h('p.row-empty', 'Your Trakt TV watchlist is empty.') }));
    for (const { list, entries } of D.myLists('show')) wrap.append(defRow({ id: `list-${list.ids.trakt}-show`, title: list.name, subtitle: 'Your list', load: () => entries }));
  } else wrap.append(traktPromo());
  wrap.append(defRow({ id: 'shows-trending', title: 'Top 10 Shows Today', ranked: true, max: 10, load: () => D.discover('trending', 'show') }));
  wrap.append(defRow({ id: 'shows-popular', title: trakt.hasClient() ? 'Popular' : 'Top Rated', load: () => D.discover('popular', 'show') }));
  if (trakt.connected()) wrap.append(defRow({ id: 'shows-recommended', title: 'Recommended for You', load: () => D.recommended('show') }));
  wrap.append(defRow({ id: 'shows-recent', title: 'New Series Premieres', load: () => D.discover('recent', 'show') }));
  if (trakt.connected()) wrap.append(defRow({ id: 'shows-upcoming', title: 'Upcoming Episodes', wide: true, load: D.upcoming }));
  if (trakt.connected()) for (const { list, entries } of D.likedLists().map(x => ({ ...x, entries: x.entries.filter(e => e.item.type === 'show') })).filter(x => x.entries.length)) wrap.append(defRow({ id: `liked-${list.ids.trakt}-show`, title: list.name, subtitle: list.user ? `Liked list · ${list.user}` : 'Liked list', load: () => entries }));
  if (pm.connected()) wrap.append(defRow({ id: 'shows-pm', title: 'Premiumize TV Series', load: async () => { if (!pm.files.length && Date.now() - pm.loadedAt > 5 * 60e3) await pm.refresh(); return D.premiumizeRow('show'); }, more: '#/premiumize' }));
  return wrap;
}

/* ---------- My Lists ---------- */
export function listsPage() {
  const page = h('div.page.flat');
  const head = h('header.page-head', h('div', h('div.page-kicker', 'Trakt'), h('h1', 'My Lists')));
  const tools = h('div.page-tools');
  head.append(tools);
  page.append(head);
  let body = h('div.rows.flat-rows');
  page.append(body);
  const draw = () => {
    clear(tools);
    const nb = h('div.rows.flat-rows');
    if (!trakt.connected()) {
      nb.append(emptyState('Connect Trakt to see your lists', 'Your watchlist, custom lists, liked lists and watch history live on Trakt. Connect it once in Settings and Beacon keeps everything in sync.', btn('Open Settings', { kind: 'primary', icon: 'gear', onClick: () => actions.navigate('#/settings') })));
    } else {
      tools.append(h('span.sync-note', trakt.data.lastSync ? `Synced ${timeAgo(trakt.data.lastSync)}` : 'Not synced yet'),
        btn('Sync now', { icon: 'sync', kind: 'ghost small', onClick: async e => { e.currentTarget.classList.add('spinning'); await trakt.sync(true); } }),
        btn('New list', { icon: 'plus', kind: 'ghost small', onClick: async () => {
          const name = await promptDialog({ title: 'New Trakt list', body: 'Lists are created as private on Trakt. You can change that on trakt.tv.', placeholder: 'e.g. Weekend movies', ok: 'Create list' }); if (!name?.trim()) return;
          try { await trakt.createList(name.trim()); toast(`Created “${name.trim()}”`); } catch (e) { toast('Could not create list: ' + e.message, { error: true }); }
        } }));
      nb.append(defRow({ id: 'lists-watchlist', title: 'Watchlist', load: () => D.watchlist(), empty: h('p.row-empty', 'Nothing in your watchlist yet. Use + on any title to add it.') }));
      for (const l of trakt.data.lists) nb.append(defRow({ id: 'list-' + l.ids.trakt, title: l.name, subtitle: `${l.items.length} title${l.items.length === 1 ? '' : 's'}${l.privacy ? ' · ' + l.privacy : ''}`, load: () => l.items.map(x => ({ item: x.item })), empty: h('p.row-empty', 'This list is empty.') }));
      for (const { list, entries } of D.likedLists()) nb.append(defRow({ id: 'liked-' + list.ids.trakt, title: list.name, subtitle: `Liked list${list.user ? ' · by ' + list.user : ''}`, load: () => entries }));
      nb.append(defRow({ id: 'lists-watched-movies', title: 'Watched Movies', load: D.watchedMovies }));
      nb.append(defRow({ id: 'lists-watched-shows', title: 'Watched Series', load: D.watchedShows }));
    }
    nb.append(defRow({ id: 'lists-recent', title: 'Recently Watched', wide: true, load: D.recentlyWatched }));
    body.replaceWith(nb); body = nb;
  };
  draw();
  return { el: page, refresh: draw };
}

/* ---------- See-all grid ---------- */
export function gridPage(id) {
  const opts = registry.get(id);
  const page = h('div.page.flat');
  if (!opts) { page.append(emptyState('That row isn’t available', 'Head back home to browse.', btn('Home', { kind: 'primary', onClick: () => actions.navigate('#/home') }))); return { el: page }; }
  page.append(h('header.page-head', h('div', h('button.back-link', { type: 'button', on: { click: () => history_back() } }, icon('chevronLeft'), 'Back'), h('h1', opts.title), opts.subtitle ? h('p.muted', opts.subtitle) : null)));
  const holder = h('div.grid-holder', h('div.loading-inline', h('div.ring'), 'Loading…'));
  page.append(holder);
  Promise.resolve().then(opts.load).then(entries => { clear(holder).append(entries?.length ? grid(entries, { wide: opts.wide, render: opts.render }) : emptyState('Nothing here yet', '')); })
    .catch(e => clear(holder).append(emptyState('Couldn’t load this row', e.message)));
  return { el: page };
}
const history_back = () => (window.history.length > 1 ? window.history.back() : actions.navigate('#/home'));

/* ---------- Search ---------- */
export function searchPage(initial = '') {
  const page = h('div.page.flat.search-page');
  const input = h('input.big-search', { type: 'search', placeholder: 'Search movies and TV shows', value: initial, 'aria-label': 'Search', autocomplete: 'off' });
  page.append(h('div.search-hero', icon('search'), input));
  const results = h('div.search-results');
  page.append(results);
  let timer, seq = 0;
  const run = async q => {
    const my = ++seq;
    window.history.replaceState(window.history.state, '', '#/search/' + encodeURIComponent(q));
    clear(results);
    if (q.trim().length < 2) {
      results.append(h('div.search-tips', h('h3', 'Find something to watch'), h('p.muted', 'Search by title — e.g. “The Last Ship” or “Heat 1995”. Results come from ' + (trakt.hasClient() ? 'Trakt' : 'Cinemeta') + '. Live TV channels are searchable inside Live TV.')));
      return;
    }
    results.append(h('div.loading-inline', h('div.ring'), `Searching for “${q}”…`));
    let movies = [], shows = [], err = '';
    try {
      if (trakt.hasClient()) { const all = await trakt.search(q); movies = all.filter(i => i.type === 'movie'); shows = all.filter(i => i.type === 'show'); }
      else [movies, shows] = await Promise.all([cinemetaSearch('movie', q), cinemetaSearch('show', q)]);
    } catch (e) {
      try { [movies, shows] = await Promise.all([cinemetaSearch('movie', q), cinemetaSearch('show', q)]); } catch (e2) { err = e2.message; }
    }
    if (my !== seq) return;
    clear(results);
    const qn = norm(q);
    const rank = arr => arr.sort((a, b) => (norm(b.title) === qn) - (norm(a.title) === qn) || (b.votes || 0) - (a.votes || 0));
    const cloud = pm.connected() ? [...pm.library().movies, ...pm.library().shows].filter(g => norm(g.title).includes(qn)) : [];
    if (!movies.length && !shows.length && !cloud.length) { results.append(emptyState(err ? 'Search is unavailable right now' : `No results for “${q}”`, err || 'Check the spelling, or try the original title.')); return; }
    const section = (title, entries) => entries.length ? h('section.search-section', h('h2', title, h('span.row-count', String(entries.length))), grid(entries)) : null;
    results.append(
      section('In your Premiumize cloud', cloud.map(g => g.match ? { item: { ...g.match }, cloud: true, group: g } : { item: { type: g.kind, title: g.title, year: g.year, ids: {}, _unmatched: true }, cloud: true, group: g })),
      section('TV Shows', rank(shows).map(item => ({ item }))),
      section('Movies', rank(movies).map(item => ({ item }))));
  };
  input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => run(input.value), 380); });
  input.addEventListener('keydown', e => { if (e.key === 'Enter') { clearTimeout(timer); run(input.value); } });
  setTimeout(() => { input.focus(); run(initial); });
  return { el: page };
}

/* ---------- Premiumize ---------- */
export function premiumizePage(tab = 'library') {
  const page = h('div.page.flat');
  const head = h('header.page-head', h('div', h('div.page-kicker', 'Cloud'), h('h1', 'Premiumize')));
  const tools = h('div.page-tools');
  head.append(tools);
  const tabs = h('div.pill-tabs', { role: 'tablist' });
  const body = h('div.pm-body');
  page.append(head, tabs, body);
  let poll = null;
  const draw = () => {
    clearInterval(poll);
    clear(tools); clear(tabs); clear(body);
    if (!pm.connected()) {
      body.append(emptyState('Connect Premiumize', 'Add your Premiumize API key in Settings to browse, play and save to your cloud.', btn('Open Settings', { kind: 'primary', icon: 'gear', onClick: () => actions.navigate('#/settings') })));
      return;
    }
    const a = pm.account;
    if (a) tools.append(h('div.pm-account', h('span', a.premium_until ? `Premium until ${fmtDate(a.premium_until * 1000)}` : 'Account connected'),
      a.space_used != null ? h('span', `${fmtBytes(a.space_used)} used`) : null, a.limit_used != null ? h('span', `Fair use ${Math.round(a.limit_used * 100)}%`) : null));
    tools.append(btn('Refresh', { icon: 'sync', kind: 'ghost small', onClick: async e => { e.currentTarget.classList.add('spinning'); await pm.refresh(true); pm.matchLibrary(); } }));
    for (const [k, label] of [['library', 'Library'], ['transfers', `Transfers${pm.transfers.length ? ' (' + pm.transfers.length + ')' : ''}`]])
      tabs.append(h('button.pill' + (tab === k ? '.on' : ''), { type: 'button', role: 'tab', on: { click: () => { tab = k; window.history.replaceState(window.history.state, '', k === 'library' ? '#/premiumize' : '#/premiumize/transfers'); draw(); } } }, label));
    if (pm.error) body.append(h('div.banner.warn', icon('alert'), pm.error));
    if (tab === 'transfers') drawTransfers(body, () => { poll = setInterval(async () => { if (!page.isConnected) return clearInterval(poll); await pm.transfersList().catch(() => {}); }, 10000); });
    else drawLibrary(body);
  };
  draw();
  return { el: page, refresh: draw };
}
function drawLibrary(body) {
  const lib = pm.library();
  if (!pm.files.length) { body.append(emptyState(pm.loadedAt ? 'Your cloud has no videos yet' : 'Loading your cloud…', pm.loadedAt ? 'Save a source to Premiumize from any title’s source list and it will appear here.' : '')); return; }
  const sec = (title, entries) => entries.length ? h('section.search-section', h('h2', title, h('span.row-count', String(entries.length))), grid(entries)) : null;
  const toEntry = g => g.match ? { item: { ...g.match }, cloud: true, group: g, sub: g.kind === 'show' ? `${g.files.length} file${g.files.length === 1 ? '' : 's'} in cloud` : null } : { item: { type: g.kind, title: g.title, year: g.year, ids: {}, _unmatched: true }, cloud: true, group: g, sub: `${g.files.length} file${g.files.length === 1 ? '' : 's'}` };
  body.append(sec('TV Series', lib.shows.map(toEntry)), sec('Movies', lib.movies.map(toEntry)));
  if (lib.other.length) {
    const list = h('div.file-list');
    for (const { file } of lib.other) list.append(fileRow(file, null, null));
    body.append(h('section.search-section', h('h2', 'Other videos', h('span.row-count', String(lib.other.length))), list));
  }
}
export function fileRow(file, item, ep) {
  return h('div.file-row', icon('film'), h('div.file-main', h('b', file.name), h('small', [fmtBytes(file.size), file.created_at ? 'Added ' + fmtDate(file.created_at * 1000) : ''].filter(Boolean).join(' · '))),
    btn('Play', { icon: 'play', kind: 'primary small', onClick: async () => {
      try {
        const p = await pm.playable(file);
        const it = item || { type: 'movie', title: file.name.replace(/\.[a-z0-9]+$/i, ''), ids: {} };
        actions.play({ item: it, ep, url: p.link, alt: p.stream_link, label: 'Premiumize cloud', resumeAt: history.resumeAt(it, ep) });
      } catch (e) { toast('Premiumize: ' + e.message, { error: true }); }
    } }));
}
function drawTransfers(body, startPolling) {
  const add = h('div.transfer-add');
  const input = h('input', { placeholder: 'Paste a magnet link or URL you’re authorized to download…', 'aria-label': 'New transfer' });
  add.append(input, btn('Add to cloud', { icon: 'cloud', kind: 'primary', onClick: async () => {
    const v = input.value.trim(); if (!v) return;
    if (!/^(magnet:\?|https?:\/\/)/i.test(v)) return toast('Enter a magnet link or http(s) URL', { error: true });
    try { await pm.createTransfer(v); input.value = ''; toast('Transfer added'); await pm.transfersList(); } catch (e) { toast('Premiumize: ' + e.message, { error: true }); }
  } }));
  body.append(add);
  const list = h('div.transfer-list');
  if (!pm.transfers.length) list.append(h('p.muted', 'No transfers. Use “Save to Premiumize” on any source to add one.'));
  for (const t of pm.transfers) {
    const pct = Math.round((t.progress || (t.status === 'finished' ? 1 : 0)) * 100);
    list.append(h('div.transfer.' + String(t.status || '').replace(/[^a-z]/gi, ''),
      h('div.transfer-main', h('b', t.name || 'Transfer'), h('small', `${t.status || 'unknown'}${t.message ? ' — ' + t.message : ''}`), h('div.progress.inline', h('i', { style: { width: pct + '%' } }))),
      h('span.transfer-pct', pct + '%'),
      btn('', { icon: 'trash', kind: 'round ghost sm', title: 'Remove transfer', onClick: async () => { try { await pm.deleteTransfer(t.id); await pm.transfersList(); } catch (e) { toast(e.message, { error: true }); } } })));
  }
  body.append(list);
  if (pm.transfers.some(t => t.status === 'finished')) body.append(btn('Clear finished transfers', { kind: 'ghost small', onClick: async () => { await pm.clearFinished().catch(() => {}); await pm.transfersList(); } }));
  startPolling();
}

/* ---------- Cloud group (unmatched or matched cloud title) ---------- */
export function openCloudGroup(group) {
  const back = h('div.sheet-back', { on: { click: e => { if (e.target === back) close(); } } });
  const sheet = h('aside.sheet');
  const close = () => { back.classList.remove('in'); setTimeout(() => back.remove(), 250); document.removeEventListener('keydown', key, true); };
  const key = e => { if (e.key === 'Escape' && !document.querySelector('.player.open')) { e.stopPropagation(); close(); } };
  document.addEventListener('keydown', key, true);
  sheet.append(h('div.sheet-head', art('', { cls: 'sheet-poster', fallback: group.title }), h('div.sheet-titles', h('div.sheet-kicker', 'In your Premiumize cloud'), h('h2', group.title), h('div.sheet-sub', `${group.files.length} file${group.files.length === 1 ? '' : 's'}`)), btn('', { icon: 'x', kind: 'round ghost', title: 'Close', onClick: close })));
  const list = h('div.file-list');
  const files = [...group.files].sort((a, b) => (a.parsed.season ?? 0) - (b.parsed.season ?? 0) || (a.parsed.episode ?? 0) - (b.parsed.episode ?? 0));
  const item = { type: group.kind, title: group.title, year: group.year, ids: {} };
  for (const { file, parsed } of files) {
    const ep = parsed.season != null && parsed.episode != null ? { season: parsed.season, number: parsed.episode } : null;
    const r = fileRow(file, item, group.kind === 'show' ? ep : null);
    r.querySelector('.btn')?.addEventListener('click', close);
    list.append(r);
  }
  sheet.append(list);
  back.append(sheet);
  document.body.append(back);
  requestAnimationFrame(() => back.classList.add('in'));
}

export function timeAgo(t) {
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return new Date(t).toLocaleDateString();
}
export { posterCard };
