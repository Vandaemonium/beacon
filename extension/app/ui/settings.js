/* Beacon Hub 1.0 — Settings: Trakt, Premiumize, TorBox, Live TV, providers, playback, home layout, history. */
'use strict';
import { h, btn, icon, clear, toast, confirmDialog, copyText } from './dom.js';
import { actions } from './actions.js';
import { trakt } from '../lib/trakt.js';
import { pm } from '../lib/premiumize.js';
import { torbox } from '../lib/torbox.js';
import { history } from '../lib/history.js';
import { prefs, setPref, hubKey, setHubKey, fetchJson } from '../lib/store.js';
import { providerSummary, installedAddons } from '../lib/sources.js';
import { fmtDate, fmtBytes } from '../lib/meta.js';
import { timeAgo } from './pages.js';
import { caps, CAP_LABELS } from '../lib/compat.js';
import { iptv } from '../lib/iptv.js';
import { connectionPanel } from './netcheck-ui.js';

const card = (title, sub, ...kids) => h('section.set-card', h('div.set-head', h('h2', title), sub ? h('p.muted', sub) : null), ...kids);
const field = (label, input, hint) => h('label.field', h('span.field-label', label), input, hint ? h('small.muted', hint) : null);
function toggle(label, hint, value, onChange) {
  const input = h('input', { type: 'checkbox', checked: !!value, on: { change: e => onChange(e.target.checked) } });
  return h('label.switch-row', h('span.switch-text', h('b', label), hint ? h('small', hint) : null), h('span.switch', input, h('span.switch-ui')));
}
const status = (ok, text) => h('span.status-pill' + (ok ? '.ok' : ''), h('span.dot'), text);

let deviceAbort = null;

export function settingsPage() {
  const page = h('div.page.flat.settings');
  page.append(h('header.page-head', h('div', h('div.page-kicker', 'Beacon Hub 1.2'), h('h1', 'Settings'))));
  const body = h('div.set-grid');
  page.append(body);
  const draw = () => {
    clear(body);
    body.append(traktCard(draw), premiumizeCard(draw), connectionCard(), playbackCard(), compatCard(), sourcesCard(), liveCard(), homeCard(), historyCard(), torboxCard(draw), advancedCard());
  };
  draw();
  return { el: page, refresh: draw };
}

/* ---------------- Trakt ---------------- */
function traktCard(redraw) {
  if (trakt.connected()) {
    const u = trakt.user || {};
    const errs = h('div.sync-errors');
    if (trakt.data.lastErrors?.length && !trakt.needsReconnect) errs.append(h('div.muted.small', 'Last sync problems:'), ...trakt.data.lastErrors.map(x => h('div.error.small', x)));
    return card('Trakt', 'Watchlist, lists, history, ratings, Up Next and recommendations.',
      h('div.account-row', u.avatar ? h('img.avatar-lg', { src: u.avatar, alt: '', referrerPolicy: 'no-referrer' }) : h('div.avatar-lg.fallback', (u.username || 'T')[0].toUpperCase()),
        h('div', h('b', u.name || u.username || 'Connected'), h('small.muted', u.username ? '@' + u.username : ''), trakt.needsReconnect ? h('span.status-pill.warn', h('span.dot'), 'Sign-in expired') : status(true, trakt.data.lastSync ? `Synced ${timeAgo(trakt.data.lastSync)}${trakt.data.lastErrors?.length ? ' · with errors' : ''}` : 'Connected'))),
      h('p.muted.small', 'Beacon syncs when it opens and every 15 minutes while it’s open. Playback is scrobbled to Trakt — titles are marked watched only after you’ve watched at least 80%.'),
      trakt.needsReconnect ? h('div.banner.warn.inline', icon('alert'), h('span', 'Trakt rejected the saved sign-in (expired or revoked). Your lists are kept, but nothing will update until you reconnect.')) : null,
      h('div.btn-row',
        trakt.needsReconnect ? btn('Reconnect Trakt', { icon: 'link', kind: 'primary', onClick: async () => { await actions.reconnectTrakt(); redraw(); } }) : null,
        btn('Sync now', { icon: 'sync', kind: 'primary', onClick: async e => { const b = e.currentTarget; b.classList.add('spinning'); b.disabled = true; const r = await trakt.sync(true); b.disabled = false; b.classList.remove('spinning'); if (r === true) toast('Trakt is up to date'); else if (Array.isArray(r)) { toast('Synced with some errors', { error: true }); errs.replaceChildren(...r.map(x => h('div.error.small', x))); } redraw(); } }),
        btn('Disconnect', { kind: 'ghost', onClick: async () => { if (await confirmDialog({ title: 'Disconnect Trakt?', body: 'Beacon will sign out of Trakt and delete its cached copy of your lists. Nothing on Trakt is deleted.', ok: 'Disconnect', danger: true })) { await trakt.disconnect(); toast('Trakt disconnected'); redraw(); } } })),
      errs);
  }
  const clientId = trakt.config?.clientId || 'oMs5Elo0Jyxv0-WhaSpYULdKwsjHDopq1DuINOs96qA';
  const flow = h('div.device-flow');
  const redirect = chrome.identity.getRedirectURL();
  const connect = async () => {
    clear(flow).append(h('div.loading-inline', h('div.ring'), 'Opening Trakt authorization…'));
    try {
      await trakt.saveConfig(clientId);
      await trakt.connectPKCE();
      toast('Trakt connected successfully');
      redraw();
      await trakt.sync(true);
    } catch (e) { clear(flow).append(h('p.error', e.message)); }
  };
  return card('Trakt', 'Sign in securely with the Trakt app you already registered. No password or Client Secret is needed.',
    status(false, 'Not connected'),
    h('p.muted.small', 'Registered Chrome redirect: ', h('code.copyable', { title:'Copy redirect', on:{click:async()=>toast(await copyText(redirect)?'Copied':'Copy failed')} }, redirect)),
    h('p.muted.small', 'Client ID already configured for Beacon. Trakt opens a secure sign-in window to authorize access.'),
    h('div.btn-row', btn('Connect Trakt', { icon:'link', kind:'primary', onClick:connect })), flow);

}

/* ---------------- Premiumize ---------------- */
function premiumizeCard(redraw) {
  if (pm.connected()) {
    const a = pm.account;
    return card('Premiumize', 'Your cloud library, instant availability checks and playback links.',
      status(true, a?.premium_until ? `Premium until ${fmtDate(a.premium_until * 1000)}` : 'Connected'),
      h('p.muted.small', [pm.files.length ? `${pm.files.length} videos in your cloud` : '', a?.space_used != null ? `${fmtBytes(a.space_used)} used` : '', pm.loadedAt ? `refreshed ${timeAgo(pm.loadedAt)}` : ''].filter(Boolean).join(' · ')),
      h('div.btn-row',
        btn('Refresh cloud', { icon: 'sync', kind: 'primary', onClick: async e => { e.currentTarget.classList.add('spinning'); await pm.refresh(true); pm.matchLibrary(); redraw(); } }),
        btn('Open Premiumize', { icon: 'cloud', kind: 'ghost', onClick: () => actions.navigate('#/premiumize') }),
        btn('Disconnect', { kind: 'ghost', onClick: async () => { if (await confirmDialog({ title: 'Disconnect Premiumize?', body: 'Removes the API key from Beacon. Your cloud files are not touched.', ok: 'Disconnect', danger: true })) { await pm.disconnect(); redraw(); } } })));
  }
  const key = h('input', { type: 'password', placeholder: 'Premiumize API key', autocomplete: 'off' });
  return card('Premiumize', 'Find your API key at premiumize.me › Account. It’s stored only in this Chrome profile.',
    status(false, 'Not connected'),
    field('API key', key),
    h('div.btn-row', btn('Connect & test', { icon: 'link', kind: 'primary', onClick: async e => {
      if (!key.value.trim()) return toast('Paste your API key first', { error: true });
      const b = e.currentTarget; b.disabled = true;
      try { await pm.connect(key.value); toast('Premiumize connected'); pm.matchLibrary(); redraw(); }
      catch (err) { toast('Premiumize: ' + err.message, { error: true }); b.disabled = false; }
    } })));
}

/* ---------------- TorBox ---------------- */
function torboxCard(redraw) {
  if (torbox.connected()) return card('TorBox', 'Optional second cloud service (from earlier Beacon versions).', status(true, 'Connected'),
    h('div.btn-row', btn('Disconnect', { kind: 'ghost', onClick: () => { setHubKey('torbox', ''); redraw(); } })));
  const key = h('input', { type: 'password', placeholder: 'TorBox API token', autocomplete: 'off' });
  return card('TorBox', 'Optional second cloud service (from earlier Beacon versions).', status(false, 'Not connected'), field('API token', key),
    h('div.btn-row', btn('Connect & test', { kind: 'ghost', onClick: async () => {
      const v = key.value.trim(); if (!v) return;
      try { await fetchJson('https://api.torbox.app/v1/api/user/me', { headers: { Authorization: 'Bearer ' + v } }); setHubKey('torbox', v); toast('TorBox connected'); redraw(); }
      catch (e) { toast('TorBox: ' + e.message, { error: true }); }
    } })));
}

/* ---------------- Playback ---------------- */
function playbackCard() {
  const P = prefs();
  const qKey = 'beacon:playback:preferences:v1';
  let q = '1080p'; try { q = JSON.parse(localStorage.getItem(qKey) || '{}').quality || '1080p'; } catch {}
  const qual = h('select', { on: { change: e => { let o = {}; try { o = JSON.parse(localStorage.getItem(qKey) || '{}'); } catch {} o.quality = e.target.value; o.sourceMode = 'manual'; localStorage.setItem(qKey, JSON.stringify(o)); toast('Source order updated'); } } },
    h('option', { value: '1080p' }, '1080p first'), h('option', { value: 'best' }, 'Highest quality first'), h('option', { value: '720p' }, '720p first'));
  qual.value = q;
  const fmt = h('select', { on: { change: e => setPref('preferTranscoded', e.target.value) } },
    h('option', { value: 'auto' }, 'Original, switch automatically if Chrome can’t play it'), h('option', { value: 'original' }, 'Always original file'), h('option', { value: 'transcoded' }, 'Prefer Premiumize browser-friendly stream'));
  fmt.value = P.preferTranscoded || 'auto';
  return card('Playback', 'Applies to movies and episodes played in Beacon’s player.',
    field('Source order', qual, 'Changes the order only. Sources Chrome can’t play are handled under Browser compatibility.'),
    field('Stream format', fmt, 'Premiumize can provide a browser-friendly MP4 when a file’s codec isn’t supported by Chrome.'),
    toggle('Up Next countdown', 'When an episode ends, count down and open the next episode’s sources.', P.upNextCountdown, v => setPref('upNextCountdown', v)),
    toggle('Auto-play next episode', 'Automatically play a source similar to the one you just used (same provider & quality). Off by default.', P.autoPlayNext, v => setPref('autoPlayNext', v)),
    h('p.muted.small', 'VLC: every source and the player’s ⋯ menu have “Copy link for VLC” — paste it into VLC › Media › Open Network Stream.'));
}

/* ---------------- Connection / VPN ---------------- */
function connectionCard() {
  return card('Connection & VPN', 'Beacon Hub sends every request through Chrome, so your browser VPN extension can cover it. This check confirms that it actually does.',
    connectionPanel().el,
    h('p.muted.small', 'For a full check, open Chrome’s developer tools (F12 › Network) while a channel plays, and make sure your VPN extension has no “bypass” rule for your IPTV or Premiumize addresses.'));
}

/* ---------------- Browser compatibility ---------------- */
function compatCard() {
  const mode = h('select', { on: { change: e => { setPref('compatFilter', e.target.value); toast('Source filter updated'); } } },
    h('option', { value: 'hide' }, 'Hide sources this browser can’t play (recommended)'),
    h('option', { value: 'off' }, 'Show every source'));
  mode.value = prefs().compatFilter || 'hide';
  const grid = h('div.cap-grid', CAP_LABELS.map(([k, label]) => h('div.cap.' + (caps[k] ? 'yes' : 'no'), icon(caps[k] ? 'check' : 'x'), label)));
  return card('Browser compatibility', 'Stay inside this browser: Beacon Hub reads each source’s file name (x265, DTS, DD+, AVI…) and compares it with what this Chrome can actually play.',
    field('Source filter', mode, 'Only sources marked “Won’t play here” are hidden, and they’re one click away (“Show them”). “Format unknown” sources always stay visible.'),
    h('div.legend', h('span.flag.plays', icon('check'), 'Plays in Chrome'), h('span.muted.small', 'both formats are named and supported'), h('span.flag.unknown', 'Format unknown'), h('span.muted.small', 'name doesn’t say enough to be sure'), h('span.flag.bad', icon('alert'), 'Won’t play here'), h('span.muted.small', 'names a format this browser can’t play')),
    h('div.field', h('span.field-label', 'This browser on this PC can play'), grid),
    h('p.muted.small', 'If a file still plays with no sound, the player offers Premiumize’s browser-friendly stream automatically.'));
}

/* ---------------- Sources ---------------- */
function sourcesCard() {
  const s = providerSummary();
  const addons = installedAddons();
  return card('Sources & providers', 'Your existing providers are unchanged — Beacon searches all enabled ones automatically when you pick a title or episode.',
    h('div.stat-row', h('div.stat', h('b', String(s.streamAddons)), h('small', 'stream add-ons enabled')), h('div.stat', h('b', String(addons.length)), h('small', 'add-ons installed')), h('div.stat', h('b', String(s.express)), h('small', 'Express providers enabled'))),
    h('div.btn-row', btn('Manage providers & add-ons', { icon: 'gear', kind: 'ghost', onClick: () => { location.href = 'media.html#providers'; } })));
}

/* ---------------- Live TV ---------------- */
function liveCard() {
  const on = iptv.signedIn();
  let host = ''; try { host = on ? new URL(iptv.account.server).host : ''; } catch {}
  return card('Live TV', 'Your IPTV channels, guide and favorites. Requests go straight from this browser to your provider.',
    status(on, on ? `Signed in as ${iptv.account.username} · ${host}` : 'Not signed in'),
    on ? h('p.muted.small', `${iptv.channels.length ? iptv.channels.length.toLocaleString() + ' channels · ' : ''}${iptv.favorites().length} favorites · login ${iptv.remember() ? 'remembered on this browser' : 'kept for this session only'}`) : null,
    h('div.btn-row',
      btn(on ? 'Open Live TV' : 'Sign in to Live TV', { icon: 'tv', kind: 'primary', onClick: () => actions.navigate('#/live') }),
      on ? btn('Sign out', { kind: 'ghost', onClick: async () => { if (await confirmDialog({ title: 'Sign out of Live TV?', body: 'Removes the saved IPTV login from this browser. Favorites stay saved.', ok: 'Sign out', danger: true })) { iptv.signOut(); actions.rerender(); } } }) : null,
      btn('Classic Live TV', { kind: 'ghost', onClick: () => { location.href = 'index.html'; } })));
}

/* ---------------- Home layout ---------------- */
function homeCard() {
  const P = prefs();
  const rows = [['home-continue', 'Continue Watching'], ['home-upnext', 'Next Episodes'], ['home-live', 'Live TV channels'], ['home-watchlist', 'My Trakt Watchlist'], ['home-lists', 'My Trakt Lists'], ['home-trending-movies', 'Trending Movies'], ['home-trending-shows', 'Trending TV Shows'], ['home-recent', 'Recently Released'], ['home-recommended', 'Recommended for Me'], ['home-pm', 'Recently Added to Premiumize']];
  const list = h('div.check-grid');
  for (const [id, label] of rows) list.append(h('label.check', h('input', { type: 'checkbox', checked: !P.hiddenRows?.[id], on: { change: e => { const hr = { ...prefs().hiddenRows }; if (e.target.checked) delete hr[id]; else hr[id] = true; setPref('hiddenRows', hr); } } }), h('span', label)));
  return card('Home screen', 'Choose which rows appear on Home. Click any row title to collapse it.',
    list,
    toggle('Rotate featured titles', 'The large banner at the top cycles through a few titles.', P.heroRotate, v => setPref('heroRotate', v)),
    h('div.btn-row', btn('Expand all collapsed rows', { kind: 'ghost small', onClick: () => { setPref('collapsed', {}); toast('All rows expanded'); } })));
}

/* ---------------- History ---------------- */
function historyCard() {
  const n = history.all().length;
  return card('Watch history', 'Resume positions and Continue Watching are saved in this Chrome profile.',
    h('p.muted.small', `${n} item${n === 1 ? '' : 's'} in Beacon’s local history.`),
    h('div.btn-row',
      btn('Clear Beacon watch history', { kind: 'danger', onClick: async () => {
        if (!(await confirmDialog({ title: 'Clear local watch history?', body: 'Removes resume positions and Beacon’s Continue Watching entries from this browser. Your Trakt history is NOT changed.', ok: 'Clear history', danger: true }))) return;
        history.clear(); toast('Local watch history cleared'); actions.rerender();
      } }),
      trakt.connected() ? btn('Clear Trakt playback progress…', { kind: 'ghost', onClick: async () => {
        const items = trakt.data.playback || [];
        if (!items.length) return toast('Trakt has no saved playback progress');
        if (!(await confirmDialog({ title: `Remove ${items.length} in-progress item${items.length === 1 ? '' : 's'} from Trakt?`, body: 'This deletes the paused-playback positions stored on your Trakt account (Trakt’s “Continue Watching”). Your watched history is not affected. This cannot be undone.', ok: 'Remove from Trakt', danger: true }))) return;
        let ok = 0; for (const p of items) { try { await trakt.removePlayback(p.id); ok++; } catch {} }
        toast(`Removed ${ok} item${ok === 1 ? '' : 's'} from Trakt`); actions.rerender();
      } }) : null,
      (prefs().hiddenPlayback || []).length ? btn('Unhide Continue Watching items', { kind: 'ghost', onClick: () => { setPref('hiddenPlayback', []); toast('Hidden items restored'); actions.rerender(); } }) : null));
}

function advancedCard() {
  return card('Backup & advanced', 'Encrypted settings backup, vendor packages and the classic Media Hub are still available.',
    h('div.btn-row', btn('Backup / restore settings', { kind: 'ghost', onClick: () => { location.href = 'media.html#accounts'; } }), btn('Classic Media Hub', { kind: 'ghost', onClick: () => { location.href = 'media.html'; } })),
    h('p.muted.small', 'Beacon Hub 1.2 · Chrome extension · Use only services and content you’re authorized to access.'));
}
