/* Beacon Hub 1.1 — Live TV player: full-screen, HLS via hls.js, now/next guide, channel surfing and a channel drawer. */
/* global Hls */
'use strict';
import { h, btn, icon, toast, copyText, clear, art } from './dom.js';
import { iptv, fmtClock, progressOf } from '../lib/iptv.js';

let ui = null, cur = null, hideTimer = null, epgTimer = null, watchdog = null;
const STALL_MS = 10000, START_MS = 20000, MAX_RETRIES = 3, BACKOFF = [0, 2000, 5000];

function build() {
  const video = h('video.player-video', { playsInline: true, autoplay: true });
  const name = h('div.pt-main'), now = h('div.pt-sub');
  const top = h('div.player-top',
    btn('', { icon: 'back', kind: 'round glass', title: 'Back (Esc)', onClick: () => close() }),
    h('div.player-titles', name, now), h('span.live-pill', h('i'), 'LIVE'),
    btn('', { icon: 'list', kind: 'round glass', title: 'Channels (C)', onClick: () => toggleDrawer() }));
  const playBtn = btn('', { icon: 'pause', kind: 'ctl', title: 'Pause (Space)', onClick: () => togglePlay() });
  const muteBtn = btn('', { icon: 'volume', kind: 'ctl', title: 'Mute (M)', onClick: () => { video.muted = !video.muted; } });
  const vol = h('input.vol', { type: 'range', min: '0', max: '1', step: '0.05', 'aria-label': 'Volume' });
  const prev = btn('', { icon: 'chevronLeft', kind: 'ctl', title: 'Previous channel (↑)', onClick: () => surf(-1) });
  const next = btn('', { icon: 'chevronRight', kind: 'ctl', title: 'Next channel (↓)', onClick: () => surf(1) });
  const guide = h('div.live-guide');
  const fs = btn('', { icon: 'fullscreen', kind: 'ctl', title: 'Full screen (F)', onClick: () => document.fullscreenElement ? document.exitFullscreen() : root.requestFullscreen?.().catch(() => {}) });
  const bottom = h('div.player-bottom', guide, h('div.ctl-row', playBtn, h('div.vol-wrap', muteBtn, vol), prev, next, h('div.ctl-title.live-chan'),
    btn('Channels', { icon: 'list', kind: 'ctl text', onClick: () => toggleDrawer() }), fs));
  const search = h('input.drawer-search', { type: 'search', placeholder: 'Find a channel…', 'aria-label': 'Find a channel' });
  const dlist = h('div.drawer-list', { role: 'list' });
  const drawer = h('aside.live-drawer', h('div.drawer-head', h('b.drawer-title', 'Channels'), btn('', { icon: 'x', kind: 'round ghost sm', title: 'Close list', onClick: () => toggleDrawer(false) })), search, dlist);
  const error = h('div.player-error');
  const spinner = h('div.player-spinner', h('div.ring'));
  const status = h('div.live-status', { role: 'status' });
  const root = h('div.player.live-player', { role: 'dialog', 'aria-label': 'Live TV player', tabIndex: -1 }, video, spinner, status, top, bottom, drawer, error);
  document.body.append(root);
  ui = { root, video, name, now, playBtn, muteBtn, vol, guide, drawer, dlist, search, error, status };

  const saved = Number(localStorage.getItem('beacon:ui:volume'));
  video.volume = Number.isFinite(saved) && saved >= 0 && saved <= 1 ? saved : 1;
  vol.value = String(video.volume);
  vol.addEventListener('input', () => { video.volume = Number(vol.value); video.muted = video.volume === 0; localStorage.setItem('beacon:ui:volume', vol.value); });
  video.addEventListener('volumechange', () => muteBtn.replaceChildren(icon(video.muted || video.volume === 0 ? 'mute' : 'volume')));
  video.addEventListener('play', () => {
    playBtn.replaceChildren(icon('pause'));
    // Coming back from a long pause: jump to the live edge instead of playing old buffered video.
    if (cur?.userPaused && Date.now() - cur.pausedAt > 30000 && cur.hls?.liveSyncPosition) { try { video.currentTime = cur.hls.liveSyncPosition; } catch {} }
    if (cur) { cur.userPaused = false; cur.lastProgressAt = Date.now(); }
  });
  video.addEventListener('pause', () => { playBtn.replaceChildren(icon('play')); wake(); });
  video.addEventListener('timeupdate', onProgress);
  video.addEventListener('ended', () => { if (cur) reconnect('The stream ended unexpectedly'); });
  video.addEventListener('waiting', () => root.classList.add('buffering'));
  video.addEventListener('playing', () => { root.classList.remove('buffering', 'has-error'); });
  video.addEventListener('click', () => togglePlay());
  video.addEventListener('dblclick', () => fs.click());
  video.addEventListener('error', () => { if (cur && !cur.hls) reconnect('Playback error'); });
  search.addEventListener('input', () => drawList());
  root.addEventListener('pointermove', wake);
  document.addEventListener('keydown', onKey, true);
}

function wake() {
  ui.root.classList.add('awake');
  clearTimeout(hideTimer);
  hideTimer = setTimeout(() => { if (!ui.video.paused && !ui.root.classList.contains('drawer-open')) ui.root.classList.remove('awake'); }, 3500);
}
function togglePlay() {
  if (ui.video.paused) ui.video.play().catch(() => {});
  else { if (cur) { cur.userPaused = true; cur.pausedAt = Date.now(); } ui.video.pause(); }
}
function onKey(e) {
  if (!cur || !ui.root.classList.contains('open')) return;
  if (e.target === ui.search) { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); toggleDrawer(false); } return; }
  const k = e.key;
  const handled = () => { e.preventDefault(); e.stopPropagation(); wake(); };
  if (k === 'Escape') { handled(); if (ui.root.classList.contains('drawer-open')) toggleDrawer(false); else if (!document.fullscreenElement) close(); }
  else if (k === ' ' || k === 'k') { handled(); togglePlay(); }
  else if (k === 'ArrowUp' || k === 'PageUp') { handled(); surf(-1); }
  else if (k === 'ArrowDown' || k === 'PageDown') { handled(); surf(1); }
  else if (k === 'f') { handled(); ui.root.querySelector('[title^="Full screen"]').click(); }
  else if (k === 'm') { handled(); ui.video.muted = !ui.video.muted; }
  else if (k === 'c' || k === 'l') { handled(); toggleDrawer(); }
}

function fail(msg) {
  if (!cur) return;
  const ch = cur.ch;
  clear(ui.error).append(h('div.err-box', icon('alert'), h('h3', msg),
    h('p', 'The channel may be offline, your provider may limit connections, or it may use a format browsers can’t play. Other channels should still work.'),
    h('div.err-actions',
      btn('Try again', { kind: 'primary', onClick: () => tune(ch) }),
      btn('Next channel', { kind: 'ghost', onClick: () => surf(1) }),
      btn('Copy stream link', { kind: 'ghost', onClick: async () => toast(await copyText(iptv.streamUrl(ch)) ? 'Stream link copied' : 'Copy failed') }),
      btn('Close', { kind: 'ghost', onClick: () => close() }))));
  ui.root.classList.add('has-error');
}

function attach(url) {
  const v = ui.video;
  cur.hls?.destroy(); cur.hls = null;
  v.removeAttribute('src'); v.load();
  cur.attachedAt = Date.now(); cur.lastProgressAt = Date.now(); cur.started = false;
  if (window.Hls?.isSupported()) {
    const hl = new Hls({ enableWorker: true, lowLatencyMode: false, liveSyncDurationCount: 3, maxBufferLength: 30, manifestLoadingMaxRetry: 2, levelLoadingMaxRetry: 3, fragLoadingTimeOut: 15000 });
    cur.hls = hl; let mediaRecovered = false;
    hl.loadSource(url); hl.attachMedia(v);
    hl.on(Hls.Events.MANIFEST_PARSED, () => v.play().catch(() => wake()));
    hl.on(Hls.Events.ERROR, (_e, d) => {
      if (!d.fatal || cur?.hls !== hl) return;
      // Website: Beacon refused it (Live TV slots or the viewer limit): say why instead of reconnecting.
      const st = d.response?.code;
      if (st === 429 || st === 401) {
        let why = ''; try { why = JSON.parse(d.networkDetails?.responseText || '{}').error || ''; } catch {}
        fail(why || 'Beacon can’t start this channel right now.');
        return;
      }
      if (!mediaRecovered && d.type === Hls.ErrorTypes.MEDIA_ERROR) { mediaRecovered = true; hl.recoverMediaError(); return; }
      reconnect(d.details === 'manifestLoadError' ? 'The channel isn’t responding' : 'The stream dropped');
    });
  } else { v.src = url; v.play().catch(() => wake()); }
}

/* ---------- stall watchdog & controlled reconnect ---------- */
function onProgress() {
  if (!cur) return;
  const t = ui.video.currentTime;
  if (t !== cur.lastT) {
    cur.lastT = t; cur.lastProgressAt = Date.now();
    if (!cur.started) { cur.started = true; cur.goodSince = Date.now(); }
    if (cur.retries && Date.now() - cur.goodSince > 45000) cur.retries = 0;   // healthy again
    if (ui.status.classList.contains('show') && cur.reconnecting) { cur.reconnecting = false; setStatus('Reconnected', 2500); }
  }
}
function setStatus(text, ms = 0) {
  ui.status.textContent = text;
  ui.status.classList.toggle('show', !!text);
  clearTimeout(ui.status._t);
  if (ms) ui.status._t = setTimeout(() => ui.status.classList.remove('show'), ms);
}
function checkStall() {
  if (!cur || cur.userPaused || cur.pendingRetry || ui.root.classList.contains('has-error') || !ui.root.classList.contains('open')) return;
  const now = Date.now();
  if (cur.started ? now - cur.lastProgressAt > STALL_MS : now - cur.attachedAt > START_MS) reconnect(cur.started ? 'The picture froze' : 'The channel is taking too long to start');
}
function reconnect(reason) {
  if (!cur || cur.pendingRetry) return;
  cur.retries = (cur.retries || 0) + 1;
  if (cur.retries > MAX_RETRIES) { setStatus(''); fail(`${reason}, and reconnecting didn’t help.`); return; }
  cur.reconnecting = true; cur.goodSince = Date.now();
  setStatus(`${reason} — reconnecting (${cur.retries} of ${MAX_RETRIES})…`);
  ui.root.classList.add('buffering');
  const ch = cur.ch;
  cur.pendingRetry = setTimeout(() => {
    if (!cur || cur.ch !== ch) return;
    cur.pendingRetry = null;
    attach(iptv.streamUrl(ch));
  }, BACKOFF[cur.retries - 1] || 5000);
}

function drawGuide() {
  if (!cur) return;
  const { ch } = cur;
  const list = iptv.epg.get(ch.id)?.list || [];
  const [n, nx] = list;
  ui.now.textContent = n ? `${n.title} · ${fmtClock(n.start)}–${fmtClock(n.end)}` : (cur.catName || '');
  clear(ui.guide);
  if (n) ui.guide.append(h('div.lg-now', h('span.lg-tag', 'NOW'), h('b', n.title), h('span.lg-time', `${fmtClock(n.start)} – ${fmtClock(n.end)}`), h('div.progress.inline', h('i', { style: { width: progressOf(n) * 100 + '%' } }))),
    nx ? h('div.lg-next', h('span.lg-tag.dim', 'NEXT'), h('span', nx.title), h('span.lg-time', fmtClock(nx.start))) : null);
}

function tune(ch) {
  clearTimeout(cur.pendingRetry);
  Object.assign(cur, { ch, retries: 0, pendingRetry: null, reconnecting: false, userPaused: false, lastT: -1 });
  setStatus('');
  cur.index = cur.list.findIndex(c => c.id === ch.id);
  ui.root.classList.remove('has-error'); ui.root.classList.add('buffering');
  ui.name.textContent = ch.name;
  ui.root.querySelector('.live-chan').textContent = `${cur.index + 1} / ${cur.list.length} · ${cur.listName || ''}`;
  iptv.markWatched(ch);
  attach(iptv.streamUrl(ch));
  drawGuide();
  iptv.guide(ch).then(() => { if (cur?.ch === ch) drawGuide(); });
  if (ui.root.classList.contains('drawer-open')) drawList();
  wake();
}
function surf(d) {
  if (!cur || cur.list.length < 2) return;
  const i = (cur.index + d + cur.list.length) % cur.list.length;
  tune(cur.list[i]);
}

function drawList() {
  const q = ui.search.value.trim().toLowerCase();
  const items = cur.list.filter(c => !q || c.name.toLowerCase().includes(q)).slice(0, 400);
  clear(ui.dlist);
  for (const c of items) {
    const row = h('button.drawer-item' + (c.id === cur.ch.id ? '.on' : ''), { type: 'button', role: 'listitem', on: { click: () => tune(c) } },
      h('span.di-logo', c.logo ? art(c.logo, { fallback: c.name.slice(0, 3) }) : h('span.di-fallback', c.name.slice(0, 3))),
      h('span.di-text', h('b', c.name), h('small', '')));
    ui.dlist.append(row);
    const sub = row.querySelector('small');
    const ep = iptv.epg.get(c.id)?.list?.[0];
    if (ep) sub.textContent = ep.title;
  }
  ui.dlist.querySelector('.on')?.scrollIntoView({ block: 'center' });
}
function toggleDrawer(force) {
  const open = force ?? !ui.root.classList.contains('drawer-open');
  ui.root.classList.toggle('drawer-open', open);
  if (open) { drawList(); setTimeout(() => ui.search.focus(), 50); } else ui.root.focus();
  wake();
}

/** list: the channels to surf through (current row / category); listName shown in the controls. */
export function playLive(ch, list = null, listName = '') {
  if (!ui) build();
  if (cur) cur.hls?.destroy();
  const L = list?.length ? list : iptv.visibleChannels();
  cur = { ch, list: L, listName, index: 0, hls: null, catName: iptv.categories.find(c => c.id === ch.cat)?.name || '' };
  ui.search.value = '';
  ui.root.classList.add('open', 'awake');
  ui.root.classList.remove('drawer-open');
  document.body.classList.add('player-open');
  ui.root.focus();
  tune(ch);
  clearInterval(watchdog);
  watchdog = setInterval(checkStall, 2000);
  clearInterval(epgTimer);
  epgTimer = setInterval(() => { if (cur) { drawGuide(); const n = iptv.epg.get(cur.ch.id)?.list?.[0]; if (n?.end && n.end < Date.now()) iptv.guide(cur.ch).then(drawGuide); } }, 30000);
}

export function close() {
  if (!cur) return;
  clearTimeout(cur.pendingRetry);
  cur.hls?.destroy();
  cur = null;
  clearInterval(epgTimer); clearInterval(watchdog);
  setStatus('');
  const v = ui.video; v.pause(); v.removeAttribute('src'); v.load();
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  ui.root.classList.remove('open', 'awake', 'buffering', 'has-error', 'drawer-open');
  document.body.classList.remove('player-open');
}
export const liveOpen = () => !!cur;
