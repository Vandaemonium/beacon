/* Beacon Hub 1.1 — what can THIS Chrome actually play?
 * Probes the browser's real codec support once, then reads release names (x265, DTS, DDP5.1, AVI…)
 * to decide whether a source will play inside this browser or would need an external player such as VLC.
 */
'use strict';
import { prefs } from './store.js';

function probe(types) {
  const v = document.createElement('video');
  const ms = window.MediaSource;
  return types.some(t => { try { return v.canPlayType(t) !== '' || (ms?.isTypeSupported?.(t) ?? false); } catch { return false; } });
}

/** Codec support of this browser on this PC. Tests may overwrite fields. */
export const caps = {
  h264: probe(['video/mp4; codecs="avc1.640028"', 'video/mp4; codecs="avc1.42E01E"']),
  hevc: probe(['video/mp4; codecs="hvc1.1.6.L150.90"', 'video/mp4; codecs="hev1.1.6.L150.90"', 'video/mp4; codecs="hvc1.2.4.L153.B0"']),
  av1: probe(['video/mp4; codecs="av01.0.08M.08"', 'video/webm; codecs="av01.0.08M.08"']),
  vp9: probe(['video/webm; codecs="vp9"', 'video/mp4; codecs="vp09.00.10.08"']),
  dv: probe(['video/mp4; codecs="dvh1.05.06"', 'video/mp4; codecs="dvhe.05.06"']),
  aac: probe(['audio/mp4; codecs="mp4a.40.2"']),
  ac3: probe(['audio/mp4; codecs="ac-3"']),
  eac3: probe(['audio/mp4; codecs="ec-3"']),
  dts: probe(['audio/mp4; codecs="dtsc"', 'audio/mp4; codecs="dtsx"']),
  truehd: probe(['audio/mp4; codecs="mlpa"']),
  opus: probe(['audio/webm; codecs="opus"', 'audio/mp4; codecs="opus"']),
  flac: probe(['audio/mp4; codecs="flac"', 'audio/flac']),
};

export const CAP_LABELS = [
  ['h264', 'H.264 video'], ['hevc', 'HEVC / H.265 video'], ['av1', 'AV1 video'], ['dv', 'Dolby Vision'],
  ['aac', 'AAC audio'], ['ac3', 'Dolby Digital (AC-3)'], ['eac3', 'Dolby Digital Plus (DD+)'], ['dts', 'DTS audio'], ['truehd', 'Dolby TrueHD'],
];

/** Read codec hints out of a release / file name. */
export function analyze(name) {
  const s = ' ' + String(name || '').replace(/[._]/g, ' ') + ' ';
  const out = { video: '', audio: '', container: '', dv: false, hdr: false };
  const ext = String(name || '').match(/\.(mkv|mp4|m4v|webm|avi|wmv|flv|ts|m2ts|iso|mov|mpg|mpeg|rar|zip)(?:$|[?#\s])/i);
  if (ext) out.container = ext[1].toLowerCase();
  if (/\b(x265|h ?265|hevc)\b/i.test(s)) out.video = 'hevc';
  else if (/\bav1\b/i.test(s)) out.video = 'av1';
  else if (/\b(x264|h ?264|avc)\b/i.test(s)) out.video = 'h264';
  else if (/\b(xvid|divx|mpeg ?2|vc ?1)\b/i.test(s)) out.video = 'legacy';
  if (/\b(dolby ?vision|dovi|dv)\b/i.test(s)) out.dv = true;
  if (/\bhdr(10)?\+?\b/i.test(s)) out.hdr = true;
  const A = re => new RegExp('\\b(?:' + re + ')(?![a-z])', 'i').test(s);
  if (A('true ?hd')) out.audio = 'truehd';
  else if (A('dts(?:[ -]?(?:hd|x|ma|es))?')) out.audio = 'dts';
  else if (A('ddp|dd\\+|eac3|e ac 3|dolby digital plus')) out.audio = 'eac3';
  else if (A('dd|ac3|dolby digital')) out.audio = 'ac3';
  else if (A('aac')) out.audio = 'aac';
  else if (A('opus')) out.audio = 'opus';
  else if (A('flac')) out.audio = 'flac';
  else if (A('mp3')) out.audio = 'mp3';
  return out;
}

/**
 * verdict: 'ok' (plays in this browser), 'maybe' (probably plays, minor risk), 'no' (won't play / no sound here).
 * problems: short human reasons.
 */
const VIDEO_NAMES = { h264: 'H.264', hevc: 'HEVC', av1: 'AV1', legacy: 'old codec' };
const AUDIO_NAMES = { aac: 'AAC', opus: 'Opus', flac: 'FLAC', mp3: 'MP3', ac3: 'Dolby Digital', eac3: 'DD+', dts: 'DTS', truehd: 'TrueHD' };
const videoOk = v => (v === 'h264' && caps.h264) || (v === 'hevc' && caps.hevc) || (v === 'av1' && caps.av1);
const audioOk = a => (a === 'aac' && caps.aac) || (a === 'opus' && caps.opus) || (a === 'flac' && caps.flac) || a === 'mp3' || (a === 'ac3' && caps.ac3) || (a === 'eac3' && caps.eac3);

/**
 * verdict:
 *  'ok'      — video AND audio formats are named in the file name and this browser supports both (high confidence)
 *  'unknown' — nothing known to be unsupported, but the name doesn't say enough to promise it will play
 *  'maybe'   — formats look supported but there's a specific risk (e.g. Dolby Vision–only)
 *  'no'      — names a container / codec this browser can't play (likely incompatible)
 */
export function judge(name) {
  const a = analyze(name);
  const problems = [], risks = [];
  if (['avi', 'wmv', 'flv', 'ts', 'm2ts', 'iso', 'rar', 'zip', 'mpg', 'mpeg'].includes(a.container)) problems.push(`${a.container.toUpperCase()} file`);
  if (a.video === 'h264' && !caps.h264) problems.push('H.264 video');
  if (a.video === 'hevc' && !caps.hevc) problems.push('HEVC video');
  if (a.video === 'av1' && !caps.av1) problems.push('AV1 video');
  if (a.video === 'legacy') problems.push('old video codec');
  if (a.audio === 'dts' && !caps.dts) problems.push('DTS audio (no sound)');
  if (a.audio === 'truehd' && !caps.truehd) problems.push('TrueHD audio (no sound)');
  if (a.audio === 'eac3' && !caps.eac3) problems.push('DD+ audio (no sound)');
  if (a.audio === 'ac3' && !caps.ac3) problems.push('Dolby Digital audio (no sound)');
  if (a.dv && !a.hdr && !caps.dv) risks.push('Dolby Vision only — colors may look off');
  const known = [a.video ? VIDEO_NAMES[a.video] + ' video' : '', a.audio ? AUDIO_NAMES[a.audio] + ' audio' : ''].filter(Boolean);
  const missing = [!a.video ? 'video format' : '', !a.audio ? 'audio format' : ''].filter(Boolean);
  let verdict;
  if (problems.length) verdict = 'no';
  else if (videoOk(a.video) && audioOk(a.audio)) verdict = risks.length ? 'maybe' : 'ok';
  else verdict = risks.length ? 'maybe' : 'unknown';
  return { verdict, problems, risks, known, missing, info: a };
}

/** Is this source playable inside Beacon Hub (possibly through Premiumize's browser-friendly stream)? */
export function sourceCompat(src) {
  const j = judge([src.title, src.filenameHint, src.label].filter(Boolean).join(' '));
  // Premiumize already has a browser-friendly (transcoded) copy → plays regardless of the original's codecs.
  if (j.verdict !== 'ok' && src.transcoded) return { ...j, verdict: 'ok', viaFriendly: true };
  // Your own cloud files: Premiumize can usually serve a browser-friendly copy, so never hide them.
  if (j.verdict === 'no' && src.kind === 'pmfile') return { ...j, verdict: 'maybe', viaFriendly: true };
  return j;
}

export const filterMode = () => prefs().compatFilter || 'hide';   // 'hide' | 'off'
