---
id: ADR-0009
type: decision
title: Repository layout, living docs, and an append-only history
date: 2026-10-09
recorded: 2026-10-09
source: contemporaneous
status: accepted
authors: [Claude (Opus 5.5)]
evidence: [ChatGPT conversation "Reorganize Beacon Repository" (shared 2026-10-09), branch restructure]
supersedes: []
related: [JRN-0002]
---

# ADR-0009: Repository layout, living docs, and an append-only history

## Context

The owner, 2026-10-09: the repo *"is a mess. Could you clean it up. Pretty much break everything down and reorganize
it from scratch."* And: *"I also want way more documentation for the project as a whole. Preferably Md so it is agent
and human readable. Essentially a set of append-only logs and journals detailing process and methodology of
everything and anything that has been done."*

What was messy: 31 of Barr's old release notes (Beacon 2.4 to Hub 1.2.1) sat among the runtime files in
`extension/`, where the server serves them to signed-in users. The README still described step 2 ("for now a
sign-in page"). The 17 commits of work existed only as commit messages. There were no agent instructions. Barr's
documents were Word files. `deploy/` held one file.

## Options

1. **Rebuild the tree from scratch** (`src/`, `config/`, …) as a generic template suggests. That would break the
   extension's relative paths, the Dockerfile and Sol's build, and make Barr's code unfamiliar to him. It gains nothing
   real.
2. **Keep the three code roots (`server/`, `web/`, `extension/`), which already match real boundaries, and
   reorganize everything around them:** move non-runtime files out of `extension/`, put all writing under `docs/`
   with one home per topic, add an append-only history, agent instructions and checks.

## Decision

Option 2:

- `extension/` holds only what the browser loads. Barr's release notes and documents moved, unchanged, to
  `docs/beacon-hub/`, with Markdown conversions of his Word files beside the originals.
- Living docs: `docs/architecture/`, `docs/operations/` (`deploy/README.md` moved here), `docs/development/`,
  `docs/security.md`.
- History: `docs/history/` with journal, decisions, incidents, experiments and corrections. IDs, front matter and
  templates. Append-only, except the `status:` line.
- `AGENTS.md` (with `CLAUDE.md` pointing to it), `CHANGELOG.md`, `scripts/docs.mjs` (new, index, check) and a CI
  workflow running the server tests and the docs check.
- The 2026-10-09 history is **reconstructed** from commits, the design doc and the owner's recorded decisions, and is
  labelled as such.

This is proposed by Claude, acting on the owner's request. It becomes accepted when the owner merges it into `backend`.

## Consequences

- Sol's build is unaffected: the Dockerfile copies the same three roots.
- Sol's `compose.yaml` comment still points at `deploy/README.md`. Update it to `docs/operations/deploy-sol.md` after the merge.
- Barr will find his release notes under `docs/beacon-hub/releases/`, not beside `manifest.json`. If he still ships
  zips of `extension/` to friends, they'll no longer include the old READMEs.
- Every future change carries a documentation duty, which is enforced partly by CI and partly by `AGENTS.md`.
