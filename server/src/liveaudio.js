/* Live TV audio fix. Many IPTV channels send AC-3 / E-AC-3 (Dolby) audio, which Chrome's player
 * can't decode, so they play silently. For those channels only, each segment's audio is re-encoded
 * to AAC (video copied untouched, timestamps kept). AAC channels pass through unchanged.
 * Needs ffmpeg/ffprobe on PATH (the Docker image installs them); without them nothing changes.
 */
'use strict';

import { spawn, spawnSync } from 'node:child_process';

const FIX = new Set(['ac3', 'eac3']);
const PROBE_TTL_MS = 10 * 60e3;
const available = spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' }).status === 0
  && spawnSync('ffprobe', ['-version'], { stdio: 'ignore' }).status === 0;

function run(cmd, args, input, timeoutMs) {
  return new Promise((resolve, reject) => {
    // nice: Jellyfin and the shrink encoder keep priority over a few seconds of audio.
    const p = spawn('nice', ['-n', '10', cmd, ...args], { stdio: ['pipe', 'pipe', 'pipe'] });
    const out = [], err = [];
    const timer = setTimeout(() => { p.kill('SIGKILL'); reject(new Error(`${cmd} timed out`)); }, timeoutMs);
    p.stdout.on('data', c => out.push(c));
    p.stderr.on('data', c => err.push(c));
    p.on('error', e => { clearTimeout(timer); reject(e); });
    p.on('close', code => {
      clearTimeout(timer);
      if (code === 0) resolve(Buffer.concat(out));
      else reject(new Error(`${cmd} exited ${code}: ${Buffer.concat(err).toString().slice(0, 200)}`));
    });
    p.stdin.on('error', () => {});
    p.stdin.end(input);
  });
}

export function liveAudio({ enabled = true, log = {} } = {}) {
  const on = enabled && available;
  const codecs = new Map(); // channel → { codec, at }

  async function codecOf(channel, segment) {
    const hit = codecs.get(channel);
    if (hit && Date.now() - hit.at < PROBE_TTL_MS) return hit.codec;
    let codec = '';
    try {
      codec = (await run('ffprobe', ['-v', 'error', '-select_streams', 'a:0', '-show_entries', 'stream=codec_name', '-of', 'csv=p=0', '-i', 'pipe:0'], segment, 15000)).toString().split('\n').map(s => s.trim()).find(Boolean) || '';
      // (MPEG-TS lists each stream twice, once under its program: the first name is the one.)
    } catch {}
    codecs.set(channel, { codec, at: Date.now() });
    if (FIX.has(codec)) log.info?.(`live channel ${channel}: ${codec} audio, converting to AAC for browsers`);
    return codec;
  }

  return {
    on,
    // → the segment to send: converted when its channel's audio is AC-3/E-AC-3, otherwise as given
    async fix(channel, segment) {
      if (!on || !channel) return segment;
      if (!FIX.has(await codecOf(channel, segment))) return segment;
      try {
        return await run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-copyts', '-i', 'pipe:0',
          '-map', '0:v?', '-map', '0:a:0?', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-ac', '2',
          '-muxdelay', '0', '-muxpreload', '0', '-f', 'mpegts', 'pipe:1'], segment, 20000);
      } catch (e) {
        log.error?.(`live audio fix failed on channel ${channel}: ${e.message}`);
        return segment;
      }
    }
  };
}
