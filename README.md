# Beacon

Beacon Hub (by Barr), becoming a web app on Empyrean: Trakt, Premiumize/TorBox, Stremio-style
add-ons, IPTV Live TV and VLC playlists, served from Sol behind a Jellyfin login.

- `extension/`: Beacon Hub 1.2.1 Chrome extension, unchanged. The starting point and reference.
- `docs/original/`: Barr's blueprint, friend guide and test-package notes for 1.2.1.
- `server/`: the backend (Node, no dependencies): Jellyfin login, allowlist, later the provider proxy. Tests: `cd server && npm test`.
- `web/`: what the browser loads. For now a sign-in page; step 3 brings the extension's UI here.
- `deploy/`: how it runs on Sol.

Rules: no keys, passwords, settings backups or playlists in git (see `.gitignore`).
Communal account keys live in Sol's `.env`, never in this repo.
