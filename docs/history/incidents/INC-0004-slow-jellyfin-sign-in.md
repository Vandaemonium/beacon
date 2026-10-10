---
id: INC-0004
type: incident
title: A coworker couldn't sign in because Jellyfin answered too slowly
date: 2026-10-09
recorded: 2026-10-09
source: reconstructed
status: mitigated
authors: [Claude (Opus 5.5)]
evidence: [commit 5ce8534, server/src/jellyfin.js]
related: [ADR-0002]
---

# INC-0004: A coworker couldn't sign in because Jellyfin answered too slowly

## Symptoms

A coworker's sign-in failed with "could not reach a service".

## Cause

Sol's library disk was about 83% busy, and Jellyfin took longer than Beacon's 10 s limit to check the password.

## Fix

`5ce8534` (12:35):
- Sign-ins wait up to 30 s.
- If Jellyfin still doesn't answer, the user sees "The media server is very busy…" (503) instead of a generic error.
  The failure is logged with the username and counted.
- Signed-in people keep working on the last known Jellyfin answer when the once-a-minute re-check can't get through.

## Status

**Mitigated, not solved:** the root cause is Sol's disk load, which affects Jellyfin itself. No test covers the
timeout path.
