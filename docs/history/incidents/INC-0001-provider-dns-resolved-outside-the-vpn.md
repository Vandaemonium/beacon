---
id: INC-0001
type: incident
title: Provider hostnames were resolved by Sol's DNS, outside the VPN
date: 2026-10-09
recorded: 2026-10-09
source: reconstructed
status: resolved
authors: [Claude (Opus 5.5)]
evidence: [commit 9c790f8, commit 18a305c, commit f669df2, server/src/upstream.js]
related: [ADR-0004]
---

# INC-0001: Provider hostnames were resolved by Sol's DNS, outside the VPN

## Symptoms

None reported by users. The problem was in the code of step 4 (`9c790f8`, 10:02). `upstream.js` looked up every
provider hostname with `dns.lookup()` to refuse private addresses, before sending the request through Gluetun's proxy.

## Impact

Each lookup told Sol's normal DNS resolver which provider was being contacted. The traffic itself still went through
the VPN. Whether any lookups happened on Sol is **unknown**. The fix (`18a305c`, 10:04) came 2 minutes after step 4
and before the deploy notes for the proxy (`f669df2`, 10:12). How it was noticed isn't recorded.

## Cause

The private-address guard and the proxy were designed separately. With a proxy, the proxy resolves the name, so a
local lookup is pure leakage.

## Fix

`18a305c`: when `NODE_USE_ENV_PROXY=1` and an HTTPS proxy is set, only literal IP addresses are checked locally.
Names are left to the proxy, which resolves inside the VPN, and Gluetun's firewall blocks local networks.

## Prevention

The reasoning is in a comment in `assertPublic()`. The trade-off this creates (Beacon can't vet names itself) is
recorded under known gaps in `docs/security.md`. No test covers the proxy branch.
