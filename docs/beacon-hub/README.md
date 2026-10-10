# Barr's Beacon Hub documents

These are Barr's own documents, **kept exactly as he shipped them**. They are the extension's history before it came
to Empyrean. Until 2026-10-09 they lived next to the code in `extension/`. They were moved here unchanged
([ADR-0009](../history/decisions/ADR-0009-repo-layout-and-append-only-history.md)); `git log --follow` traces each one.

Their test results are **Barr's reported results** from his own Chromium runs. They were not re-run here.

## Original 1.2.1 package documents ([original/](original/))

| File | What |
|---|---|
| `Beacon-Hub-1.2.1-Technical-Blueprint.md.docx` | The as-built blueprint of the 1.2.1 extension: bootstrap, architecture, data flow, storage, integrations |
| `Beacon-Hub-1.2.1-Friend-ELI5-Guide.docx` | A plain-language guide for friends installing it |
| `FRIEND-SETUP-READ-FIRST.txt` | Install and settings-transfer notes for the friend test package |
| `*.converted.md` | Markdown conversions of the two Word files, made 2026-10-09 with mammoth (headings and lists kept; formatting approximate). **The `.docx` is the original.** |

## Release notes, oldest first ([releases/](releases/))

| Version | File | Theme (from the file's first lines) |
|---|---|---|
| 1.0.0 | `README.txt` | "Beacon for Chrome 1.0.0", install guide |
| 2.3 | `TESTING.txt` | Cloud processing test |
| 2.4 | `README-2.4.txt` | Manual source preferences |
| 2.5 | `README-2.5.txt` | Backup test |
| 2.6 | `README-2.6.txt` | Persistent cloud credentials |
| 2.7 | `README-2.7.txt` | Provider directory |
| 2.8 | `README-2.8.txt` | Movie source hub |
| 2.9 | `README-2.9.txt` | Experimental Express JSON-rule adapter |
| 3.0 | `README-3.0.txt` | HTML row/title/link selectors without running untrusted JavaScript |
| 3.0.1 | `TORBOX-TEST.txt` | TorBox error diagnostics |
| 3.0.2 | `README-3.0.2.txt` | TorBox playback authentication fix |
| 3.1 | `README-3.1.txt` | Posters from metadata catalogs, hide result, local history |
| 3.2 | `README-3.2.txt` | Test build |
| 3.3 | `README-3.3.txt` | Provider diagnostics |
| 3.4 | `README-3.4.txt` | TV seasons |
| 3.6 | `CHANGELOG-3.6.md`, `SETUP-3.6.txt` | Poster and episode metadata |
| 4.0 | `CHANGELOG-4.0.md` | Streaming-style redesign |
| 4.1 | `CHANGELOG-4.1.md` | Trakt via Chrome Identity + PKCE (no client secret) |
| 4.1.1 | `CHANGELOG-4.1.1.md` | Screen refresh stability |
| 4.1.2 | `CHANGELOG-4.1.2.md` | Express search bridge fix |
| 5.0 | `CHANGELOG-5.0.md` | Home refresh queue and more |
| 5.1 | `CHANGELOG-5.1.md` | Error explanations, browser-friendly Premiumize rendition |
| Hub 1.0 | `CHANGELOG-BeaconHub-1.0.md`, `TESTING-BeaconHub-1.0.md` | Renamed Beacon Hub (built on 5.1) |
| Hub 1.1 | `CHANGELOG-BeaconHub-1.1.md`, `TESTING-BeaconHub-1.1.md` | Only show sources this browser can play; Live TV integrated |
| Hub 1.2 | `CHANGELOG-BeaconHub-1.2.md`, `TESTING-BeaconHub-1.2.md`, `SETUP.md` | "Honest compatibility labels", live stall detection, VPN check |
| Hub 1.2.1 | `CHANGELOG-BeaconHub-1.2.1.md` | Download VLC playlist (.m3u) |

No notes exist for versions before 2.3 apart from 1.0.0, or for 3.5. Whether those versions existed isn't known here.

## Where Empyrean's version diverges

Two findings from Empyrean affect Barr's own extension too:

- Premiumize's "browser-friendly" links are the original file ([EXP-0001](../history/experiments/EXP-0001-premiumize-stream-link-is-the-original.md)).
- "Plays in Chrome" trusted MediaSource support for Dolby audio ([INC-0005](../history/incidents/INC-0005-plays-in-chrome-labels-on-silent-sources.md)).

When Barr ships a new version, add its notes to `releases/` and a row above.
