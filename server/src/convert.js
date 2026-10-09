/* Movies and episodes whose audio browsers can't play (Dolby Digital/DD+, DTS, TrueHD): Sol converts
 * just the audio to AAC while streaming. Video is copied untouched, so this is cheap (measured on Sol
 * 2026-10-09: 2.4% of one core for DD+ 5.1, 4.6% for TrueHD 7.1, per viewer).
 *
 *   GET /api/stream/<token>/info      → { duration, video, audio: [{ index, codec, channels, default }] }
 *   GET /api/stream/<token>/aac?t=S   the film from S seconds: fragmented MP4, H.264/HEVC copied + AAC
 *                                     stereo. Seeking = a new request with a new t (the player handles it).
 * ffmpeg reads the original through Beacon's own /api/stream/<token> on 127.0.0.1, so it gets Range
 * requests and the VPN for free, and never sees a provider URL.
 */
'use strict';

import { spawn } from 'node:child_process';

const INFO_TTL_MS = 3600e3;

function cleanEnv() {
  // ffmpeg's input is Beacon itself on 127.0.0.1: keep proxies out of its way.
  const env = { ...process.env };
  for (const k of ['HTTP_PROXY', 'HTTPS_PROXY', 'http_proxy', 'https_proxy', 'NODE_USE_ENV_PROXY']) delete env[k];
  return env;
}

export function converter({ maxTotal = 10, maxPerUser = 2, log = {} } = {}) {
  const info = new Map();    // original URL → { at, value }
  const active = new Map();  // uid → count
  let total = 0;

  async function probe(localUrl, key) {
    const hit = info.get(key);
    if (hit && Date.now() - hit.at < INFO_TTL_MS) return hit.value;
    const out = await new Promise((resolve, reject) => {
      const p = spawn('ffprobe', ['-v', 'error', '-show_entries', 'format=duration:stream=index,codec_type,codec_name,channels:stream_disposition=default',
        '-of', 'json', '-i', localUrl], { env: cleanEnv() });
      const chunks = [];
      const timer = setTimeout(() => { p.kill('SIGKILL'); reject(new Error('Reading the file took too long')); }, 45000);
      p.stdout.on('data', c => chunks.push(c));
      p.on('error', e => { clearTimeout(timer); reject(e); });
      p.on('close', code => {
        clearTimeout(timer);
        if (code !== 0) return reject(new Error("Couldn't read this file's tracks"));
        try { resolve(JSON.parse(Buffer.concat(chunks).toString())); } catch { reject(new Error("Couldn't read this file's tracks")); }
      });
    });
    const streams = out.streams || [];
    const audio = streams.filter(s => s.codec_type === 'audio')
      .map((s, i) => ({ index: i, codec: s.codec_name, channels: s.channels || 0, default: !!s.disposition?.default }));
    const video = streams.find(s => s.codec_type === 'video' && !/^(mjpeg|png|bmp)$/.test(s.codec_name))?.codec_name || '';
    const value = { duration: Number(out.format?.duration) || 0, video, audio };
    info.set(key, { at: Date.now(), value });
    return value;
  }

  // → true if the slot was taken; release() must be called when the stream ends
  function take(uid) {
    const mine = active.get(uid) || 0;
    if (total >= maxTotal) return 'Sol is converting the most films it can right now. Try again in a few minutes.';
    if (mine >= maxPerUser) return `You already have ${maxPerUser} films converting. Close one first.`;
    active.set(uid, mine + 1); total++;
    let done = false;
    return () => { if (done) return; done = true; total--; const n = (active.get(uid) || 1) - 1; if (n) active.set(uid, n); else active.delete(uid); };
  }

  async function stream({ req, res, localUrl, key, user, start }) {
    const meta = await probe(localUrl, key);
    if (!meta.video) throw Object.assign(new Error('This file has no video track Beacon can stream'), { status: 415 });
    const track = Math.max(0, meta.audio.findIndex(a => a.default));
    const release = take(user.id);
    if (typeof release === 'string') throw Object.assign(new Error(release), { status: 429 });
    const t = Math.max(0, Math.min(Number(start) || 0, Math.max(0, meta.duration - 1)));
    const args = ['-n', '10', 'ffmpeg', '-hide_banner', '-loglevel', 'error', '-nostdin',
      '-ss', t.toFixed(2), '-i', localUrl,
      '-map', '0:v:0', ...(meta.audio.length ? ['-map', `0:a:${track}`] : []),
      '-c:v', 'copy', ...(meta.video === 'hevc' ? ['-tag:v', 'hvc1'] : []),
      '-c:a', 'aac', '-b:a', '192k', '-ac', '2', '-sn', '-dn',
      '-f', 'mp4', '-movflags', 'frag_keyframe+empty_moov+default_base_moof', 'pipe:1'];
    const p = spawn('nice', args, { env: cleanEnv(), stdio: ['ignore', 'pipe', 'pipe'] });
    const err = [];
    p.stderr.on('data', c => { if (err.length < 20) err.push(c); });
    log.info?.(`converting audio for ${user.name} from ${Math.round(t)} s (${meta.audio[track]?.codec || 'no audio'} → aac)`);
    res.writeHead(200, { 'Content-Type': 'video/mp4', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'X-Beacon-Start': t.toFixed(2) });
    p.stdout.pipe(res);
    const stop = () => { release(); if (p.exitCode === null) p.kill('SIGKILL'); };
    req.on('close', stop);
    res.on('close', stop);
    await new Promise(resolve => p.on('close', code => {
      release();
      if (code && !res.writableEnded && !req.destroyed) log.error?.(`audio conversion stopped (${code}): ${Buffer.concat(err).toString().slice(0, 200)}`);
      res.end();
      resolve();
    }));
  }

  return { probe, stream, busy: () => ({ total, maxTotal }) };
}
