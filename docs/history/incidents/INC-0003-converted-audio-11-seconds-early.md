---
id: INC-0003
type: incident
title: Converted film audio out of sync (keyframe start, then 11 s early)
date: 2026-10-09
recorded: 2026-10-09
source: reconstructed
status: resolved
authors: [Claude (Opus 5.5)]
evidence: [commit 9dae8f7, commit 86438f8, commit 5fe1631, server/src/convert.js header, AI-Context worklist A31]
related: [ADR-0007]
---

# INC-0003: Converted film audio out of sync (keyframe start, then 11 s early)

## Symptoms

After audio conversion shipped (`9dae8f7`, 11:20), sound didn't line up with the picture in converted films.
Two separate problems were found and fixed within the hour.

## Investigation and causes

1. **Start point** (`86438f8`, 11:36). Copied video can only start on a keyframe, often seconds before the
   requested time, but the audio started exactly at the requested time. Fix: `-noaccurate_seek -copyts` makes both
   tracks start at the keyframe, and `/start` tells the player where that is so its clock agrees.
2. **Late audio** (`5fe1631`, 11:53). *Onslaught* (2026, BYNDR WEB-DL) has 11 s of video before its first audio
   packet. The converted AAC kept correct timestamps, but browsers play audio packets back to back, so the sound
   ran 11 s ahead. Fix: `aresample=async=1` with `first_pts` at the video's first keyframe fills the start, and any
   later gaps, with real silence.

## Fix verification

A new test requires a late-audio film to have no gap between audio packets after conversion, and it fails without
the fix. 43 tests. The owner retested and confirmed the sound was in sync.

## Prevention

`convert.test.js` covers both cases ("after a seek between keyframes, picture and sound stay together…" and "a
release whose audio starts late…").
