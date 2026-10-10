# Beacon

Beacon Hub is Barr's Chrome extension: Trakt, Premiumize and TorBox, Stremio-style add-ons, IPTV Live TV and
VLC playlists. This repo turns it into a website on Empyrean. It is served from Sol at
**<https://beacon.empyrean.cc>** behind a Jellyfin login, and it uses communal provider accounts whose keys
never leave the server.

The same `extension/` folder still loads in Chrome as Barr's extension. On the website, a few of its modules
switch to calling Beacon's server instead of Chrome's APIs.

## Layout

| Path | What it is |
|---|---|
| [`server/`](server/) | The backend. Node, no dependencies. Handles login, the allowlist, communal accounts, stream links, audio conversion and monitoring. |
| [`web/`](web/) | The public sign-in and account page. |
| [`extension/`](extension/) | Barr's Beacon Hub UI. Served to signed-in users, and still a loadable Chrome extension. |
| [`Dockerfile`](Dockerfile) | The image Sol builds; compose uses this repo as its build context. |
| [`docs/`](docs/) | Everything written about Beacon. Start at [`docs/README.md`](docs/README.md). |
| [`scripts/`](scripts/) | Repo tooling: new history records and documentation checks. |

## Start here

- What it is and how it fits together: [`docs/architecture/overview.md`](docs/architecture/overview.md)
- Running it on Sol: [`docs/operations/deploy-sol.md`](docs/operations/deploy-sol.md)
- Working on it, for people and agents: [`AGENTS.md`](AGENTS.md) and [`docs/development/workflow.md`](docs/development/workflow.md)
- What happened and why: [`docs/history/`](docs/history/README.md) (append-only) and [`CHANGELOG.md`](CHANGELOG.md)

## Quick commands

```bash
cd server && npm test           # server tests (Node 22+, needs ffmpeg for the conversion tests)
node scripts/docs.mjs check     # documentation checks (links, record format, append-only history)
node scripts/docs.mjs new adr "Short title"   # start a new history record
```

## Rules that matter most

- No keys, passwords, settings backups or playlists in git (see [`.gitignore`](.gitignore)). Communal
  account keys live in Sol's `~/docker/.env`. **This repo is public.**
- `docs/history/` is append-only. Correct a record with a new one; never edit an old one.
- `backend` is what Sol runs. Work happens on other branches and merges through a pull request.
