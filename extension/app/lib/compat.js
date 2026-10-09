/* Beacon Hub 1.1 — what can THIS Chrome actually play?
 * Probes the browser's real codec support once, then reads release names (x265, DTS, DDP5.1, AVI…)
 * to decide whether a source will play inside this browser or would need an external player such as VLC.
 */
'use strict';
import { prefs } from './store.js';

// Movies and episodes play as plain files (<video src>), so only canPlayType counts. MediaSource support
// (streaming, used by Live TV) is a different path: some Chrome builds accept Dolby there but have no
// Dolby decoder for files, which labelled DD+ releases "Plays in Chrome" and then played them silently.
function probe(types) {
  const v = document.createElement('video');
  return types.some(t => { try { return v.canPlayType(t) !== ''; } catch { return false; } });
}

/* What Beacon viewers' players actually found (website only): { "<release key>": { sound, silent } }. */
let reports = {};
export function setReports(r) { reports = r && typeof r === 'object' ? r : {}; }
export const releaseKey = t => String(t || '').toLowerCase().replace(/\.(mkv|mp4|m4v|avi|webm)$/, '').replace(/[^a-z0-9]+/g, ' ').trim().slice(0, 200);
function reported(name) {
  const r = reports[releaseKey(name)];
  if (!r) return '';
  if (r.silent > r.sound) return 'silent';
  return r.sound > 0 ? 'sound' : '';
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
  // Several audio tracks: the browser plays the first, which may not be the one the name lists.
  out.multiAudio = /\b(multi|dual|dual ?audio|2 ?audio|multi ?audio|tri ?audio)\b/i.test(s);
  const A = re => new RegExp('\\b(?:' + re + ')(?![a-z])', 'i').test(s);
  if (A('true ?hd')) out.audio = 'truehd';
  else if (A('dts(?:[ -]?(?:hd|x|ma|es))?')) out.audio = 'dts';
  else if (A('ddpa?|dd\\+a?|eac3|e-?ac-?3|e ac 3|dolby digital plus|atmos')) out.audio = 'eac3';
  else if (A('dd|ac-?3|dolby digital|dolby(?! ?vision)')) out.audio = 'ac3';
  else if (A('l?pcm')) out.audio = 'pcm';
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
const AUDIO_NAMES = { aac: 'AAC', opus: 'Opus', flac: 'FLAC', mp3: 'MP3', ac3: 'Dolby Digital', eac3: 'DD+', dts: 'DTS', truehd: 'TrueHD', pcm: 'PCM' };
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
  // Even where the browser decodes Dolby, it doesn't in MKV files (the usual release format).
  if ((a.audio === 'ac3' || a.audio === 'eac3') && caps[a.audio] && a.container !== 'mp4' && a.container !== 'm4v') problems.push(`${AUDIO_NAMES[a.audio]} audio in an MKV (no sound)`);
  if (a.audio === 'pcm') problems.push('PCM audio (no sound)');
  if (a.multiAudio && audioOk(a.audio)) risks.push('several audio tracks — the first may have no sound here');
  if (a.dv && !a.hdr && !caps.dv) risks.push('Dolby Vision only — colors may look off');
  const known = [a.video ? VIDEO_NAMES[a.video] + ' video' : '', a.audio ? AUDIO_NAMES[a.audio] + ' audio' : ''].filter(Boolean);
  const missing = [!a.video ? 'video format' : '', !a.audio ? 'audio format' : ''].filter(Boolean);
  let verdict;
  if (problems.length) verdict = 'no';
  else if (videoOk(a.video) && audioOk(a.audio)) verdict = risks.length ? 'maybe' : 'ok';
  else verdict = risks.length ? 'maybe' : 'unknown';
  // What viewers' players actually found beats what the name suggests.
  const seen = reported(name);
  if (seen === 'silent') return { verdict: 'no', problems: ['no sound in Chrome (reported by a Beacon viewer)'], risks, known, missing, info: a, reported: true };
  if (seen === 'sound' && verdict !== 'no') return { verdict: 'ok', problems, risks: [], known, missing, info: a, reported: true };
  return { verdict, problems, risks, known, missing, info: a };
}

/** Is this source playable inside Beacon Hub (possibly through Premiumize's browser-friendly stream)? */
export function sourceCompat(src) {
  const r = reported(src.title);
  if (r) return judge(src.title);
  const j = judge([src.title, src.filenameHint, src.label].filter(Boolean).join(' '));
  // Premiumize already has a browser-friendly (transcoded) copy → plays regardless of the original's codecs.
  if (j.verdict !== 'ok' && src.transcoded) return { ...j, verdict: 'ok', viaFriendly: true };
  // Your own cloud files: Premiumize can usually serve a browser-friendly copy, so never hide them.
  if (j.verdict === 'no' && src.kind === 'pmfile') return { ...j, verdict: 'maybe', viaFriendly: true };
  return j;
}

export const filterMode = () => prefs().compatFilter || 'hide';   // 'hide' | 'off'
