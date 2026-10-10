# Server

*Living document. `server/`: Node 22+ (the image uses 24), ES modules, **no npm dependencies**.*

## Modules

| File | Does |
|---|---|
| `main.js` | Entry point: loads config, builds the app, listens on `PORT` (8796) |
| `config.js` | Reads every setting from the environment. Refuses to start without `SESSION_SECRET` (32+ chars) and `JELLYFIN_API_KEY`. See [../operations/configuration.md](../operations/configuration.md) |
| `app.js` | HTTP routing, auth checks, origin checks, the viewer limit, static files, security headers |
| `session.js` | Stateless signed cookies (`beacon_session` = base64url JSON `{uid,name,exp}` + HMAC) |
| `jellyfin.js` | Checks passwords against Jellyfin (30 s timeout), ends the Jellyfin session it created, lists users |
| `store.js` | JSON files in `DATA_DIR`, written atomically: allowlist, per-user secrets, compat reports, shared defaults |
| `ratelimit.js` | Failed-login limiter per client address (in memory) |
| `providers.js` | Communal Premiumize / TorBox / IPTV: path allowlists, key injection, link rewriting, Live TV slots |
| `vault.js` | AES-256-GCM tokens for stream links (encrypted, not just signed, because they carry provider URLs) |
| `upstream.js` | All outside fetches: refuses private/local addresses, pipes media with Range support |
| `convert.js` | Film/episode audio → AAC with ffmpeg, with seeking (`/info`, `/start`, `/aac`) |
| `liveaudio.js` | Live TV: re-encodes AC-3/E-AC-3 segment audio to AAC, AAC channels pass through |
| `monitor.js` | Daily counters, Discord alerts via n8n, the 21:00 summary |

## Routes

All `/api/*` responses are JSON unless noted. "User" means a signed-in, allowed user. "Admin" means a Jellyfin admin.

| Route | Who | Does |
|---|---|---|
| `GET /api/health` | anyone | Liveness (used by the Docker healthcheck) |
| `POST /api/login` `{username,password}` | anyone | Checks Jellyfin and the allowlist, sets the cookie. Failures are rate-limited; a slow Jellyfin gives 503 "media server busy" |
| `POST /api/logout` | user | Clears the cookie |
| `GET /api/me` | user | `{id,name,admin}` |
| `GET /api/config` | user | Trakt client ID, which communal providers exist, a Live TV stream key |
| `GET\|PUT\|DELETE /api/secrets/<key>` | user | That user's own saved values (what the extension kept in `chrome.storage.local`) |
| `GET\|POST /api/pm/<path>` | user | Premiumize with the communal key. Only allowlisted paths. `transfer/delete` and `transfer/clearfinished` are admin-only |
| `GET\|POST /api/tb/<path>` | user | TorBox with the communal key. Only allowlisted paths |
| `GET /api/iptv/player_api` | user | Xtream `player_api.php` with the login added on Sol and removed from the answer |
| `GET /api/iptv/live/<id>.m3u8` | user or `?k=` key | A live channel playlist, rewritten to Beacon links; counts against `IPTV_MAX_STREAMS` |
| `GET /api/stream/<token>` | token | The media itself, with Range support. No cookie needed (VLC) |
| `GET /api/stream/<token>/info`, `/start?t=`, `/aac?t=` | token | Audio conversion: see [streaming.md](streaming.md) |
| `GET /api/netcheck` | user | The address Sol's provider traffic leaves from (should be ProtonVPN) |
| `GET /api/compat` · `POST /api/compat/report` | user | Shared "did it have sound" reports |
| `GET /api/defaults` | user | Shared default settings (`shared-defaults.json`) |
| `GET /api/express/fetch?url=` | user | A search page for Barr's Express engine, fetched through the VPN. Only https hosts named in the shared Express packages |
| `GET /api/admin/users` · `POST /api/admin/allow` | admin | The allowlist |
| `GET /api/admin/activity` | admin | Today's counters, recent events, viewers and Live TV slots |
| anything else | — | Static files: `WEB_DIR` first (public), then `APP_DIR` (signed-in only; other users get `.html` → redirect to `/`, everything else → 401). Dotfiles are refused |

The full comment at the top of `server/src/app.js` is kept in step with this table. If you add a route, update both.

## Request protections

- **Origin check** on every state-changing request: same host, or `ALLOWED_ORIGINS`. Non-JSON posts are refused.
- **Body limit** 64 KB. Secret keys must match `^[A-Za-z0-9:._-]{1,64}$`.
- **Re-checks:** each request re-checks the allowlist. Jellyfin is re-asked about once a minute (`USER_TTL_MS`). If
  Jellyfin can't be reached, the last known answer is kept so signed-in people keep working.
- **Security headers** on every response, including a strict CSP: scripts only from `self`, and `connect-src`
  limited to `self` plus `https:`, so the UI can still call Trakt, Cinemeta and add-ons directly.
- **Trust proxy:** `X-Forwarded-For` is trusted only when `TRUST_PROXY` isn't `false`. On Sol, Caddy and
  `tailscale serve` are always in front.

## Tests

`cd server && npm test` runs `node --test 'test/*.test.js'`. These are 49 tests as of `5ce8534`, against fake Jellyfin and
provider servers. Some run real ffmpeg conversions, so `ffmpeg`/`ffprobe` must be on `PATH`. See
[../development/testing.md](../development/testing.md).
