# Beacon's history

This folder is Beacon's **append-only** record of what was done, decided, broken, measured and corrected, and why.
The living docs (`docs/architecture/`, `docs/operations/`, …) say how things are **now**. This folder says how
they got that way. The full list is in **[_index.md](_index.md)**.

## The rules

1. **Never edit or delete a committed record.** The only exception is the front-matter `status:` line (for example
   `proposed` → `accepted`, or `open` → `resolved`). `node scripts/docs.mjs check` enforces this against
   `origin/backend`, and CI runs it on every pull request.
2. **Wrong? Write a correction.** A `COR` record says what the earlier record claimed, what is true, and the evidence,
   and lists the record under `corrects:`.
3. **Changed your mind? Write a new decision.** A new ADR with `supersedes: [ADR-000N]`. The index shows
   "superseded by" automatically.
4. **Say where it came from.** `source: contemporaneous` means written while doing the work. `source: reconstructed`
   means written afterwards from commits, notes or memory. Reconstructed records cite their evidence. They never
   invent intentions, test results or timings. Write "unknown" when that's the truth.
5. **Keep it proportionate.** Not every commit needs a record. Use one when a future reader would ask *"why?"* or
   *"has this happened before?"*.
6. **No secrets**, even in a record about a secret.

Fixing a typo or a broken link in a committed record is still an edit. Leave it, or note it in the next record.
If the owner ever needs to remove something from history (for example a leaked secret), that is an admin action
outside these rules: rewrite it, and write a `COR` record saying that something was removed and why, without
repeating it.

## Kinds of record

| Kind | ID | Folder | Write one when… |
|---|---|---|---|
| Journal | `JRN-0001` | [journal/](journal/) | You finish a work session worth retelling: goal, steps, dead ends, checks, what's left |
| Decision (ADR) | `ADR-0001` | [decisions/](decisions/) | A choice had real alternatives, or someone will later ask "why is it like this?" |
| Incident | `INC-0001` | [incidents/](incidents/) | Something broke or misbehaved for users, or nearly did |
| Experiment | `EXP-0001` | [experiments/](experiments/) | You probed or measured something to decide what to do |
| Correction | `COR-0001` | [corrections/](corrections/) | An earlier record turned out to be wrong |

## Making one

```bash
node scripts/docs.mjs new decision "Drop the classic Media Hub on the website"
#   → docs/history/decisions/ADR-0010-drop-the-classic-media-hub-on-the-website.md
# fill it in, then:
node scripts/docs.mjs index
node scripts/docs.mjs check
```

Templates are in [templates/](templates/). Every record starts with front matter:

```yaml
---
id: ADR-0010                    # PREFIX-NNNN, matches the start of the file name
type: decision                  # journal | decision | incident | experiment | correction
title: Drop the classic Media Hub on the website
date: 2026-10-12                # when it happened or was decided
recorded: 2026-10-12            # when this record was written
source: contemporaneous         # or reconstructed
status: proposed                # see below
authors: [Barr, Claude (Opus 5.5)]
evidence: [commit abc1234, docs/architecture/web-ui.md]
supersedes: []                  # decisions only
corrects: []                    # corrections only
related: [ADR-0001]
---
```

| Kind | Allowed `status` |
|---|---|
| journal | `in-progress`, `done`, `abandoned` |
| decision | `proposed`, `accepted`, `rejected` |
| incident | `open`, `resolved`, `mitigated` |
| experiment | `planned`, `done`, `inconclusive` |
| correction | `done` |

## How this started

The records dated 2026-10-09 before JRN-0002 were **reconstructed** that evening from the commit messages, the
design doc ("Beacon on Empyrean: design"), and the owner's decisions recorded in Empyrean's AI-Context. Everything
in them is traceable to one of those sources. See [JRN-0002](journal/JRN-0002-repository-restructure-and-documentation-system.md)
for how and why this system was set up.
