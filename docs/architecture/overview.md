# Architecture overview

*Living document: describes Beacon as it is now. Last checked against the code on 2026-10-09 (`backend` at `5ce8534`).*

## In one paragraph

A viewer opens `https://beacon.empyrean.cc` and signs in with their Jellyfin account. Beacon's server, a small
dependency-free Node service in a container on Sol, checks the password with Jellyfin and checks the user against
Beacon's allowlist. It then serves Barr's Beacon Hub UI. The UI runs in the browser as it does in Chrome, with one
difference: anything that needs a communal account (Premiumize, TorBox, IPTV) or a saved sign-in goes through the
server. The server adds the keys, rewrites every media URL into an encrypted expiring Beacon link, and fetches
everything outside Sol through Gluetun's ProtonVPN proxy. Video flows provider → Sol → viewer, so Sol's home upload
limits how many people can watch at once.

## Parts

```text
 browser ── https ──► Caddy (Sol) ──► beacon container :8796
                                      │
                                      ├─ web/            public: sign-in + account/admin page
                                      ├─ extension/      signed-in only: Barr's Beacon Hub UI (beacon.html, app/…)
                                      └─ server/src/     /api/* routes
                                           ├─ Jellyfin (host.docker.internal:8096, direct)       login, user list
                                           ├─ Gluetun HTTP proxy :8888 → ProtonVPN               every outside request
                                           │     Premiumize · TorBox · IPTV · Express search sites
                                           ├─ ffmpeg (in the image)                              audio → AAC
                                           ├─ n8n webhook → Discord                              alerts, daily summary
                                           └─ /data  (= Sol ~/docker/config/beacon)              allowlist, per-user secrets, reports, activity
```

The browser also talks **directly** to Trakt, Cinemeta and Stremio add-ons. All three allow cross-site requests,
and none of them needs a communal key.

| Part | Path | Notes |
|---|---|---|
| Server | `server/src/` | Entry `main.js`, routes in `app.js`. Details: [server.md](server.md) |
| Sign-in page | `web/` | `index.html`, `account.js`, `style.css`. Public. Also the admin's allowlist and the "Today on Beacon" panel |
| Beacon Hub UI | `extension/` | Barr's code, mostly unchanged. Website mode: [web-ui.md](web-ui.md) |
| Streaming | `providers.js`, `vault.js`, `convert.js`, `liveaudio.js` | [streaming.md](streaming.md) |
| Image | `Dockerfile` | `node:24-alpine` plus ffmpeg; copies `server/src`, `web`, `extension` |
| Deployment | Sol | [../operations/deploy-sol.md](../operations/deploy-sol.md) |

## Who can do what

| Who | Can |
|---|---|
| Anyone | See the sign-in page and `/api/health` |
| Allowed Jellyfin user | Use the whole UI, the communal accounts and their own saved settings (Trakt sign-in) |
| Jellyfin admin | All of the above, plus the allowlist, the activity panel and Premiumize deletes |
| Owner (Sol) | `.env` keys, limits, compose, Caddy, VPN. These are outside the app |

Jellyfin admins are always allowed. Everyone else must be ticked on "Who can use Beacon" (`allowlist.json`). Removing
someone takes effect on their next request.

## State

Beacon stores no database. Everything lives in small JSON files in `DATA_DIR`, which is Sol's `~/docker/config/beacon`:

| File | Holds |
|---|---|
| `allowlist.json` | Allowed Jellyfin user IDs, with who added them and when |
| `users/<id>.json` | Per-user saved values the extension kept in `chrome.storage.local` (Trakt tokens and settings) |
| `compat-reports.json` | "Did this release have sound in the browser?" reports from players (newest 5000) |
| `shared-defaults.json` | localStorage values every browser starts with (Barr's add-ons and Express packages); bump `version` to push |
| `activity/<date>.json` | Daily counters for the admin panel and the 21:00 summary |

Sessions are stateless signed cookies (`SESSION_SECRET`), so they survive restarts. Browser-side state (UI
preferences, metadata cache, watch history) stays in the browser's localStorage and IndexedDB, as in the extension.

## Key choices

Each of these has a decision record in [`../history/decisions/`](../history/decisions/):

- Barr's UI runs in the browser with minimal changes; a new server does what the extension's permissions used to do ([ADR-0001](../history/decisions/ADR-0001-website-with-a-thin-server.md)).
- Jellyfin accounts plus Beacon's own allowlist ([ADR-0002](../history/decisions/ADR-0002-jellyfin-login-and-allowlist.md)).
- Communal keys only on Sol; streams proxied through Sol ([ADR-0003](../history/decisions/ADR-0003-communal-accounts-proxied-through-sol.md)).
- All outside traffic through Gluetun, failing closed ([ADR-0004](../history/decisions/ADR-0004-provider-traffic-through-gluetun.md)).
- A Node server with no dependencies ([ADR-0005](../history/decisions/ADR-0005-dependency-free-node-server.md)).
- Empyrean's own Trakt app for the website ([ADR-0006](../history/decisions/ADR-0006-empyrean-trakt-app.md)).
- Sol converts audio browsers can't play ([ADR-0007](../history/decisions/ADR-0007-server-side-audio-conversion.md)).
- At most 4 people watching at once ([ADR-0008](../history/decisions/ADR-0008-viewer-limit-from-upload.md)).
- This repository layout and the append-only history ([ADR-0009](../history/decisions/ADR-0009-repo-layout-and-append-only-history.md)).

## Known gaps

- The extension's older pages (`media.html` "Classic Media Hub", `index.html` "Classic Live TV") are still linked
  from Settings. They were not adapted for the website and may try to use keys the browser doesn't have. Whether to
  keep them is Barr's call.
- `index.html` links `manifest.webmanifest`, which doesn't exist (404, harmless; already true in 1.2.1).
- Provider links are fetched through Gluetun's proxy. A hostile provider could return a hostname that resolves to
  `127.0.0.1` *inside the Gluetun container*. See [../security.md](../security.md).
- Per-user provider keys are designed but not built (see ADR-0003).
