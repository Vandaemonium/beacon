/* What happened on Beacon, for the admin: today's numbers, the latest events, alerts and a daily summary.
 * - Counters per day in DATA_DIR/activity/<YYYY-MM-DD>.json (local time, TZ from compose).
 * - Alerts go to NOTIFY_URL (n8n's /webhook/activity → Discord), at most once an hour per kind.
 * - A daily summary at DIGEST_HOUR (default 21), with the shared accounts' days left.
 */
'use strict';

import { readFileSync, writeFileSync, mkdirSync, renameSync } from 'node:fs';
import { join } from 'node:path';

const day = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const ALERT_GAP_MS = 3600e3;
const ERROR_BURST = 5, ERROR_WINDOW_MS = 10 * 60e3;

function blank(date) {
  return { date, logins: 0, failedLogins: 0, watchers: {}, films: 0, live: 0, conversions: 0, peakViewers: 0,
    limitHits: { viewers: 0, live: 0, conversions: 0 }, turnedAway: [], silent: [], errors: 0, errorSamples: [] };
}

export function monitor({ dataDir, notifyUrl = '', digestHour = 21, log = {}, now = () => new Date(), post } = {}) {
  const dir = join(dataDir, 'activity');
  mkdirSync(dir, { recursive: true });
  const path = d => join(dir, `${d}.json`);
  const load = d => { try { return { ...blank(d), ...JSON.parse(readFileSync(path(d), 'utf8')) }; } catch { return blank(d); } };
  let today = load(day(now()));
  const recent = [];              // newest last, max 100: { at, kind, text }
  const lastAlert = new Map();    // kind → time
  const errorTimes = [];
  let saveTimer = null;
  const send = post || (body => fetch(notifyUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(10000) }));

  function roll() {
    const d = day(now());
    if (d !== today.date) { flush(); today = blank(d); }
    return today;
  }
  function flush() {
    clearTimeout(saveTimer); saveTimer = null;
    try { writeFileSync(path(today.date) + '.tmp', JSON.stringify(today, null, 1)); renameSync(path(today.date) + '.tmp', path(today.date)); } catch (e) { log.error?.('activity save failed: ' + e.message); }
  }
  const save = () => { if (!saveTimer) saveTimer = setTimeout(flush, 5000); };
  function note(kind, text) {
    recent.push({ at: now().toISOString(), kind, text });
    if (recent.length > 100) recent.shift();
  }

  async function notify(body) {
    if (!notifyUrl && !post) return false;
    try { const r = await send({ source: 'beacon', ...body }); return !r || r.ok !== false; } catch (e) { log.error?.('notify failed: ' + e.message); return false; }
  }
  function alert(kind, title, text) {
    const t = now().getTime();
    if (t - (lastAlert.get(kind) || 0) < ALERT_GAP_MS) return false;
    lastAlert.set(kind, t);
    notify({ ok: false, title, text });
    return true;
  }

  return {
    login(ok, name) {
      const d = roll();
      if (ok) d.logins++; else d.failedLogins++;
      note(ok ? 'login' : 'login-failed', ok ? `${name} signed in` : `failed sign-in as "${String(name).slice(0, 40)}"`);
      save();
    },
    // A person started watching (first stream while not already counted). what: film | live | convert
    watch(name, what, watchingNow, max) {
      const d = roll();
      d.watchers[name] = (d.watchers[name] || 0) + 1;
      if (what === 'live') d.live++; else d.films++;
      d.peakViewers = Math.max(d.peakViewers, watchingNow);
      note('watch', `${name} started ${what === 'live' ? 'Live TV' : 'a film'} (${watchingNow} of ${max} watching)`);
      save();
    },
    conversion(name, codec) {
      const d = roll(); d.conversions++;
      note('convert', `audio converted for ${name} (${codec || 'audio'} → AAC)`);
      save();
    },
    // Someone was refused: kind = viewers | live | conversions
    limit(kind, name, message) {
      const d = roll();
      d.limitHits[kind] = (d.limitHits[kind] || 0) + 1;
      if (d.turnedAway.length < 50) d.turnedAway.push({ at: now().toISOString(), kind, name });
      note('limit', `${name || 'someone'} turned away: ${message}`);
      save();
      const titles = { viewers: '🚦 Beacon is full', live: '📺 Live TV slots full', conversions: '🎧 Audio conversions full' };
      alert('limit-' + kind, titles[kind] || '🚦 Beacon limit reached', `${name || 'Someone'} was turned away: ${message}`);
    },
    silent(title, name) {
      const d = roll();
      if (d.silent.length < 50 && !d.silent.includes(title)) d.silent.push(title);
      note('silent', `no sound for ${name}: ${title}`);
      save();
    },
    error(where, message) {
      const d = roll(); d.errors++;
      if (d.errorSamples.length < 20) d.errorSamples.push({ at: now().toISOString(), where, message: String(message).slice(0, 200) });
      note('error', `${where}: ${message}`);
      save();
      const t = now().getTime();
      errorTimes.push(t);
      while (errorTimes.length && t - errorTimes[0] > ERROR_WINDOW_MS) errorTimes.shift();
      if (errorTimes.length >= ERROR_BURST) alert('errors', '⚠️ Beacon is hitting errors', `${errorTimes.length} errors in 10 minutes. Latest, in ${where}: ${message}`);
    },
    today: () => roll(),
    recent: () => [...recent].reverse(),
    flush,

    // The daily summary; accounts = [{ name, daysLeft }] from the shared providers.
    async digest(accounts = []) {
      const d = roll();
      const people = Object.entries(d.watchers).sort((a, b) => b[1] - a[1]);
      const hits = Object.entries(d.limitHits).filter(([, n]) => n).map(([k, n]) => `${n}× ${{ viewers: 'viewer limit', live: 'Live TV slots full', conversions: 'conversion limit' }[k] || k}`);
      const soon = accounts.filter(a => Number.isFinite(a.daysLeft) && a.daysLeft <= 7);
      const lines = [
        people.length ? `**Watched:** ${people.map(([n, c]) => `${n} (${c})`).join(', ')}` : '**Watched:** nobody today',
        `**Plays:** ${d.films} film${d.films === 1 ? '' : 's'}, ${d.live} Live TV · ${d.conversions} with audio converted · peak ${d.peakViewers} watching at once`,
        `**Sign-ins:** ${d.logins}${d.failedLogins ? ` · ${d.failedLogins} failed` : ''}`,
        hits.length ? `**Turned away:** ${hits.join(', ')}` : '',
        d.silent.length ? `**No sound reported:** ${d.silent.slice(0, 5).join('; ')}` : '',
        d.errors ? `**Errors:** ${d.errors} (latest: ${d.errorSamples.at(-1)?.message || ''})` : '',
        accounts.length ? `**Accounts:** ${accounts.map(a => `${a.name} ${Number.isFinite(a.daysLeft) ? `${a.daysLeft} day${a.daysLeft === 1 ? '' : 's'} left` : 'unknown'}`).join(' · ')}` : ''
      ].filter(Boolean);
      flush();
      const important = soon.length > 0 || hits.length > 0 || d.errors >= ERROR_BURST;
      await notify({ ok: !important, title: soon.length ? `📡 Beacon today · ⏳ ${soon.map(a => a.name).join(' and ')} ending soon` : '📡 Beacon today', text: lines.join('\n') });
      return lines;
    },
    // Run fn() every day at digestHour local time.
    schedule(fn) {
      const next = () => {
        const n = now(), t = new Date(n);
        t.setHours(digestHour, 0, 0, 0);
        if (t <= n) t.setDate(t.getDate() + 1);
        return t - n;
      };
      const tick = () => { Promise.resolve(fn()).catch(e => log.error?.('daily summary failed: ' + e.message)).finally(() => { timer = setTimeout(tick, next()); timer.unref?.(); }); };
      let timer = setTimeout(tick, next());
      timer.unref?.();
      return () => clearTimeout(timer);
    }
  };
}
