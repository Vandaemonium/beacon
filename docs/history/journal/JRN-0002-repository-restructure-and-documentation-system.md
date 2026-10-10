---
id: JRN-0002
type: journal
title: Repository restructure and documentation system
date: 2026-10-09
recorded: 2026-10-09
source: contemporaneous
status: done
authors: [Claude (Opus 5.5)]
evidence: [branch restructure, ChatGPT conversation "Reorganize Beacon Repository" (shared 2026-10-09)]
related: [ADR-0009, JRN-0001]
---

# JRN-0002: Repository restructure and documentation system

## Goal

The owner asked, first in ChatGPT and then via a share link handed to Claude Code on Polaris, to *"break everything
down and reorganize it from scratch"*. They also wanted far more documentation: Markdown, *"agent and human
readable"*, and *"a set of append-only logs and journals detailing process and methodology of everything and
anything that has been done."*

## Starting point

- `backend` at `5ce8534` (17 commits, live on Sol). `main` at `5dd0c98` (the import only).
- **ChatGPT's earlier attempt** (2026-10-09, 18:23–18:25) could only read `main`. It concluded Beacon was "a
  one-commit import" with no server, which was wrong: all the work is on `backend`. Its GitHub connection couldn't
  write (`403 Resource not accessible by integration`), so it produced a zip of 8 draft Markdown files that were
  never committed. Those drafts were **not** used, because they describe a repo that no longer exists. Its useful
  ideas were taken up: ADRs, an `AGENTS.md`, keeping `extension/` as a boundary, and labelling reconstructed history.
- GitHub reports the repo as **public**. The design doc and Empyrean's notes said private.

## What was done

1. **Read everything first:** all 17 commit messages, the design doc, the owner's decisions in AI-Context, every
   server module header, the extension diff since 1.2.1, Sol's actual `compose.yaml` block and `~/docker` log.
2. **Secret scan of the full history:** no secrets found. The only key-like string is Barr's public Trakt client ID.
3. **Checked what moving files could break:** no runtime file references the release notes. `media.html` and
   `index.html` are still linked from Settings, so they stay. On the live site, those notes were behind the login (401).
4. **Moves** (`git mv`, contents unchanged): 31 release, setup and test files from `extension/` →
   `docs/beacon-hub/releases/`; `docs/original/` → `docs/beacon-hub/original/` (plus mammoth Markdown conversions of
   the two `.docx`); `deploy/README.md` → `docs/operations/deploy-sol.md`.
5. **Kept** `server/`, `web/`, `extension/` and the root `Dockerfile`. They are real boundaries, and Sol's build and
   Barr's extension depend on them ([ADR-0009](../decisions/ADR-0009-repo-layout-and-append-only-history.md)
   explains why a from-scratch tree was rejected).
6. **Living docs written:** architecture (overview, server, web UI, streaming), operations (deploy, configuration,
   monitoring, troubleshooting), development (workflow, testing), security. Each claim was checked against the code.
   For example, the error messages in the troubleshooting table are the server's exact strings. The deploy doc's
   compose block was out of date (no `MAX_VIEWERS` or `NOTIFY_URL`) and now matches Sol.
7. **History system:** folders, templates, front-matter schema, `scripts/docs.mjs` (`new`, `index`, `check`), and
   `.github/workflows/check.yml`. The append-only check first forbade every edit. That would have trapped ADRs at
   `proposed` forever, so the front-matter `status:` line became the single allowed edit.
8. **Reconstructed history** for 2026-10-09: JRN-0001, ADR-0001–0008, INC-0001–0005 and EXP-0001–0003, each citing
   commits and sources. Where the sources were silent (how INC-0001 was noticed, which upload tool was used, who
   chose the Trakt app), the records say "unknown" or "not recorded" instead of guessing.
9. `README.md` rewritten (it still described step 2). Added `AGENTS.md`, `CLAUDE.md` (`@AGENTS.md`) and `CHANGELOG.md`.
   Updated `.dockerignore`.

## How it was checked

- `cd server && npm test`: **49 pass, 0 fail**, before and after the moves (Node 26 on Polaris). The first CI run
  showed the script failed on Node 24. That was fixed in this branch ([INC-0006](../incidents/INC-0006-server-tests-didnt-run-on-node-24.md)),
  and the tests now pass 49/49 on both versions. This is the branch's only change to a file the image copies, `server/package.json`: only its `test` script changed, which the image never runs.
- Local smoke test of the server on this branch: `/api/health` 200, `/` 200, `/beacon.html` 302 (not signed in),
  `/app/ui/main.js` and `/manifest.json` 401, and the moved `/CHANGELOG-5.0.md` and `/README.txt` now 404.
- `node scripts/docs.mjs check`: passes. Its failure paths were exercised by hand: a modified record, a
  status-only edit, a deleted record, a broken link, a duplicate ID and a stale index, all with `--base HEAD` so the
  committed records counted as merged. Each was caught, and the status-only edit was allowed.
- **Not checked:** a Docker build (Docker on Polaris needs sudo, and building on Sol wasn't asked for); the GitHub
  Actions workflow (it runs only once pushed); the extension loaded unpacked in Chrome (no runtime file changed).

## Outcome

Branch `restructure`, pushed for review as pull request #1 into `backend`. Nothing was merged or deployed, and Sol is
unchanged.

## Left open

- The owner decides on the merge. After it, update the comment in Sol's `compose.yaml` that points at
  `deploy/README.md` (it becomes `docs/operations/deploy-sol.md`).
- Decide `main` vs `backend`, and whether the repo should be public ([workflow.md](../../development/workflow.md#open-questions)).
- Tell Barr where his release notes went.
- Security gap noticed while documenting: `fetchUpstream` follows redirects without re-checking them
  (`docs/security.md`, known gap 2). Not fixed here, since this branch changes no behavior.
