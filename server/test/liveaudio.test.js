/* Live TV audio fix: AC-3 segments become AAC, AAC segments pass through. Skipped without ffmpeg. */
'use strict';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { liveAudio } from '../src/liveaudio.js';

const hasFfmpeg = spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' }).status === 0;

function clip(audioCodec) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error',
    '-f', 'lavfi', '-i', 'testsrc=size=320x240:rate=25:duration=2', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=2',
    '-c:v', 'libx264', '-preset', 'ultrafast', '-c:a', audioCodec, '-ac', '2', '-f', 'mpegts', 'pipe:1'], { maxBuffer: 64e6 });
  assert.equal(r.status, 0, r.stderr?.toString());
  return r.stdout;
}

function streams(buf) {
  const r = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type,codec_name', '-of', 'csv=p=0', '-i', 'pipe:0'], { input: buf });
  return [...new Set(r.stdout.toString().split('\n').map(s => s.trim()).filter(Boolean))].sort();
}

test('AC-3 audio becomes AAC; video is copied', { skip: !hasFfmpeg && 'ffmpeg not installed' }, async () => {
  const fix = liveAudio();
  const src = clip('ac3');
  assert.deepEqual(streams(src), ['ac3,audio', 'h264,video']);
  const out = await fix.fix('101', src);
  assert.deepEqual(streams(out), ['aac,audio', 'h264,video']);
});

test('AAC channels pass through byte for byte', { skip: !hasFfmpeg && 'ffmpeg not installed' }, async () => {
  const fix = liveAudio();
  const src = clip('aac');
  assert.equal(await fix.fix('202', src), src);
});

test('switched off, or not a channel: untouched', async () => {
  const buf = Buffer.from('not video');
  assert.equal(await liveAudio({ enabled: false }).fix('1', buf), buf);
  assert.equal(await liveAudio().fix('', buf), buf);
});
