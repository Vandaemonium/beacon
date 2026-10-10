---
id: EXP-0001
type: experiment
title: Is Premiumize's "browser-friendly" stream_link really transcoded?
date: 2026-10-09
recorded: 2026-10-09
source: reconstructed
status: done
authors: [Claude (Opus 5.5)]
evidence: [commit 52d90ca, AI-Context worklist A31]
related: [ADR-0007, INC-0005]
---

# EXP-0001: Is Premiumize's "browser-friendly" stream_link really transcoded?

## Question

Beacon Hub labels some Premiumize sources "Plays in Chrome (browser-friendly)" and offers "Switch to browser-friendly
stream", trusting `cache/check`'s `transcoded=true` and `directdl`'s `stream_link`. Does that link actually carry
browser-playable audio?

## Method

On 2026-10-09, three cached *Dune* releases were probed (the tool isn't recorded), comparing `stream_link` against `link` from
`transfer/directdl`.

## Results

For all three, `stream_link` was the same MKV as `link`, with the same TrueHD / DTS / DD+ audio, even though
`cache/check` said `transcoded=true`.

## Conclusion

For cached releases, Premiumize's "browser-friendly" link is the original file, so the label and the switch both led to
the same silent file. Confidence: high for these three; whether it's universal is unknown.

## Follow-up

- `52d90ca`: the server drops `stream_link` when it equals `link`, and the website ignores the `transcoded` flag
  for labels.
- This led to Sol doing its own audio conversion ([ADR-0007](../decisions/ADR-0007-server-side-audio-conversion.md)).
- **Barr's extension has the same problem.** The owner was to tell him.
