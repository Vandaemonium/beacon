/* Server-side state in DATA_DIR, as small JSON files written atomically.
 * - allowlist.json: { "<jellyfin user id>": { name, added, by } }
 * Jellyfin admins are always allowed and never need an entry.
 */
'use strict';

import { readFileSync, writeFileSync, renameSync, mkdirSync } from 'node:fs';
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

  return {
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
    }
  };
}
