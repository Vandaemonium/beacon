---
id: JRN-0001
type: journal
title: Building Beacon on Empyrean, steps 1 to 5
date: 2026-10-09
recorded: 2026-10-09
source: reconstructed
status: done
authors: [Cory Vance, Claude (Opus 5.5)]
evidence: [git log 5dd0c98..5ce8534, design doc "Beacon on Empyrean: design", AI-Context canonical decisions.md 2026-10-09 and worklist A31]
related: [ADR-0001, ADR-0002, ADR-0003, ADR-0004, ADR-0005, ADR-0006, ADR-0007, ADR-0008, INC-0001, INC-0002, INC-0003, INC-0004, INC-0005, EXP-0001, EXP-0002, EXP-0003]
---

# JRN-0001: Building Beacon on Empyrean, steps 1 to 5

*Reconstructed on the evening of 2026-10-09 from the commit messages (all by Cory Vance, co-authored by Claude Opus
5.5), the design doc, and the owner's decisions recorded in AI-Context. Times are commit times, America/Detroit.
How long each step took beyond those timestamps is unknown.*

## Goal

The owner (Cory): *"integrate the functionality of this project into Empyrean as to ultimately be accessible via
browser by our users."* The project is Beacon Hub 1.2.1, a Chrome extension by Barr, a developer the owner knows and
trusts. Communal accounts: *"For now we will be using Barr's accounts"*, open to per-user accounts later. The
site was to be public but behind a login the owner controls, preferably Jellyfin accounts. Barr and the owner
build it together in one git repo.

## Starting point

Barr's "Friend Test Package" (`Beacon-Hub-1.2.1-VLC.zip`, plus his blueprint and friend guide) in `~/Downloads` on
Polaris. No server existed.

## What was done

| Time | Commit | Step |
|---|---|---|
| 09:03 | `5dd0c98` | **Step 1, shared repo.** Imported the extension unchanged, plus Barr's documents. No settings backups, passcodes or keys. Pushed to github.com/Vandaemonium/beacon |
| 09:20 | `f3ce215` | **Step 2, backend and login.** `server/`: a dependency-free Node service. Checks passwords against Jellyfin, issues signed HttpOnly cookies, keeps an allowlist managed by Jellyfin admins, rate-limits failed logins, refuses cross-site and non-JSON posts. `web/` sign-in page. Dockerfile and deploy notes. Tailnet only. 9 tests |
| 09:35 | `b41f376` | **Step 3, the UI on the web.** The server serves `extension/` to signed-in users. `store.js` keeps secrets per user on Sol. `trakt.js` gets a PKCE redirect sign-in for the web. The extension still works unchanged in Chrome. 11 tests |
| 09:42 | `3a5f44a` | Trakt client ID became a server setting: Empyrean's own Trakt app ([ADR-0006](../decisions/ADR-0006-empyrean-trakt-app.md)) |
| 10:02 | `9c790f8` | **Step 4, communal accounts.** `/api/pm`, `/api/tb`, `/api/iptv` add keys on Sol; encrypted 12 h `/api/stream` links; Live TV slots; `/api/netcheck`. UI calls the server on the web. 22 tests, including leak checks for every key and the IPTV login |
| 10:04 | `18a305c` | Stop resolving provider names locally behind the proxy ([INC-0001](../incidents/INC-0001-provider-dns-resolved-outside-the-vpn.md)) |
| 10:12 | `f669df2` | Deploy notes: communal account settings and the Gluetun proxy |
| 10:28 | `9c35fb9` | Shared defaults (Barr's add-ons and Express packages) and Express searches through the VPN. 24 tests |
| 10:33 | `ffcc8d9` | Live TV Dolby audio → AAC ([INC-0002](../incidents/INC-0002-live-tv-channels-silent-in-chrome.md)). 27 tests |
| 10:48 | `013fd5a` | Stricter "Plays in Chrome" labels and shared sound reports ([INC-0005](../incidents/INC-0005-plays-in-chrome-labels-on-silent-sources.md)). 35 tests |
| 11:04 | `52d90ca` | Premiumize "browser-friendly" links are the original file ([EXP-0001](../experiments/EXP-0001-premiumize-stream-link-is-the-original.md)). 36 tests |
| 11:20 | `9dae8f7` | Sol converts film audio to AAC, with seeking ([ADR-0007](../decisions/ADR-0007-server-side-audio-conversion.md)). 41 tests |
| 11:36 | `86438f8` | Converted audio starts at the video keyframe ([INC-0003](../incidents/INC-0003-converted-audio-11-seconds-early.md)) |
| 11:53 | `5fe1631` | Late-starting audio padded with silence ([INC-0003](../incidents/INC-0003-converted-audio-11-seconds-early.md)). 43 tests |
| 12:07 | `5ad767a` | Viewer limit ([ADR-0008](../decisions/ADR-0008-viewer-limit-from-upload.md), [EXP-0002](../experiments/EXP-0002-sol-upload-and-conversion-cost.md)). 44 tests |
| 12:16 | `0bd973c` | **Step 5, public.** https://beacon.empyrean.cc through Caddy; DNS via cloudflare-ddns |
| 12:27 | `9692023` | Monitoring: Discord alerts, daily summary, "Today on Beacon". 49 tests |
| 12:35 | `5ce8534` | Sign-in survives a slow Jellyfin ([INC-0004](../incidents/INC-0004-slow-jellyfin-sign-in.md)) |

On Sol, the matching changes are commits in Sol's `~/docker` config repo: `1483caf` (step 2), `649cec1` (Trakt client
ID), `a0016a3` (step 4), `5f3204e` (public site and `MAX_VIEWERS`) and `85abe77` (monitoring through n8n).

## How it was checked

- Server tests at every step, from 9 up to 49 (counts above are from the commit messages).
- `9dae8f7`: checked in headless Chromium. Resume at 0:20, audio decoded, and a +20 s seek landed on the burned-in timestamp.
- A real DD+ copy of *Dune* through Sol: started in 1.5 s, jumped to 1 h in 2.9 s (AI-Context worklist A31).
- **The owner tested by hand:** TorBox film playback, the VLC playlist and most Live TV channels worked. After the
  INC-0003 fixes, they confirmed sound was in sync on a retest.
- Trakt sign-in with the Empyrean Beacon app was verified with Trakt on 2026-10-09.

## Outcome

Beacon was public at https://beacon.empyrean.cc by 12:16, with Jellyfin login, the allowlist, communal Premiumize,
TorBox and IPTV through Sol's VPN, audio conversion, a 4-viewer limit and monitoring. Barr (`djbarr81`) was invited
to the repo with write access.

## Left open

- Coworker trial: the owner picks 2-3 coworkers (Jellyfin accounts via Wizarr, then a tick on Beacon's list).
  Tune `MAX_VIEWERS` from the daily summaries afterwards.
- Renewals: IPTV expires 2026-10-25 and Premiumize premium ends 2026-10-27.
- Tell Barr about EXP-0001: it affects his extension too.
- The design doc's open questions: the classic pages, a central hub, single sign-on.
- `main` was never updated; Sol runs `backend` (see [workflow.md](../../development/workflow.md#open-questions)).
