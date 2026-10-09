/* The UI's "Plays in Chrome" labels (extension/app/lib/compat.js), run with a stub browser. */
'use strict';

import { test } from 'node:test';
import assert from 'node:assert/strict';

globalThis.window = {};
globalThis.document = { createElement: () => ({ canPlayType: () => '' }) };
globalThis.localStorage = { getItem: () => null, setItem() {} };
globalThis.location = { protocol: 'chrome-extension:' }; // as the extension; the website test switches to https
const { caps, judge, sourceCompat, setReports, releaseKey } = await import('../../extension/app/lib/compat.js');
const CHROME = { h264: true, hevc: true, av1: true, vp9: true, dv: false, aac: true, ac3: false, eac3: false, dts: false, truehd: false, opus: true, flac: true };
const reset = (extra = {}) => { Object.assign(caps, CHROME, extra); setReports({}); };

test('AAC + H.264 plays; Dolby, DTS and TrueHD do not', () => {
  reset();
  assert.equal(judge('Movie.2024.1080p.WEB-DL.H264.AAC-GRP').verdict, 'ok');
  assert.equal(judge('Movie 2024 1080p WEB-DL DDP5.1 H.264-GRP').verdict, 'no');
  assert.equal(judge('Movie.2024.1080p.BluRay.DTS-HD.MA.5.1.x264').verdict, 'no');
  assert.equal(judge('Movie.2024.2160p.TrueHD.Atmos.x265').verdict, 'no');
});

test('more spellings of Dolby audio are recognised', () => {
  reset();
  for (const n of ['Movie 2024 1080p E-AC-3 x264', 'Movie 2024 1080p AC-3 x264', 'Movie 2024 1080p DDPA5.1 x264', 'Movie 2024 1080p DD+A x264', 'Movie 2024 1080p Atmos x264']) {
    assert.equal(judge(n).verdict, 'no', n);
  }
  assert.equal(judge('Movie 2024 1080p LPCM x264').verdict, 'no');
});

test('"Dolby Vision" is video, not Dolby audio', () => {
  reset();
  assert.equal(judge('Movie 2024 2160p Dolby Vision HDR10 x265 AAC').info.audio, 'aac');
});

test('even a browser that claims Dolby gets no sound from Dolby in an MKV', () => {
  reset({ ac3: true, eac3: true });
  assert.equal(judge('Movie.2024.1080p.WEB-DL.DDP5.1.H.264-GRP.mkv').verdict, 'no');
  assert.equal(judge('Movie.2024.1080p.WEB-DL.DDP5.1.H.264-GRP').verdict, 'no', 'no extension: assume MKV, the usual');
  assert.equal(judge('Movie.2024.1080p.WEB-DL.DDP5.1.H.264-GRP.mp4').verdict, 'ok');
});

test('several audio tracks is a risk, not a promise', () => {
  reset();
  assert.equal(judge('Movie 2024 MULTi 1080p x264 AAC').verdict, 'maybe');
});

test("viewers' reports override the name, both ways", () => {
  reset();
  const silentName = 'Movie.2024.1080p.WEB-DL.H264.AAC-LIAR';
  const goodName = 'Movie 2024 1080p WEB-DL x264-NOAUDIOTAG';
  assert.equal(judge(goodName).verdict, 'unknown');
  setReports({ [releaseKey(silentName)]: { sound: 0, silent: 2 }, [releaseKey(goodName)]: { sound: 1, silent: 0 } });
  const s = sourceCompat({ title: silentName });
  assert.equal(s.verdict, 'no');
  assert.match(s.problems[0], /reported by a Beacon viewer/);
  const g = sourceCompat({ title: goodName });
  assert.equal(g.verdict, 'ok');
  assert.equal(g.reported, true);
});

test('release keys match the server (letters and digits, single spaces, no extension)', async () => {
  const { compatKey } = await import('../src/app.js');
  for (const n of ['Movie.2024.1080p.WEB-DL.H264.AAC-GRP.mkv', 'Movie (2024) [1080p] x265 AAC 5.1', '  Odd__Name--Here  ']) {
    assert.equal(releaseKey(n), compatKey(n), n);
  }
});

test('website: audio-only problems play, because Sol converts the audio; video problems still do not', () => {
  reset();
  location.protocol = 'https:';
  try {
    const dd = sourceCompat({ title: 'Movie 2024 1080p WEB-DL DDP5.1 H.264-GRP' });
    assert.equal(dd.verdict, 'ok');
    assert.equal(dd.viaSol, true);
    assert.equal(sourceCompat({ title: 'Movie.2024.1080p.BluRay.TrueHD.7.1.x264' }).viaSol, true);
    assert.equal(sourceCompat({ title: 'Movie 2004 DVDRip XviD AC3' }).verdict, 'no', 'old video codec: converting audio does not help');
    assert.equal(sourceCompat({ title: 'Movie 2024 1080p x264 DDP5.1.avi' }).verdict, 'no', 'AVI file');
  } finally { location.protocol = 'chrome-extension:'; }
});
