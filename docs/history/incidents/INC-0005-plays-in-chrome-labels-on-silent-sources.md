---
id: INC-0005
type: incident
title: Sources labelled "Plays in Chrome" played without sound
date: 2026-10-09
recorded: 2026-10-09
source: reconstructed
status: resolved
authors: [Claude (Opus 5.5)]
evidence: [commit 013fd5a, extension/app/lib/compat.js]
related: [ADR-0007, EXP-0001]
---

# INC-0005: Sources labelled "Plays in Chrome" played without sound

## Symptoms

Film sources marked "Plays in Chrome" played silently.

## Cause

The labelling counted MediaSource support. Some Chrome builds accept Dolby for streaming (MSE) but can't decode it in
files, and films play as files. Some audio names (DDPA, DD+A, Atmos) also weren't recognized. This is Barr's 1.2
logic, so it affects his extension too.

## Fix

`013fd5a` (10:48), `compat.js`:
- Files are judged by `canPlayType` only, and Dolby audio in MKV is never trusted.
- Recognizes E-AC-3/AC-3, DDPA/DD+A, Atmos and PCM. "Dolby Vision" is treated as video. Multi-audio releases are a risk.
- The player checks `webkitAudioDecodedByteCount` after 6 s, and reports sound or no sound to Sol. Shared reports
  override the release name either way. With no sound, it offers the VLC playlist.

35 tests. The new `compat.test.js` runs the UI's labelling with a stub browser.

## Prevention

`compat.test.js`, plus the shared reports, which correct labels from real playback.
