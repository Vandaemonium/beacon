---
id: ADR-0007
type: decision
title: Sol converts audio that browsers can't play, for films and Live TV
date: 2026-10-09
recorded: 2026-10-09
source: reconstructed
status: accepted
authors: [Claude (Opus 5.5)]
evidence: [commit ffcc8d9, commit 9dae8f7, commit 86438f8, commit 5fe1631, server/src/convert.js header]
supersedes: []
related: [INC-0002, INC-0003, INC-0005, EXP-0001, EXP-0002]
---

# ADR-0007: Sol converts audio that browsers can't play, for films and Live TV

## Context

Chrome can't decode Dolby Digital / DD+, DTS or TrueHD in files, and plays AC-3/E-AC-3 Live TV silently. That's
about a third of sampled channels ([INC-0002](../incidents/INC-0002-live-tv-channels-silent-in-chrome.md)) and many
film releases. The fallback the extension relied on, Premiumize's "browser-friendly" copy, turned out to be the
original file ([EXP-0001](../experiments/EXP-0001-premiumize-stream-link-is-the-original.md)). The design doc had
listed on-the-fly conversion as "later".

## Options

1. **Hide or label those sources** and offer VLC. Already done, but it leaves many films unwatchable in the browser.
2. **Full transcode** on Sol. Too heavy for an OptiPlex serving Jellyfin too.
3. **Audio-only conversion:** copy the video and re-encode only the audio to AAC stereo.

## Decision

Option 3. Live TV converts per MPEG-TS segment (`liveaudio.js`). Films stream as fragmented MP4 from any start point,
and seeking restarts the stream (`convert.js`). Limits: 2 per person and 10 in all. ffmpeg runs under `nice` and
reads through Beacon's own stream link, so Range requests and the VPN apply.

## Consequences

- Measured cost is 2.4–4.6% of one core per viewer ([EXP-0002](../experiments/EXP-0002-sol-upload-and-conversion-cost.md)). CPU is not the limit.
- Sync is subtle. Two fixes were needed the same morning ([INC-0003](../incidents/INC-0003-converted-audio-11-seconds-early.md)).
- Video and container problems (AVI, unsupported codecs) remain unsolved and fall back to VLC.
