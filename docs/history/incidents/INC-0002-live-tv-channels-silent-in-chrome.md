---
id: INC-0002
type: incident
title: About a third of Live TV channels played without sound
date: 2026-10-09
recorded: 2026-10-09
source: reconstructed
status: resolved
authors: [Claude (Opus 5.5)]
evidence: [commit ffcc8d9, server/src/liveaudio.js, AI-Context worklist A31]
related: [ADR-0007]
---

# INC-0002: About a third of Live TV channels played without sound

## Symptoms

Some Live TV channels showed a picture with no sound in Chrome. The size of the problem came from sampling: "about a
third of sampled channels" (commit message). How many channels were sampled isn't recorded.

## Cause

Those channels send AC-3 / E-AC-3 (Dolby) audio, which Chrome's player can't decode. This was already true in
the extension. It wasn't introduced by the website.

## Fix

`ffcc8d9` (10:33): `liveaudio.js` probes each channel's audio once (cached 10 min). For AC-3/E-AC-3, it re-encodes
each MPEG-TS segment's audio to AAC with ffmpeg: video copied, timestamps kept, run under `nice`. Playlist `CODECS`
are rewritten. AAC channels pass through byte for byte. The image gained ffmpeg. 27 tests, including a real AC-3 → AAC
conversion.

## Prevention

`liveaudio.test.js`. The owner later reported "most Live TV OK". Which channels still fail, if any, isn't recorded.
