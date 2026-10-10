# Working on Beacon (agents and people)

Read this before you change anything. It applies to Claude, Codex, Gemini and any other agent, and to people too.

## What Beacon is

Barr's Beacon Hub (a Chrome extension) running as a website on Sol, behind a Jellyfin login, using communal
Premiumize/TorBox/IPTV accounts held only on the server. Barr wrote the UI (`extension/`). The server and the
website changes were built for Empyrean. Details: [`docs/architecture/overview.md`](docs/architecture/overview.md).

## Where the truth is

| Question | Authoritative source |
|---|---|
| How it works now | `docs/architecture/`, `docs/operations/`, `docs/security.md` (living docs, kept current) |
| Why it is this way | `docs/history/decisions/` (ADRs) |
| What happened | `docs/history/` journal, incidents, experiments, plus `git log` |
| What is deployed | Sol itself: `~/beacon` checkout, `~/docker/compose.yaml`, `~/docker/.env` (never copy values out) |
| Barr's original design | `docs/beacon-hub/` (his release notes and blueprint, kept unchanged) |

The code is the final word on behavior. If a living doc disagrees with the code, fix the doc in the same change.

## Repo rules

1. **Branches.** `backend` is what Sol runs. Do your work on a topic branch and merge it through a pull request.
   `main` still holds only the 1.2.1 import (see [open questions](docs/development/workflow.md#open-questions)).
   Never force-push or rewrite published history.
2. **Secrets.** Never commit keys, passwords, tokens, IPTV logins, settings backups, `.m3u` playlists or
   `.env` files. The repo is **public**. The only key-like value in the code is Barr's Trakt client ID, which is
   public by design (PKCE, no secret).
3. **The server has no dependencies.** It uses Node built-ins only (`node:http`, `node:test`, `node:crypto`).
   Add a package only with a decision record explaining why.
4. **`extension/` stays a working Chrome extension.** Website-only behavior goes behind `onEmpyrean()` from
   `extension/app/lib/store.js` (true when there's no `chrome.storage` and the page is served over http/https). Keep paths that `manifest.json`, `beacon.html`, `index.html` and
   `media.html` load relative and where they are.
5. **Barr owns the UI.** Larger changes to `extension/` (removing `media.html`, the classic Live TV page, or
   restyling) need his agreement. Write them up as a proposed ADR.
6. **Sol is the owner's only.** Agents on Sol may `git pull` and `docker compose up -d --build beacon` when asked.
   Don't change compose, `.env`, Caddy or the VPN without the owner.

## Before you call something done

- Run `cd server && npm test` and report the real count (e.g. "49 pass"). Never report a test you didn't run.
- Run `node scripts/docs.mjs check`. It must pass.
- If behavior, configuration, routes or limits changed, update the matching living doc.
- If you investigated, decided, broke or measured something, add a history record (below).
- Add a line to [`CHANGELOG.md`](CHANGELOG.md) for user-visible changes.
- Say plainly what you didn't verify (e.g. "not tested in Safari", "not deployed to Sol").

## History records (append-only)

`docs/history/` is the project's memory. Records are **never edited or deleted once committed**. The check
script compares against the base branch and fails if an existing record changed.

| Kind | Folder | Use it for |
|---|---|---|
| `journal` (JRN) | `journal/` | A work session: goal, what was done, how, what was checked, what's left |
| `decision` (ADR) | `decisions/` | A choice with alternatives: context, options, decision, consequences |
| `incident` (INC) | `incidents/` | Something broke or misbehaved: symptoms, cause, fix, prevention |
| `experiment` (EXP) | `experiments/` | A probe or measurement: question, method, raw results, conclusion |
| `correction` (COR) | `corrections/` | An earlier record was wrong: what it said, what's true, evidence |

- Create one with `node scripts/docs.mjs new <kind> "Title"`. It assigns the next ID, fills in today's date and
  copies the template. Then `node scripts/docs.mjs index` updates `docs/history/_index.md`.
- A decision that replaces another is a **new ADR** with `supersedes: [ADR-000N]`. The index shows the chain.
- Mark where the content came from: `source: contemporaneous` if written while doing the work, or
  `source: reconstructed` if written later from commits and notes. Reconstructed records say what the evidence
  is and never invent motives, test results or timings. "Unknown" is an acceptable answer.
- Keep records proportionate. A one-line fix needs a commit message, not a journal entry.

Format and examples: [`docs/history/README.md`](docs/history/README.md).

## Empyrean context

Beacon is part of Empyrean, the owner's self-hosted system. Its shared memory lives outside this repo, in
AI-Context (`shared/canonical/`, worklist item **A31**). When you finish Beacon work, update that worklist row
the way its conventions say. This repo's docs describe Beacon; AI-Context describes how Beacon fits into Empyrean.
