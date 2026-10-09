/* Failed-login limiter: at most `max` failures per key (client address) per `windowMs`.
 * In memory: a restart clears it, which is fine for a small group behind a login.
 */
'use strict';

export function failureLimiter({ max = 5, windowMs = 15 * 60e3, now = Date.now } = {}) {
  const hits = new Map();

  function recent(key) {
    const t = now();
    const list = (hits.get(key) || []).filter(x => t - x < windowMs);
    if (list.length) hits.set(key, list); else hits.delete(key);
    return list;
  }

  return {
    // → seconds until the next attempt is allowed, or 0
    blockedFor(key) {
      const list = recent(key);
      return list.length >= max ? Math.ceil((list[0] + windowMs - now()) / 1000) : 0;
    },
    fail(key) { hits.set(key, [...recent(key), now()]); },
    clear(key) { hits.delete(key); }
  };
}
