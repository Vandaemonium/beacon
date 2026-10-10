---
id: ADR-0008
type: decision
title: At most 4 people watch at once, set by Sol's upload
date: 2026-10-09
recorded: 2026-10-09
source: reconstructed
status: accepted
authors: [Claude (Opus 5.5)]
evidence: [commit 5ad767a, AI-Context canonical decisions.md 2026-10-09 (Capacity), design doc open question "Sol's upload speed"]
supersedes: []
related: [ADR-0003, EXP-0002]
---

# ADR-0008: At most 4 people watch at once, set by Sol's upload

## Context

Proxied streams ([ADR-0003](ADR-0003-communal-accounts-proxied-through-sol.md)) all leave through Sol's home upload,
measured at 35–39 Mbit/s ([EXP-0002](../experiments/EXP-0002-sol-upload-and-conversion-cost.md)). A 1080p film is
about 8 Mbit/s, and Jellyfin shares that upload.

The owner's wish (2026-10-09): full quality by default; *"once the 4th person logs in it bumps everything down to
720p"*, plus a manual switch for busy nights. They're open to a cloud relay only *"if it became necessary"*, and
will look into a faster upload from the ISP.

## Options

1. **Refuse the next person** above a limit, with a clear message.
2. **Drop quality** for everyone above a threshold (the owner's preferred end state). This needs full video
   transcoding, which this server doesn't do yet.
3. **Direct debrid streams** for some users. Saves upload, but risks the accounts.

## Decision

Option 1 for now: `MAX_VIEWERS` (default 4) counts **people**, not streams. A person counts while a stream is open,
and for 20 s after their last request. The player and Live TV show the server's own message. Alerts and the daily
summary report each time someone is turned away, so the limit can be tuned from real use after the coworker trial.

## Consequences

- The 5th viewer is refused rather than everyone degrading. That differs from the owner's 720p idea, which remains open.
- Raising the limit needs a faster upload, quality switching, or direct streams for some users.
