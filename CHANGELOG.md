# Changelog

User-visible changes to Beacon on Empyrean, newest first. Barr's extension releases before 2026-10-09 are in
[docs/beacon-hub/](docs/beacon-hub/README.md). Why each change was made: [docs/history/](docs/history/_index.md).

## Unreleased (branch `restructure`)

- Repository reorganized: Barr's old release notes moved out of `extension/` into `docs/beacon-hub/`; deploy notes moved
  to `docs/operations/deploy-sol.md`; new living docs, an append-only history, `AGENTS.md`, `scripts/docs.mjs` and
  CI ([ADR-0009](docs/history/decisions/ADR-0009-repo-layout-and-append-only-history.md)). No change to what the site does.

## 2026-10-09: Beacon goes live

- **Sign-in survives a slow Jellyfin**: waits up to 30 s and gives a clear "busy" message (`5ce8534`).
- **Monitoring**: Discord alerts, a 21:00 daily summary with account days left, and "Today on Beacon" for admins (`9692023`).
- **Public** at https://beacon.empyrean.cc (`0bd973c`).
- **Viewer limit** of 4 people at once; both players show the server's reason when refused (`5ad767a`).
- **Converted film audio stays in sync**: keyframe start, and silence padding for late audio (`86438f8`, `5fe1631`).
- **Sol converts Dolby/DTS/TrueHD film audio to AAC**, with seeking (`9dae8f7`).
- "Plays in Chrome (browser-friendly)" no longer promised for Premiumize copies that are the original file (`52d90ca`).
- **Stricter "Plays in Chrome" labels** and shared after-playback sound reports (`013fd5a`).
- **Live TV Dolby audio** converted to AAC, so those channels have sound (`ffcc8d9`).
- **Barr's add-ons and Express packages** are everyone's defaults; Express searches go through the VPN (`9c35fb9`).
- **Communal Premiumize, TorBox and Live TV** through Beacon's server and Sol's VPN; VLC playlists with Beacon links (`9c790f8`, `18a305c`, `f669df2`).
- **Trakt** through Empyrean's own Trakt app (`3a5f44a`).
- **Barr's full Beacon Hub UI** as a website for signed-in users; Trakt sign-ins saved per user (`b41f376`).
- **Jellyfin sign-in and allowlist**, tailnet only (`f3ce215`).
- Beacon Hub 1.2.1 imported unchanged as the starting point (`5dd0c98`).
