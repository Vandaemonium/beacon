/* Beacon Hub 1.0 — full-screen player: custom controls, resume, progress saving, Trakt scrobbling, Up Next. */
/* global Hls */
'use strict';
import { h, btn, icon, toast, copyText, popover, menuItem } from './dom.js';
import { actions } from './actions.js';
import { history } from '../lib/history.js';
import { trakt } from '../lib/trakt.js';
import { prefs, emit, reportCompat } from '../lib/store.js';
import { epCode, fmtTime, seasonsFor } from '../lib/meta.js';
import { judge } from '../lib/compat.js';
import { downloadVlcPlaylist } from '../lib/vlc-playlist.js';

let ui = null, session = null, hideTimer = null;

function build() {
  const video = h('video.player-video', { playsInline: true, preload: 'auto' });
  const spinner = h('div.player-spinner', h('div.ring'));
  const flash = h('div.player-flash');
  const titleMain = h('div.pt-main'), titleSub = h('div.pt-sub');
  const sourceLabel = h('span.pt-source');
  const menuBtn = btn('', { icon: 'more', kind: 'round glass', title: 'Playback options' });
  const top = h('div.player-top', btn('', { icon: 'back', kind: 'round glass', title: 'Back (Esc)', onClick: () => close() }), h('div.player-titles', titleMain, titleSub), sourceLabel, menuBtn);
  const played = h('div.scrub-played'), buffered = h('div.scrub-buffered'), knob = h('div.scrub-knob'), hover = h('div.scrub-hover');
  const scrub = h('div.scrub', { role: 'slider', tabIndex: 0, 'aria-label': 'Seek' }, h('div.scrub-rail', buffered, played), knob, hover);
  const tCur = h('span.t-cur', '0:00'), tLeft = h('span.t-left', '');
  const playBtn = btn('', { icon: 'play', kind: 'ctl', title: 'Play (Space)' });
  const back10 = btn('', { icon: 'rewind', kind: 'ctl', title: 'Back 10 seconds (←)' });
  const fwd10 = btn('', { icon: 'forward', kind: 'ctl', title: 'Forward 10 seconds (→)' });
  const muteBtn = btn('', { icon: 'volume', kind: 'ctl', title: 'Mute (M)' });
  const vol = h('input.vol', { type: 'range', min: '0', max: '1', step: '0.05', 'aria-label': 'Volume' });
  const nextBtn = btn('Next Episode', { icon: 'next', kind: 'ctl text', title: 'Next episode' });
  const fsBtn = btn('', { icon: 'fullscreen', kind: 'ctl', title: 'Full screen (F)' });
  const mid = h('div.ctl-title');
  const bottom = h('div.player-bottom', h('div.scrub-row', scrub, tLeft), h('div.ctl-row', playBtn, back10, fwd10, h('div.vol-wrap', muteBtn, vol), tCur, mid, nextBtn, fsBtn));
  const chip = h('div.player-chip');
  const upnext = h('div.upnext');
  const error = h('div.player-error');
  const root = h('div.player', { role: 'dialog', 'aria-label': 'Video player', tabIndex: -1 }, video, spinner, flash, top, bottom, chip, upnext, error);
  document.body.append(root);
  ui = { root, video, spinner, flash, titleMain, titleSub, sourceLabel, menuBtn, scrub, played, buffered, knob, hover, tCur, tLeft, playBtn, back10, fwd10, muteBtn, vol, nextBtn, fsBtn, mid, chip, upnext, error };

  // volume
  const savedVol = Number(localStorage.getItem('beacon:ui:volume'));
  video.volume = Number.isFinite(savedVol) && savedVol >= 0 && savedVol <= 1 ? savedVol : 1;
  vol.value = String(video.volume);
  vol.addEventListener('input', () => { video.volume = Number(vol.value); video.muted = video.volume === 0; localStorage.setItem('beacon:ui:volume', vol.value); });
  muteBtn.onclick = () => { video.muted = !video.muted; };
  video.addEventListener('volumechange', () => muteBtn.replaceChildren(icon(video.muted || video.volume === 0 ? 'mute' : 'volume')));

  playBtn.onclick = () => togglePlay();
  back10.onclick = () => seekBy(-10); fwd10.onclick = () => seekBy(10);
  fsBtn.onclick = () => document.fullscreenElement ? document.exitFullscreen() : root.requestFullscreen?.().catch(() => {});
  nextBtn.onclick = () => goNext();
  menuBtn.onclick = e => optionsMenu(e.currentTarget);
  video.addEventListener('click', () => togglePlay());
  video.addEventListener('dblclick', () => fsBtn.click());

  // scrubbing
  const pctAt = e => { const r = scrub.getBoundingClientRect(); return Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)); };
  let dragging = false;
  scrub.addEventListener('pointerdown', e => { dragging = true; scrub.setPointerCapture(e.pointerId); seekPct(pctAt(e)); });
  scrub.addEventListener('pointermove', e => {
    const p = pctAt(e); hover.style.left = p * 100 + '%'; hover.textContent = fmtTime(p * (video.duration || 0));
    if (dragging) seekPct(p);
  });
  scrub.addEventListener('pointerup', () => { dragging = false; });
  scrub.addEventListener('keydown', e => { if (e.key === 'ArrowLeft') { seekBy(-10); e.preventDefault(); } if (e.key === 'ArrowRight') { seekBy(10); e.preventDefault(); } });

  // state
  video.addEventListener('play', () => { playBtn.replaceChildren(icon('pause')); onPlayState(true); });
  video.addEventListener('pause', () => { playBtn.replaceChildren(icon('play')); onPlayState(false); wake(); });
  video.addEventListener('waiting', () => root.classList.add('buffering'));
  video.addEventListener('playing', () => { root.classList.remove('buffering'); root.classList.remove('has-error'); });
  video.addEventListener('canplay', () => root.classList.remove('buffering'));
  video.addEventListener('timeupdate', onTime);
  video.addEventListener('progress', drawBuffered);
  video.addEventListener('loadedmetadata', onMeta);
  video.addEventListener('ended', onEnded);
  video.addEventListener('error', () => onError(video.error));

  root.addEventListener('pointermove', wake);
  root.addEventListener('keydown', onKeys);
  document.addEventListener('keydown', e => { if (root.classList.contains('open') && !root.contains(document.activeElement)) onKeys(e); });
}

function wake() {
  if (!ui) return;
  ui.root.classList.add('awake');
  clearTimeout(hideTimer);
  hideTimer = setTimeout(() => { if (!ui.video.paused && !document.querySelector('.popover')) ui.root.classList.remove('awake'); }, 3200);
}
function flashIcon(name) { ui.flash.replaceChildren(icon(name)); ui.flash.classList.remove('go'); void ui.flash.offsetWidth; ui.flash.classList.add('go'); }
function togglePlay() { if (ui.video.paused) { ui.video.play().catch(() => {}); flashIcon('play'); } else { ui.video.pause(); flashIcon('pause'); } }
function seekBy(s) { const v = ui.video; if (!Number.isFinite(v.duration)) return; v.currentTime = Math.max(0, Math.min(v.duration - 1, v.currentTime + s)); flashIcon(s < 0 ? 'rewind' : 'forward'); wake(); }
function seekPct(p) { const v = ui.video; if (Number.isFinite(v.duration)) v.currentTime = p * v.duration; }
function onKeys(e) {
  if (!ui.root.classList.contains('open') || e.target.closest?.('input:not(.vol), textarea')) return;
  if (document.querySelector('.popover') && e.key !== 'Escape') return;
  const k = e.key;
  if (k === ' ' || k === 'k') { e.preventDefault(); togglePlay(); }
  else if (k === 'ArrowLeft' || k === 'j') { e.preventDefault(); seekBy(-10); }
  else if (k === 'ArrowRight' || k === 'l') { e.preventDefault(); seekBy(10); }
  else if (k === 'ArrowUp') { e.preventDefault(); ui.video.volume = Math.min(1, ui.video.volume + 0.1); ui.vol.value = String(ui.video.volume); }
  else if (k === 'ArrowDown') { e.preventDefault(); ui.video.volume = Math.max(0, ui.video.volume - 0.1); ui.vol.value = String(ui.video.volume); }
  else if (k === 'f') ui.fsBtn.click();
  else if (k === 'm') ui.video.muted = !ui.video.muted;
  else if (k === 'Escape' && !document.fullscreenElement) { e.preventDefault(); e.stopPropagation(); close(); }
  wake();
}

function onTime() {
  const v = ui.video, d = v.duration;
  if (!Number.isFinite(d) || d <= 0) return;
  const p = v.currentTime / d;
  ui.played.style.width = p * 100 + '%';
  ui.knob.style.left = p * 100 + '%';
  ui.tCur.textContent = `${fmtTime(v.currentTime)} / ${fmtTime(d)}`;
  ui.tLeft.textContent = '-' + fmtTime(d - v.currentTime);
  ui.scrub.setAttribute('aria-valuenow', String(Math.round(p * 100)));
  if (session && !session.restoring) {
    if (Date.now() - session.savedAt > 10000) save();
    if (session.next && d - v.currentTime <= 40 && d > 300 && !session.upnextShown) showUpNext(false);
    // After a few seconds, check whether any audio was actually decoded (Chrome counts it).
    if (!session.audioChecked && v.currentTime > 6 && session.usingUrl !== session.alt && typeof v.webkitAudioDecodedByteCount === 'number') {
      session.audioChecked = true;
      const silent = v.webkitAudioDecodedByteCount === 0;
      reportCompat(session.title, !silent); // shared: tightens the "Plays in Chrome" labels for everyone
      if (silent && session.alt) showChip('No sound? This file’s audio format may not be supported by Chrome.', 'Switch to browser-friendly stream', () => switchStream(session.alt, true));
      else if (silent) showChip('No sound: Chrome can’t play this file’s audio. VLC can, or pick another source.', 'Download VLC playlist', () => saveVlcPlaylist(session));
    }
  }
}
function drawBuffered() {
  const v = ui.video;
  if (!v.buffered.length || !Number.isFinite(v.duration)) return;
  ui.buffered.style.width = (v.buffered.end(v.buffered.length - 1) / v.duration) * 100 + '%';
}
/** Returns a short reason when a file won't play correctly in THIS browser (codec probe), else ''. */
export function knownIncompatible(url, title) {
  let name = String(title || '');
  try { name += ' ' + decodeURIComponent(new URL(url).pathname.split('/').pop() || ''); } catch {}
  const j = judge(name);
  if (j.verdict !== 'no') return '';
  return j.problems.map(p => p.replace(/ \(no sound\)$/, '')).join(' and ') + ', which Chrome on this PC can’t play';
}

function onMeta() {
  const v = ui.video;
  if (!session) return;
  let target = session.resumeAt || 0;
  if (!target && session.resumePct) target = (session.resumePct / 100) * v.duration;
  if (target > 5 && Number.isFinite(v.duration) && target < v.duration - 30) {
    try { v.currentTime = target; } catch {}
    showChip(`Resumed at ${fmtTime(target)}${session.autoReason ? ' · browser-friendly version' : ''}`, 'Start over', () => { v.currentTime = 0; session.resumeAt = 0; });
  } else if (session.autoReason && !session.autoReasonShown) {
    const s = session;
    showChip(`Playing the browser-friendly version — this file uses ${s.autoReason}.`, 'Try original', () => switchStream(s.url, true), 9000);
  }
  if (session.autoReason) session.autoReasonShown = true;
  session.resumeAt = 0; session.resumePct = 0;
  session.restoring = false;
  v.play().catch(() => { ui.root.classList.add('awake'); });
}

function showChip(text, actionLabel, fn, ms = 8000) {
  ui.chip.replaceChildren(h('span', text), actionLabel ? btn(actionLabel, { kind: 'link', onClick: () => { fn(); ui.chip.classList.remove('show'); } }) : null);
  ui.chip.classList.add('show');
  clearTimeout(ui.chip._t); ui.chip._t = setTimeout(() => ui.chip.classList.remove('show'), ms);
}

function progressPct() { const v = ui.video; return Number.isFinite(v.duration) && v.duration > 0 ? (v.currentTime / v.duration) * 100 : 0; }
function save(final = false) {
  if (!session || session.restoring) return;
  const v = ui.video;
  const d = Number.isFinite(v.duration) ? v.duration : 0;
  const pos = v.currentTime || 0;
  if (!d && !pos) return;
  const completed = d > 60 && pos / d >= 0.9;
  session.savedAt = Date.now();
  history.update(session.item, session.ep, { position: completed ? d : pos, duration: d, url: session.url, source: session.label, completed: completed || undefined, sourceInfo: session.sourceInfo });
  if (final) emit('history');
}
async function onPlayState(playing) {
  if (!session || session.restoring) return;
  if (playing) {
    if (!session.started || session.paused) { session.started = true; session.paused = false; trakt.scrobble('start', session.item, session.ep, progressPct()); }
  } else if (!session.closing && !ui.video.ended) {
    session.paused = true; save(); trakt.scrobble('pause', session.item, session.ep, progressPct());
  }
}
function onEnded() {
  if (!session) return;
  save(true);
  stopScrobble(100);
  if (session.next) showUpNext(true); else wake();
}
function stopScrobble(pct) {
  if (!session || session.stopped || !session.started) return;
  session.stopped = true;
  trakt.scrobble('stop', session.item, session.ep, pct).then(r => { if (r?.action === 'scrobble') emit('history'); });
}

function onError(err) {
  if (!session) return;
  // Automatic fallback to Premiumize's browser-friendly (transcoded) stream.
  if (session.alt && session.usingUrl !== session.alt && !session.triedAlt) {
    session.triedAlt = true;
    toast('This file’s format isn’t supported by Chrome — switching to the browser-friendly stream');
    switchStream(session.alt, false);
    return;
  }
  const code = err?.code;
  const msg = code === 4 ? 'Chrome can’t play this file (usually HEVC/H.265 video Chrome can’t decode on this PC, or an AVI/WMV file).' : code === 2 ? 'The network connection to this stream failed.' : code === 3 ? 'The video couldn’t be decoded.' : 'This stream couldn’t be played.';
  const s = session;
  ui.error.replaceChildren(h('div.err-box', icon('alert'), h('h3', msg), h('p', 'Try a browser-friendly Premiumize stream when available. Otherwise copy the link to VLC on your computer (Media → Open Network Stream). A desktop VLC window cannot be embedded inside a Chrome extension.'),
    h('div.err-actions',
      s.alt && s.usingUrl !== s.alt ? btn('Try browser-friendly stream', { kind: 'primary', onClick: () => switchStream(s.alt, false) }) : null,
      btn('Choose another source', { kind: s.alt ? 'ghost' : 'primary', onClick: () => { const { item, ep, sourceInfo } = s; close(); actions.openSources(item, ep, { resumeAt: history.resumeAt(item, ep) }); } }),
      btn('Download VLC playlist (.m3u)', { kind: 'primary', onClick: () => saveVlcPlaylist(s) }),
      btn('Copy active link for VLC', { kind: 'ghost', onClick: async () => toast(await copyText(s.usingUrl || s.url) ? 'Link copied — VLC › Media › Open Network Stream' : 'Copy failed') }),
      btn('Close', { kind: 'ghost', onClick: () => close() }))));
  ui.root.classList.add('has-error');
}

function attach(url) {
  const v = ui.video;
  session.hls?.destroy(); session.hls = null;
  v.removeAttribute('src'); v.load();
  session.usingUrl = url;
  if (/\.m3u8(\?|$)/i.test(url) && window.Hls?.isSupported()) {
    const hl = new Hls({ enableWorker: true, maxBufferLength: 60 });
    session.hls = hl;
    hl.loadSource(url); hl.attachMedia(v);
    hl.on(Hls.Events.ERROR, (_e, d) => { if (d.fatal) onError({ code: 2 }); });
  } else v.src = url;
}
function switchStream(url, keepPos) {
  const pos = ui.video.currentTime;
  ui.root.classList.remove('has-error');
  session.restoring = true;
  session.resumeAt = (keepPos || pos > 5) ? pos : session.resumeAt;
  attach(url);
  ui.sourceLabel.textContent = session.label + (url === session.alt ? ' · browser-friendly' : '');
}

function saveVlcPlaylist(s) {
  try {
    const title = [s.item?.title || 'Beacon stream', s.ep ? epCode(s.ep.season, s.ep.number) : ''].filter(Boolean).join(' ');
    // Prefer the original URL for VLC because it can decode formats unsupported by Chrome.
    downloadVlcPlaylist(s.url || s.usingUrl, title);
    toast('VLC playlist downloaded — open the .m3u file from Chrome Downloads');
  } catch (e) { toast('VLC playlist: ' + e.message, { error: true }); }
}

function optionsMenu(anchor) {
  const s = session; if (!s) return;
  popover(anchor, (pop, close_) => {
    pop.append(h('div.pop-title', 'Playback'));
    if (s.alt) {
      pop.append(menuItem('Original quality', { checked: s.usingUrl === s.url, onClick: () => { close_(); if (s.usingUrl !== s.url) switchStream(s.url, true); } }));
      pop.append(menuItem('Browser-friendly stream (Premiumize)', { checked: s.usingUrl === s.alt, onClick: () => { close_(); if (s.usingUrl !== s.alt) switchStream(s.alt, true); } }));
    }
    pop.append(menuItem('Download VLC playlist (.m3u)', { icon: 'play', onClick: () => { close_(); saveVlcPlaylist(s); } }));
    pop.append(menuItem('Copy active link for VLC', { icon: 'copy', onClick: async () => { close_(); toast(await copyText(s.usingUrl) ? 'Link copied — VLC › Media › Open Network Stream' : 'Copy failed'); } }));
    pop.append(menuItem('Choose another source', { icon: 'search', onClick: () => { close_(); const { item, ep } = s; save(true); close(); actions.openSources(item, ep, { resumeAt: history.resumeAt(item, ep) }); } }));
  });
}

async function findNext(item, ep) {
  try {
    const seasons = await seasonsFor(item, trakt);
    const eps = seasons.filter(s => s.number > 0).flatMap(s => s.episodes);
    const i = eps.findIndex(e => e.season === ep.season && e.number === ep.number);
    const n = i >= 0 ? eps[i + 1] : null;
    return n && (!n.aired || Date.parse(n.aired) <= Date.now()) ? n : null;
  } catch { return null; }
}
function showUpNext(ended) {
  const s = session; if (!s?.next) return;
  s.upnextShown = true;
  const n = s.next;
  const countdown = ended && prefs().upNextCountdown;
  let secs = 10;
  const count = h('span.un-count', countdown ? String(secs) : '');
  const go = btn(prefs().autoPlayNext ? 'Play next episode' : 'Find sources', { icon: 'play', kind: 'primary', onClick: () => goNext() });
  ui.upnext.replaceChildren(h('div.un-kicker', 'Up next', count), h('div.un-title', `${epCode(n.season, n.number)}${n.title ? ' · ' + n.title : ''}`), h('div.un-actions', go, btn('Hide', { kind: 'ghost small', onClick: () => { clearInterval(s.unTimer); ui.upnext.classList.remove('show'); } })));
  ui.upnext.classList.add('show');
  if (countdown) {
    clearInterval(s.unTimer);
    s.unTimer = setInterval(() => { secs--; count.textContent = String(secs); if (secs <= 0) { clearInterval(s.unTimer); goNext(); } }, 1000);
  }
}
function goNext() {
  const s = session; if (!s?.next) return;
  const { item, next, sourceInfo } = s;
  close();
  actions.openSources(item, next, { autoPick: sourceInfo, autoPlay: prefs().autoPlayNext, resumeAt: history.resumeAt(item, next) });
}

export function play({ item, ep, url, alt, label, resumeAt = 0, resumePct = 0, sourceInfo, title }) {
  if (!ui) build();
  if (session) close(true);
  const v = ui.video;
  session = { item, ep, url, alt: alt && alt !== url ? alt : '', label: label || '', title: title || '', resumeAt, resumePct, sourceInfo, savedAt: Date.now(), restoring: true, started: false, next: null };
  // Prefer the transcoded stream immediately when the user chose that in Settings.
  const pref = prefs().preferTranscoded;
  // For unsupported-by-Chrome containers, use the browser-friendly cloud rendition first.
  // Only skip the original when the file name shows something Chrome definitely can't play.
  // Everything else (incl. most H.264 / HEVC MKVs) tries the original first and falls back automatically on error.
  const reason = pref === 'auto' && session.alt ? knownIncompatible(url, title) : '';
  const first = session.alt && (pref === 'transcoded' || reason) ? session.alt : url;
  session.autoReason = first === session.alt && pref !== 'transcoded' ? reason : '';
  ui.titleMain.textContent = item.title;
  ui.titleSub.textContent = ep ? `${epCode(ep.season, ep.number)}${ep.title ? ' · ' + ep.title : ''}` : (item.year ? String(item.year) : '');
  ui.mid.textContent = ep ? `${item.title} · ${epCode(ep.season, ep.number)}` : item.title;
  ui.sourceLabel.textContent = session.label + (first === session.alt ? ' · browser-friendly' : '');
  ui.nextBtn.classList.add('hidden');
  ui.upnext.classList.remove('show'); ui.chip.classList.remove('show'); ui.root.classList.remove('has-error');
  ui.played.style.width = '0'; ui.knob.style.left = '0'; ui.buffered.style.width = '0'; ui.tCur.textContent = '0:00'; ui.tLeft.textContent = '';
  ui.root.classList.add('open', 'awake', 'buffering');
  document.body.classList.add('player-open');
  // record the start locally right away (does not mark anything watched)
  history.update(item, ep, { url, source: session.label, sourceInfo });
  attach(first);
  ui.root.focus?.();
  wake();
  if (ep) findNext(item, ep).then(n => { if (session && session.item === item) { session.next = n; ui.nextBtn.classList.toggle('hidden', !n); } });
}

export function close(silent = false) {
  if (!session) return;
  const s = session;
  s.closing = true;
  clearInterval(s.unTimer);
  if (!s.restoring) save(true);
  const pct = progressPct();
  if (!s.stopped && s.started) stopScrobble(pct);
  s.hls?.destroy();
  session = null;
  const v = ui.video;
  v.pause(); v.removeAttribute('src'); v.load();
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  ui.root.classList.remove('open', 'awake', 'buffering', 'has-error');
  document.body.classList.remove('player-open');
  if (!silent) emit('history');
}

export const playerOpen = () => !!session;
window.addEventListener('beforeunload', () => { if (session) { save(); } });
