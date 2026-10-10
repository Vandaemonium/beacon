---
id: EXP-0002
type: experiment
title: Sol's upload speed and the CPU cost of audio conversion
date: 2026-10-09
recorded: 2026-10-09
source: reconstructed
status: done
authors: [Claude (Opus 5.5)]
evidence: [commit 5ad767a, server/src/convert.js header, server/src/config.js comment, AI-Context worklist A31]
related: [ADR-0007, ADR-0008]
---

# EXP-0002: Sol's upload speed and the CPU cost of audio conversion

## Question

How many people can watch through Sol at once, and is CPU or bandwidth the limit?

## Method

- Upload: measured from Sol on 2026-10-09. The tool used isn't recorded.
- CPU: ffmpeg audio-only conversion of real files on Sol, one viewer each.
- Start-up: a real DD+ *Dune* file through Sol, timing the start and a jump to 1 h.

## Results

| Measure | Value |
|---|---|
| Sol upload | 35–39 Mbit/s |
| 1080p film | ~8 Mbit/s (estimate used in the code; not measured per file) |
| CPU, DD+ 5.1 → AAC | 2.4% of one core per viewer |
| CPU, TrueHD 7.1 → AAC | 4.6% of one core per viewer |
| Converted DD+ film | starts in 1.5 s; jump to 1 h in 2.9 s |

## Conclusion

Upload, not CPU, limits viewers: roughly four 1080p films at once, shared with Jellyfin.

## Follow-up

`MAX_VIEWERS=4` ([ADR-0008](../decisions/ADR-0008-viewer-limit-from-upload.md)). The owner will look into a faster upload.
