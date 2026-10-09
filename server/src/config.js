/* Beacon server settings, read from the environment (Sol's ~/docker/.env via compose).
 * Nothing secret has a default: the server refuses to start without SESSION_SECRET.
 */
'use strict';

function need(env, name) {
  const v = env[name];
  if (!v) throw new Error(`${name} is not set`);
  return v;
}

export function loadConfig(env = process.env) {
  const secret = need(env, 'SESSION_SECRET');
  if (secret.length < 32) throw new Error('SESSION_SECRET must be at least 32 characters');
  return {
    port: Number(env.PORT || 8796),
    host: env.HOST || '0.0.0.0',
    dataDir: env.DATA_DIR || '/data',
    webDir: env.WEB_DIR || new URL('../../web/', import.meta.url).pathname,
    jellyfinUrl: (env.JELLYFIN_URL || 'http://host.docker.internal:8096').replace(/\/+$/, ''),
    jellyfinApiKey: need(env, 'JELLYFIN_API_KEY'),
    sessionSecret: secret,
    sessionDays: Number(env.SESSION_DAYS || 30),
    cookieSecure: env.COOKIE_SECURE !== 'false',
    // Only trust X-Forwarded-For when a proxy we run (Caddy, tailscale serve) is in front.
    trustProxy: env.TRUST_PROXY !== 'false',
    // Origins allowed to send state-changing requests (comma-separated). Empty = same host only.
    origins: (env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean)
  };
}
