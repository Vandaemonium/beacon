/* Opaque, expiring tokens (AES-256-GCM). Used for stream links: they carry provider URLs that
 * can include an account login (IPTV) or a signed CDN path, so they are encrypted, not just signed.
 * A token works without a cookie, which is what lets VLC open a Beacon playlist.
 */
'use strict';

import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';

export function vault(secret) {
  const key = Buffer.from(hkdfSync('sha256', secret, 'beacon', 'stream-tokens', 32));
  return {
    seal(data, ttlMs) {
      const iv = randomBytes(12);
      const c = createCipheriv('aes-256-gcm', key, iv);
      const body = Buffer.concat([c.update(JSON.stringify({ ...data, exp: Date.now() + ttlMs })), c.final()]);
      return Buffer.concat([iv, c.getAuthTag(), body]).toString('base64url');
    },
    // → the sealed data, or null if forged, damaged or expired
    open(token) {
      try {
        const raw = Buffer.from(String(token), 'base64url');
        if (raw.length < 29) return null;
        const d = createDecipheriv('aes-256-gcm', key, raw.subarray(0, 12));
        d.setAuthTag(raw.subarray(12, 28));
        const data = JSON.parse(Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString());
        return data.exp > Date.now() ? data : null;
      } catch { return null; }
    }
  };
}
