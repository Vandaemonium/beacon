# The Beacon Hub UI on the website

*Living document. `extension/` is Barr's Beacon Hub 1.2.1, with the website changes below.*

## One folder, two ways to run

`extension/` is still a Manifest V3 Chrome extension: load it unpacked and it behaves like Barr's release. The
Beacon server also serves the same files to signed-in users. The code decides which mode it's in with
`onEmpyrean()` in `app/lib/store.js`: true when `chrome.storage` is missing and the page came over http(s).
`loadEmpyrean()` fetches `/api/config` once at startup, so later checks stay synchronous.

## Pages

| Page | Loads | On the website |
|---|---|---|
| `beacon.html` | `app/ui/main.js` (ES modules), `preferences.js`, `express.js`, `vendor/hls.min.js`, `app/ui/beacon.css` | **The** UI. Home, Live TV, Movies, TV Shows, My Lists, Premiumize, Settings (hash routes `#/…`) |
| `index.html` | `app.js`, `hub-link.js`, `styles.css` | "Classic Live TV", linked from Settings. Not adapted for the website |
| `media.html` | `media.js`, `backup.js`, `experience.js`, `resolver.js`, `express.js`, `addon.js` | "Classic Media Hub": providers, add-ons, backup/restore. Linked from Settings and the source sheet. Not adapted |
| `background.js` | — | Extension only: opens `beacon.html` in a tab |

## What changed from 1.2.1, file by file

The full diff is `git diff 5dd0c98 backend -- extension/`, 16 files, about 350 lines.

| File | Change |
|---|---|
| `app/lib/store.js` | `onEmpyrean`, `loadEmpyrean`, `shared()`. `secrets.*` go to `/api/secrets/<key>` per user. Shared defaults (`applyDefaults`) and compat reports |
| `app/lib/trakt.js` | Website: PKCE sign-in by page redirect back to `/beacon.html`, using Empyrean's Trakt client ID from `/api/config`. Extension: `chrome.identity` as before. Both share `exchangeCode()` |
| `app/lib/premiumize.js`, `torbox.js` | Website: calls `/api/pm/*` and `/api/tb/*`; no key in the browser |
| `app/lib/iptv.js` | Website: channels and streams through `/api/iptv/*`; the login never reaches the browser |
| `app/lib/netcheck.js` | Website: shows Sol's outgoing VPN address (`/api/netcheck`) |
| `app/lib/vlc-playlist.js` | Absolute Beacon links in `.m3u` files, so VLC can open them |
| `app/lib/compat.js` | Stricter "Plays in Chrome" labels: files are judged by `canPlayType`, Dolby-in-MKV is never trusted, shared sound reports override the release name. Audio-only problems read "Sol converts the audio" |
| `app/lib/sources.js` | Website: ignores Premiumize's `transcoded` flag (its instant links were the original file, see EXP-0001) |
| `app/ui/player.js` | `cur()/dur()/seekTo()` so converted streams can seek by restarting at a new time. Automatic switch to converted audio. A sound check after 6 s, then a report. The server's own error messages are shown |
| `app/ui/live-player.js` | Shows the server's messages (viewer limit, Live TV slots, expired link) |
| `app/ui/settings.js` | Shows "shared account" cards instead of key fields, the correct Trakt return address, and a link back to the account page |
| `app/ui/main.js` | Startup: `loadEmpyrean`, `applyDefaults` (reloads once if they changed anything), compat reports, Trakt redirect return, a 6-hourly refresh of the Live TV stream key, and a "Beacon account" footer link |
| `app/ui/sheet.js`, `beacon.css` | Source labels ("Sol converts the audio", "confirmed") and the footer link style |
| `express.js` | Website: search pages go through `/api/express/fetch` (the VPN) |

The extension keeps its own behavior in every case: Barr's Trakt client ID, `chrome.identity` and keys in the browser.

## Talking to outside services from the browser

On the website, the browser still calls these directly, without Beacon's server:

- **Trakt** (`api.trakt.tv`): lists, history, scrobbling. The user's tokens are stored on Sol and fetched by the UI.
- **Cinemeta** and **Stremio add-ons**: metadata and source lists. They allow cross-site requests (checked 2026-10-09).

Everything that needs a communal key, or that would reveal the viewer's address to a debrid or IPTV provider, goes
through the server.

## Rules for changing it

- Keep it working as an extension. Put website behavior behind `onEmpyrean()`.
- Don't move files that `manifest.json` or the HTML pages load by relative path.
- Coordinate bigger changes with Barr (see [AGENTS.md](../../AGENTS.md)).
