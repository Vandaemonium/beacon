# Configuration

*Living document. Source of truth: `server/src/config.js`. On Sol, compose maps `BEACON_*` names in
`~/docker/.env` to the names below (see [deploy-sol.md](deploy-sol.md)).*

## Environment variables

| Variable | Default | Meaning |
|---|---|---|
| `SESSION_SECRET` | **required**, 32+ chars | Signs session cookies. Changing it signs everyone out |
| `JELLYFIN_API_KEY` | **required** | Lists Jellyfin users for the admin page |
| `JELLYFIN_URL` | `http://host.docker.internal:8096` | Where Jellyfin is (reached directly, not via the VPN) |
| `TRAKT_CLIENT_ID` | unset → the UI's built-in ID | Empyrean's own Trakt app (public; PKCE, no secret) |
| `PREMIUMIZE_API_KEY`, `TORBOX_API_KEY` | unset → provider off | Communal accounts |
| `IPTV_SERVER`, `IPTV_USERNAME`, `IPTV_PASSWORD` | unset → Live TV off | Communal IPTV (Xtream) login |
| `IPTV_MAX_STREAMS` | `1` (Sol sets 3) | Live TV channels open at once |
| `MAX_VIEWERS` | `4` | People watching at once (Sol's upload) |
| `NOTIFY_URL` | unset → no alerts | n8n webhook for alerts and the daily summary |
| `DIGEST_HOUR` | `21` | Hour of the daily summary (container `TZ`) |
| `PORT`, `HOST` | `8796`, `0.0.0.0` | Listen address |
| `DATA_DIR` | `/data` | State files (see [../architecture/overview.md#state](../architecture/overview.md#state)) |
| `WEB_DIR`, `APP_DIR` | `web/`, `extension/` next to `server/` | Static roots (the image sets `/app/web/`, `/app/extension/`) |
| `SESSION_DAYS` | `30` | Cookie lifetime |
| `COOKIE_SECURE` | on | Set `false` only for plain-http local testing |
| `TRUST_PROXY` | on | Trust `X-Forwarded-For` (Caddy / `tailscale serve` in front) |
| `ALLOWED_ORIGINS` | empty = same host | Extra origins allowed to send state-changing requests |
| `HTTP_PROXY`, `HTTPS_PROXY`, `NO_PROXY`, `NODE_USE_ENV_PROXY=1` | — | Send outside traffic through Gluetun. Keep Jellyfin and n8n in `NO_PROXY` |

## Files in `DATA_DIR` edited by hand

**`shared-defaults.json`** holds the settings every browser starts with: Barr's add-ons and Express packages.

```json
{ "version": 3, "local": { "beacon:<localStorage key>": "<string value>" } }
```

Only keys starting with `beacon:` are applied. A browser applies missing keys at any time. When `version` is
higher than the version it last applied, it overwrites its own values too, then reloads once. So **bump `version`
to push a change to everyone**. That replaces their local edits of those keys.

Everything else in `DATA_DIR` is written by the server. Don't edit it while the container runs.

## Running locally

```bash
cd server
SESSION_SECRET=$(openssl rand -base64 48) JELLYFIN_API_KEY=x JELLYFIN_URL=http://<a jellyfin>:8096 \
  DATA_DIR=$PWD/../data COOKIE_SECURE=false node src/main.js
```

`data/` is git-ignored. Without the provider variables, the UI shows those providers as off.
