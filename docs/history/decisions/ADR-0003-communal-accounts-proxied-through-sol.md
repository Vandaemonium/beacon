---
id: ADR-0003
type: decision
title: Communal provider keys live only on Sol, and streams are proxied through Sol
date: 2026-10-09
recorded: 2026-10-09
source: reconstructed
status: accepted
authors: [Claude (Opus 5.5)]
evidence: [AI-Context canonical decisions.md 2026-10-09, design doc "Communal accounts", commit 9c790f8]
supersedes: []
related: [ADR-0004, ADR-0008]
---

# ADR-0003: Communal provider keys live only on Sol, and streams are proxied through Sol

## Context

The owner: *"For now we will be using Barr's accounts"* (Premiumize, TorBox, IPTV, shared by "us and our
coworkers"), staying *"open to the possibility of switching that later to a per-user model."* Xtream-style IPTV
stream URLs contain the username and password. Debrid services watch for one account streaming to many addresses.

## Options

For keys: keep them in each browser (as the extension does), or keep them on Sol only.

For video, from the design doc:
1. **Proxied (recommended to start):** provider → Sol → viewer. One address on each account, but every stream uses
   Sol's home upload.
2. **Direct:** the viewer plays the provider link from their own connection. Fast and free for Sol, but the account
   then streams to many addresses at once, which debrid services can suspend.

## Decision

Keys stay in Sol's `.env` and are added by the server. IPTV is always proxied, with the login stripped from every
answer. Premiumize and TorBox streams are proxied too. Every media link becomes an encrypted, expiring Beacon
stream link. Live TV is capped at the plan's connection limit, so the server says "all N slots in use" rather than
letting the provider cut someone off.

**Per-user later** is designed as a settings change: each key is stored with an owner (`communal` or a user), the
user's own key is tried first, and the owner can turn off the communal fallback per provider. Not built yet.

## Consequences

- No viewer can copy a key or the IPTV login out of their browser.
- Sol's upload limits concurrent viewers ([ADR-0008](ADR-0008-viewer-limit-from-upload.md)).
- VLC playlists work through token links that need no cookie.
