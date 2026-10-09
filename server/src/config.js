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
    appDir: env.APP_DIR || new URL('../../extension/', import.meta.url).pathname,
    jellyfinUrl: (env.JELLYFIN_URL || 'http://host.docker.internal:8096').replace(/\/+$/, ''),
    jellyfinApiKey: need(env, 'JELLYFIN_API_KEY'),
    sessionSecret: secret,
    // Empyrean's own Trakt app (not secret; Beacon uses PKCE, no client secret). Unset = the UI's built-in ID.
    traktClientId: env.TRAKT_CLIENT_ID || null,
    // The communal accounts (Sol's .env). Unset = that provider is off.
    premiumizeKey: env.PREMIUMIZE_API_KEY || '',
    torboxKey: env.TORBOX_API_KEY || '',
    // How many people may watch through Beacon at once: every stream uses Sol's home upload
    // (~37 Mbit/s measured 2026-10-09; a 1080p film is ~8 Mbit/s). Jellyfin shares that upload too.
    maxViewers: Number(env.MAX_VIEWERS || 4),
    // Alerts and the daily summary: n8n's activity webhook (-> Discord). Unset = none.
    notifyUrl: env.NOTIFY_URL || '',
    digestHour: Number(env.DIGEST_HOUR || 21),
    iptv: {
      server: env.IPTV_SERVER || '',
      username: env.IPTV_USERNAME || '',
      password: env.IPTV_PASSWORD || '',
      maxStreams: Number(env.IPTV_MAX_STREAMS || 1)
    },
    sessionDays: Number(env.SESSION_DAYS || 30),
    cookieSecure: env.COOKIE_SECURE !== 'false',
    // Only trust X-Forwarded-For when a proxy we run (Caddy, tailscale serve) is in front.
    trustProxy: env.TRUST_PROXY !== 'false',
    // Origins allowed to send state-changing requests (comma-separated). Empty = same host only.
    origins: (env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean)
  };
}
