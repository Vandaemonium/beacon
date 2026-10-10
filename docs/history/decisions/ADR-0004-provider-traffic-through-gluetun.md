---
id: ADR-0004
type: decision
title: All outside traffic leaves through Gluetun's ProtonVPN proxy, failing closed
date: 2026-10-09
recorded: 2026-10-09
source: reconstructed
status: accepted
authors: [Claude (Opus 5.5)]
evidence: [design doc "Communal accounts" (Outgoing VPN), commit 9c790f8, commit 18a305c, commit f669df2, docs/operations/deploy-sol.md]
supersedes: []
related: [ADR-0003, INC-0001]
---

# ADR-0004: All outside traffic leaves through Gluetun's ProtonVPN proxy, failing closed

## Context

Empyrean's rule is that provider traffic (qBittorrent and friends) leaves through Gluetun/ProtonVPN and fails closed.
In the extension, Barr's users relied on a VPN browser extension. Beacon also has to reach Jellyfin, which runs
host-networked on Sol.

## Options

1. **Run Beacon inside Gluetun's network namespace** (`network_mode: service:gluetun`), like qBittorrent. All
   traffic goes through the VPN, but reaching Jellyfin on the host gets awkward.
2. **Keep Beacon on the normal Docker network and use Gluetun's built-in HTTP proxy** (`HTTPPROXY: "on"`, port 8888)
   for outside requests, with `NO_PROXY` for Jellyfin and n8n.

## Decision

Option 2. Compose sets `HTTP_PROXY`/`HTTPS_PROXY` to `http://gluetun:8888` and `NODE_USE_ENV_PROXY=1`. When the VPN
is down, requests fail instead of leaving from Sol's home address. Step 2 initially stayed outside Gluetun because it
only talked to Jellyfin. The proxy arrived with step 4.

## Consequences

- Sol's exit address (Datacamp/Proton) is what providers see, and `/api/netcheck` shows it.
- Name resolution must happen inside the VPN, not on Sol ([INC-0001](../incidents/INC-0001-provider-dns-resolved-outside-the-vpn.md)).
- Because names resolve inside Gluetun, Beacon can't check them for private addresses itself (see `docs/security.md`, known gaps).
