---
id: ADR-0001
type: decision
title: Run Barr's UI in the browser, with a thin server doing what the extension's permissions did
date: 2026-10-09
recorded: 2026-10-09
source: reconstructed
status: accepted
authors: [Claude (Opus 5.5)]
evidence: [design doc "Beacon on Empyrean: design" (Architecture, What changes file by file), commit b41f376, commit 9c790f8]
supersedes: []
related: [ADR-0003, ADR-0005, EXP-0003]
---

# ADR-0001: Run Barr's UI in the browser, with a thin server doing what the extension's permissions did

## Context

Beacon Hub is a Manifest V3 extension. It relies on things a normal web page can't do: `host_permissions` for every
site (to avoid cross-site request limits), `chrome.storage.local` for secrets, and `chrome.identity` for the Trakt
sign-in. It also holds provider keys and the IPTV login in the browser. The owner wanted it reachable from any
browser behind a login they control, using communal accounts.

The design doc found that only 4 files call Chrome's extension APIs, and that nearly every network request in the
new UI goes through one helper (`fetchJson` in `app/lib/store.js`).

## Options

1. **Rewrite the UI as a new web app.** Clean, but discards Barr's working code and his ownership of it.
2. **Serve the UI almost unchanged and add a server** that does what the extension's permissions used to do: hold
   secrets, add keys, proxy what can't be called cross-site.
3. **Remote browser / streamed desktop.** Not considered in the records.

## Decision

Option 2. The UI keeps running in the viewer's browser. Website behavior is switched on with `onEmpyrean()`, so the
same folder still works as Barr's extension. Calls to services that allow cross-site requests (Trakt, Cinemeta,
Stremio add-ons, checked 2026-10-09, [EXP-0003](../experiments/EXP-0003-which-services-allow-browser-calls.md)) stay
in the browser. Everything needing a communal key goes through the server.

The owner set the goal. The architecture was Claude's proposal in the design doc ("build order left to Claude"),
and the owner went ahead with it.

## Consequences

- Barr's code stays recognizably his. The diff from 1.2.1 is about 350 lines in 16 files.
- Two code paths must be kept working: extension and website.
- The older pages (`media.html`, `index.html`) were not adapted. That's a known gap.
