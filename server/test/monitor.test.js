/* Beacon's monitoring: alerts (once an hour per kind), error bursts, the daily summary, day roll-over. */
'use strict';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { monitor } from '../src/monitor.js';

function setup(start = '2026-10-09T15:00:00') {
  const dataDir = mkdtempSync(join(tmpdir(), 'beacon-mon-'));
  let clock = new Date(start);
  const sent = [];
  const m = monitor({ dataDir, now: () => new Date(clock), post: async b => { sent.push(b); return { ok: true }; } });
  return { m, sent, dataDir, advance: ms => { clock = new Date(clock.getTime() + ms); }, done: () => rmSync(dataDir, { recursive: true, force: true }) };
}
const tick = () => new Promise(r => setImmediate(r));

test('a limit alert goes out once an hour per kind, but every hit is counted', async () => {
  const { m, sent, advance, done } = setup();
  m.limit('viewers', 'pat', 'Beacon is at its limit of 4 people watching right now.');
  m.limit('viewers', 'sam', 'Beacon is at its limit of 4 people watching right now.');
  m.limit('live', 'sam', 'All 3 Live TV slots are in use right now.');
  await tick();
  assert.deepEqual(sent.map(s => [s.source, s.ok, s.title]), [['beacon', false, '🚦 Beacon is full'], ['beacon', false, '📺 Live TV slots full']]);
  assert.match(sent[0].text, /pat was turned away/);
  advance(61 * 60e3);
  m.limit('viewers', 'lee', 'Beacon is at its limit of 4 people watching right now.');
  await tick();
  assert.equal(sent.length, 3, 'an hour later it alerts again');
  assert.deepEqual(m.today().limitHits, { viewers: 3, live: 1, conversions: 0 });
  done();
});

test('errors alert only in a burst (5 in 10 minutes)', async () => {
  const { m, sent, advance, done } = setup();
  for (let i = 0; i < 4; i++) { m.error('/api/pm', 'Premiumize took too long'); advance(60e3); }
  await tick();
  assert.equal(sent.length, 0);
  m.error('/api/pm', 'Premiumize took too long');
  await tick();
  assert.equal(sent.length, 1);
  assert.match(sent[0].text, /5 errors in 10 minutes/);
  done();
});

test('the daily summary says who watched and warns about accounts ending soon', async () => {
  const { m, sent, dataDir, done } = setup();
  m.login(true, 'pat'); m.login(false, 'nobody');
  m.watch('pat', 'film', 1, 4); m.watch('pat', 'live', 2, 4); m.watch('sam', 'film', 2, 4);
  m.conversion('pat', 'eac3');
  m.silent('Some.Movie.2024.1080p.WEB-DL.H264.AAC-GRP', 'sam');
  const lines = await m.digest([{ name: 'Premiumize', daysLeft: 18 }, { name: 'IPTV', daysLeft: 5 }]);
  assert.match(lines.join('\n'), /pat \(2\), sam \(1\)/);
  assert.match(lines.join('\n'), /2 films, 1 Live TV · 1 with audio converted · peak 2 watching/);
  assert.match(lines.join('\n'), /1 failed/);
  assert.match(lines.join('\n'), /No sound reported:\*\* Some\.Movie/);
  assert.equal(sent.at(-1).ok, false, 'an account ending within a week makes it stand out');
  assert.match(sent.at(-1).title, /IPTV ending soon/);
  assert.ok(existsSync(join(dataDir, 'activity', '2026-10-09.json')));
  done();
});

test('a new day starts fresh counts', () => {
  const { m, advance, done } = setup('2026-10-09T23:59:00');
  m.watch('pat', 'film', 1, 4);
  advance(2 * 60e3);
  assert.equal(m.today().date, '2026-10-10');
  assert.equal(m.today().films, 0);
  done();
});
