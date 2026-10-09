/* Server-side state in DATA_DIR, as small JSON files written atomically.
 * - allowlist.json: { "<jellyfin user id>": { name, added, by } }
 *   Jellyfin admins are always allowed and never need an entry.
 * - users/<jellyfin user id>.json: { secrets: { "<key>": value } }
 *   What the extension kept in chrome.storage.local (Trakt sign-in, Trakt settings), per user.
 * - compat-reports.json: { "<normalised release name>": { sound, silent, at } }
 *   What viewers' players found: did this release actually have sound in the browser?
 * - shared-defaults.json: { version, local: { "<localStorage key>": "<value>" } }
 *   Settings every browser starts with (Barr's add-ons and Express packages). Edited by hand on Sol;
 *   bump "version" to push a change to everyone.
 */
'use strict';

import { readFileSync, writeFileSync, renameSync, mkdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

function readJson(path, fallback) {
  try { return JSON.parse(readFileSync(path, 'utf8')); } catch (e) {
    if (e.code === 'ENOENT') return fallback;
    throw e;
  }
}

function writeJson(path, value) {
  const tmp = path + '.tmp';
  writeFileSync(tmp, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
  renameSync(tmp, path);
}

export function openStore(dataDir) {
  mkdirSync(dataDir, { recursive: true });
  const allowPath = join(dataDir, 'allowlist.json');
  let allow = readJson(allowPath, {});
  const usersDir = join(dataDir, 'users');
  mkdirSync(usersDir, { recursive: true });
  const userPath = uid => {
    if (!/^[A-Za-z0-9-]{1,64}$/.test(uid)) throw new Error('bad user id');
    return join(usersDir, uid + '.json');
  };
  const userData = uid => readJson(userPath(uid), { secrets: {} });
  const defaultsPath = join(dataDir, 'shared-defaults.json');
  const reportsPath = join(dataDir, 'compat-reports.json');
  let reports = readJson(reportsPath, {});
  let defaults = { at: -1, value: null };

  return {
    // Re-read when the file changes, so an edit on Sol needs no restart.
    sharedDefaults() {
      let at;
      try { at = statSync(defaultsPath).mtimeMs; } catch { return null; }
      if (at !== defaults.at) defaults = { at, value: readJson(defaultsPath, null) };
      return defaults.value;
    },
    compatReports() { return reports; },
    // One viewer's result for one release; keeps the newest 5000 releases.
    reportCompat(key, sound) {
      const r = reports[key] || { sound: 0, silent: 0 };
      const next = { ...reports, [key]: { sound: r.sound + (sound ? 1 : 0), silent: r.silent + (sound ? 0 : 1), at: new Date().toISOString() } };
      const keys = Object.keys(next);
      if (keys.length > 5000) keys.sort((a, b) => next[a].at.localeCompare(next[b].at)).slice(0, keys.length - 5000).forEach(k => delete next[k]);
      reports = next;
      writeJson(reportsPath, reports);
      return reports[key];
    },
    isAllowed(uid) { return Object.hasOwn(allow, uid); },
    allowlist() { return { ...allow }; },
    allow(uid, name, by) {
      allow = { ...allow, [uid]: { name, added: new Date().toISOString(), by } };
      writeJson(allowPath, allow);
    },
    revoke(uid) {
      if (!Object.hasOwn(allow, uid)) return;
      const next = { ...allow };
      delete next[uid];
      allow = next;
      writeJson(allowPath, allow);
    },

    secret(uid, key) {
      const s = userData(uid).secrets;
      return Object.hasOwn(s, key) ? s[key] : null;
    },
    setSecret(uid, key, value) {
      const d = userData(uid);
      writeJson(userPath(uid), { ...d, secrets: { ...d.secrets, [key]: value } });
    },
    delSecret(uid, key) {
      const d = userData(uid);
      if (!Object.hasOwn(d.secrets, key)) return;
      const secrets = { ...d.secrets };
      delete secrets[key];
      writeJson(userPath(uid), { ...d, secrets });
    }
  };
}
