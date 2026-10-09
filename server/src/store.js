/* Server-side state in DATA_DIR, as small JSON files written atomically.
 * - allowlist.json: { "<jellyfin user id>": { name, added, by } }
 *   Jellyfin admins are always allowed and never need an entry.
 * - users/<jellyfin user id>.json: { secrets: { "<key>": value } }
 *   What the extension kept in chrome.storage.local (Trakt sign-in, Trakt settings), per user.
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
  let defaults = { at: -1, value: null };

  return {
    // Re-read when the file changes, so an edit on Sol needs no restart.
    sharedDefaults() {
      let at;
      try { at = statSync(defaultsPath).mtimeMs; } catch { return null; }
      if (at !== defaults.at) defaults = { at, value: readJson(defaultsPath, null) };
      return defaults.value;
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
