---
id: ADR-0006
type: decision
title: The website uses Empyrean's own Trakt app; the extension keeps Barr's
date: 2026-10-09
recorded: 2026-10-09
source: reconstructed
status: accepted
authors: [Claude (Opus 5.5)]
evidence: [design doc open question "Trakt app" and Build order step 3, commit 3a5f44a, AI-Context worklist A31]
supersedes: []
related: [ADR-0001]
---

# ADR-0006: The website uses Empyrean's own Trakt app; the extension keeps Barr's

## Context

Trakt sign-in needs a Redirect URI registered on the Trakt app. The extension uses Barr's app with a
`chromiumapp.org` return address. The website returns to `/beacon.html` on its own hostname.

## Options

1. Add the website's addresses to **Barr's existing Trakt app**.
2. Create an **"Empyrean Beacon" Trakt app**.

## Decision

Option 2, set up on 2026-10-09. Its client ID is the server setting `TRAKT_CLIENT_ID` (Sol `.env`
`BEACON_TRAKT_CLIENT_ID`), handed to signed-in browsers by `/api/config`. It's PKCE, so there's no client secret. Its
Redirect URIs are `https://sol.tail5afeac.ts.net:8445/beacon.html` and `https://beacon.empyrean.cc/beacon.html`. It
was verified with Trakt on 2026-10-09. The extension keeps Barr's built-in ID.

Who made the final choice between the two options isn't recorded. The design doc listed it as open, and the
Empyrean app was then created.

## Consequences

- Each user connects their own Trakt account, and tokens are stored per user on Sol.
- Any new hostname for Beacon must be added to the app's Redirect URIs.
