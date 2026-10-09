/* Beacon Hub 1.0 — app shell: navigation, routing, background sync. */
'use strict';
import { $, $$, h, icon, toast, clear } from './dom.js';
import { actions } from './actions.js';
import { trakt } from '../lib/trakt.js';
import { pm } from '../lib/premiumize.js';
import { on, loadEmpyrean } from '../lib/store.js';
import { history } from '../lib/history.js';
import { openDetails, closeDetails, refreshDetails, detailsOpen } from './details.js';
import { openSources, closeSheet } from './sheet.js';
import { play } from './player.js';
import * as P from './pages.js';
import { settingsPage } from './settings.js';
import { livePage } from './live.js';
import { iptv } from '../lib/iptv.js';

const view = $('#view');
const nav = $('#topnav');
let page = null, route = '';

/* ---------- actions ---------- */
Object.assign(actions, {
  openDetails: (item, opts) => openDetails(item, opts),
  openSources: (item, ep, opts) => openSources(item, ep, opts),
  play: opts => { closeSheet(); play(opts); },
  openCloudGroup: g => P.openCloudGroup(g),
  navigate: hash => { if (detailsOpen()) closeDetails(true); closeSheet(); if (location.hash === hash) render(); else location.hash = hash; },
  rerender: () => { page?.refresh?.(); refreshDetails(); },
  async toggleWatchlist(item) {
    if (!trakt.connected()) { toast('Connect Trakt in Settings to use your watchlist', { error: true }); return; }
    const add = !trakt.isWatchlisted(item);
    try { await trakt.setWatchlist(item, add); toast(add ? `Added ${item.title} to your watchlist` : `Removed ${item.title} from your watchlist`); }
    catch (e) { toast('Trakt: ' + e.message, { error: true }); }
  },
  playEntry(entry) {
    const { item, episode } = entry;
    const resumeAt = history.resumeAt(item, episode);
    const rec = entry.local;
    if (rec?.url && rec.url.startsWith('https://')) {
      play({ item, ep: episode, url: rec.url, label: rec.source || 'Last source', resumeAt, sourceInfo: rec.sourceInfo });
      return;
    }
    openSources(item, episode, { resumeAt, resumePct: !resumeAt && entry.traktPlayback ? entry.traktPlayback.progress : 0 });
  },
});

/* ---------- routing ---------- */
const ROUTES = {
  home: () => P.homePage(), live: () => livePage(), movies: () => P.moviesPage(), shows: () => P.showsPage(), lists: () => P.listsPage(),
  premiumize: arg => P.premiumizePage(arg === 'transfers' ? 'transfers' : 'library'),
  search: arg => P.searchPage(arg ? decodeURIComponent(arg) : ''), settings: () => settingsPage(),
  grid: arg => P.gridPage(decodeURIComponent(arg || '')),
};
function parse() {
  const m = location.hash.match(/^#\/([a-z]+)(?:\/(.*))?$/);
  return m && ROUTES[m[1]] ? { name: m[1], arg: m[2] || '' } : { name: 'home', arg: '' };
}
function render() {
  const r = parse();
  route = r.name;
  page = ROUTES[r.name](r.arg);
  clear(view).append(page.el);
  for (const a of $$('[data-route]', nav)) a.classList.toggle('active', a.dataset.route === r.name);
  document.body.dataset.route = r.name;
  document.title = { home: 'Beacon Hub', movies: 'Movies · Beacon Hub', shows: 'TV Shows · Beacon Hub', lists: 'My Lists · Beacon Hub', live: 'Live TV · Beacon Hub', premiumize: 'Premiumize · Beacon Hub', search: 'Search · Beacon Hub', settings: 'Settings · Beacon Hub', grid: 'Beacon Hub' }[r.name];
  window.scrollTo({ top: 0 });
  const searchBox = $('#navSearch');
  if (r.name !== 'search') { searchBox.classList.remove('open'); $('#navSearchInput').value = ''; }
}
window.addEventListener('hashchange', () => { if (detailsOpen()) closeDetails(true); closeSheet(); render(); });

/* ---------- nav ---------- */
const onScroll = () => nav.classList.toggle('solid', window.scrollY > 24 || !['home', 'movies', 'shows', 'live'].includes(route));
window.addEventListener('scroll', onScroll, { passive: true });
setInterval(onScroll, 500);

const searchBox = $('#navSearch'), searchInput = $('#navSearchInput');
$('#navSearchBtn').addEventListener('click', () => {
  if (route === 'search') { $('.big-search')?.focus(); return; }
  searchBox.classList.add('open'); searchInput.focus();
});
searchInput.addEventListener('keydown', e => {
  if (e.key === 'Enter' && searchInput.value.trim()) actions.navigate('#/search/' + encodeURIComponent(searchInput.value.trim()));
  if (e.key === 'Escape') { searchInput.value = ''; searchBox.classList.remove('open'); searchInput.blur(); }
});
searchInput.addEventListener('input', () => {
  clearTimeout(searchInput._t);
  if (searchInput.value.trim().length >= 2) searchInput._t = setTimeout(() => actions.navigate('#/search/' + encodeURIComponent(searchInput.value.trim())), 600);
});
searchInput.addEventListener('blur', () => { if (!searchInput.value) searchBox.classList.remove('open'); });
document.addEventListener('keydown', e => {
  if (e.key === '/' && !e.target.closest('input, textarea, select') && !document.body.classList.contains('player-open')) { e.preventDefault(); actions.navigate('#/search'); }
});
$('#mobileMenu')?.addEventListener('click', () => nav.classList.toggle('menu-open'));
for (const a of $$('.nav-links a')) a.addEventListener('click', () => nav.classList.remove('menu-open'));

function drawAccount() {
  const slot = $('#navAccount');
  clear(slot);
  if (trakt.connected()) {
    const u = trakt.user || {};
    const av = u.avatar ? h('img.avatar', { src: u.avatar, alt: '', referrerPolicy: 'no-referrer' }) : h('span.avatar.fallback', (u.username || 'T')[0].toUpperCase());
    slot.append(h('a.account' + (trakt.needsReconnect ? '.warn' : ''), { href: '#/settings', title: trakt.needsReconnect ? 'Trakt sign-in expired — click to reconnect' : `Trakt: ${u.username || 'connected'}` }, av));
  } else slot.append(h('a.connect-pill', { href: '#/settings' }, icon('link'), h('span', 'Connect Trakt')));
  drawReconnectBanner();
}

/* ---------- expired Trakt session banner ---------- */
let bannerDismissed = false;
async function reconnectTrakt() {
  try {
    await trakt.connectPKCE();
    toast(`Trakt reconnected${trakt.user?.username ? ' as ' + trakt.user.username : ''}`);
    await trakt.sync(true);
  } catch (e) { toast('Trakt: ' + e.message, { error: true }); }
}
actions.reconnectTrakt = reconnectTrakt;
function drawReconnectBanner() {
  let el = $('#traktBanner');
  if (!trakt.connected() || !trakt.needsReconnect || bannerDismissed) { el?.remove(); return; }
  if (el) return;
  el = h('div.trakt-banner', { id: 'traktBanner', role: 'alert' }, icon('alert'),
    h('span', h('b', 'Your Trakt sign-in has expired. '), 'Your lists and history won’t update until you reconnect.'),
    h('button.btn.primary.small', { type: 'button', on: { click: reconnectTrakt } }, 'Reconnect Trakt'),
    h('button.btn.round.ghost.xs', { type: 'button', 'aria-label': 'Dismiss', title: 'Hide until next restart', on: { click: () => { bannerDismissed = true; el.remove(); } } }, icon('x')));
  document.body.append(el);
}
on('trakt:syncing', on_ => $('#syncDot').classList.toggle('on', !!on_));

/* ---------- data events → refresh (coalesced, never discarded) ---------- */
let refreshTimer = null;
let lastRefreshAt = 0;
let refreshPending = false;
const MIN_REFRESH_MS = 3000;
function flushRefresh() {
  refreshTimer = null;
  if (!refreshPending) return;
  if (document.hidden || document.body.classList.contains('player-open')) return;
  const remaining = MIN_REFRESH_MS - (Date.now() - lastRefreshAt);
  if (remaining > 0) { refreshTimer = setTimeout(flushRefresh, remaining); return; }
  refreshPending = false;
  lastRefreshAt = Date.now();
  if (['home', 'movies', 'shows', 'lists', 'premiumize', 'settings', 'live'].includes(route)) page?.refresh?.();
  refreshDetails();
  // Changes delivered during refresh must also be rendered.
  if (refreshPending) scheduleRefresh();
}
function scheduleRefresh() {
  if (refreshTimer || document.hidden || document.body.classList.contains('player-open')) return;
  const delay = Math.max(400, MIN_REFRESH_MS - (Date.now() - lastRefreshAt));
  refreshTimer = setTimeout(flushRefresh, delay);
}
const softRefresh = () => { refreshPending = true; scheduleRefresh(); };
on('trakt:data', softRefresh);
on('pm:data', softRefresh);
on('iptv:data', softRefresh);
on('iptv:status', softRefresh);
// Playback history is updated every few seconds: refresh once after closing the player.
on('history', () => { if (!document.body.classList.contains('player-open')) softRefresh(); });
// Only redraw on tab return when something actually changed while hidden.
document.addEventListener('visibilitychange', () => { if (!document.hidden && refreshPending) scheduleRefresh(); });
// A player close can happen without a history event (or after a hidden refresh).
new MutationObserver(() => { if (!document.body.classList.contains('player-open') && refreshPending) scheduleRefresh(); }).observe(document.body, { attributes: true, attributeFilter: ['class'] });
on('trakt:status', () => { bannerDismissed = bannerDismissed && trakt.needsReconnect; drawAccount(); softRefresh(); });
on('pm:status', softRefresh);
let syncErrorShown = false;
on('trakt:sync-errors', errs => {
  console.warn('Trakt sync issues:', errs);
  if (!syncErrorShown && !trakt.needsReconnect) { syncErrorShown = true; toast('Some Trakt data didn’t sync — details in Settings', { error: true, action: () => actions.navigate('#/settings'), actionLabel: 'View' }); }
});

/* ---------- boot ---------- */
(async function boot() {
  await loadEmpyrean();
  if (/^https?:$/.test(location.protocol)) setInterval(loadEmpyrean, 6 * 3600e3); // fresh Live TV stream key
  await Promise.all([trakt.load(), pm.load()]);
  // Website: back from Trakt's sign-in page?
  const traktReturned = await trakt.completeRedirect().catch(e => { toast('Trakt: ' + e.message, { error: true }); return false; });
  if (traktReturned) toast(`Trakt connected${trakt.user?.username ? ' as ' + trakt.user.username : ''}`);
  // Website: a way back to the Beacon account page (who's signed in, sign out, admin).
  if (/^https?:$/.test(location.protocol)) $('.foot')?.append(h('a.foot-link', { href: '/' }, 'Beacon account'));
  iptv.load();
  drawAccount();
  render();
  onScroll();
  document.body.classList.add('ready');
  // background work
  if (trakt.connected()) {
    if (traktReturned || Date.now() - (trakt.data.lastSync || 0) > 2 * 60e3) trakt.sync().catch(e => toast('Trakt sync failed: ' + e.message, { error: true }));
    setInterval(() => { if (!document.hidden) trakt.sync().catch(() => {}); }, 15 * 60e3);
  }
  if (iptv.signedIn() && route !== 'live') iptv.refresh().catch(() => {});
  if (pm.connected()) {
    pm.refresh().then(() => pm.matchLibrary()).catch(() => {});
    setInterval(() => { if (!document.hidden) pm.refresh().catch(() => {}); }, 20 * 60e3);
  }
})();
