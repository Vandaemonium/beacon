---
id: ADR-0002
type: decision
title: Sign in with Jellyfin accounts, plus Beacon's own allowlist
date: 2026-10-09
recorded: 2026-10-09
source: reconstructed
status: accepted
authors: [Claude (Opus 5.5)]
evidence: [AI-Context canonical decisions.md 2026-10-09, design doc "Security and access", commit f3ce215]
supersedes: []
related: [ADR-0001]
---

# ADR-0002: Sign in with Jellyfin accounts, plus Beacon's own allowlist

## Context

The owner: *"Ultimately it will be public facing, but require a login for which I control"*, preferably Jellyfin
accounts, and *"ultimately I want users to be able to easily access all services from a central hub."* Wizarr
invites already create Jellyfin accounts for Empyrean's users.

## Options

1. **Jellyfin accounts only.** Anyone with Jellyfin gets Beacon, and so the paid accounts.
2. **Jellyfin accounts plus an allowlist.** Same password, but an admin decides who gets Beacon.
3. **A single sign-on service** (Authelia, Authentik) in front of everything. Left as an open question for the
   central hub.

## Decision

Option 2. Passwords are checked against Jellyfin, and the Jellyfin session created by the check is ended at once.
Jellyfin admins are always allowed; anyone else must be ticked by an admin. Beacon issues its own signed,
stateless cookie, and re-checks the allowlist on every request and Jellyfin about once a minute. Removing someone
therefore takes effect immediately.

The owner chose Jellyfin accounts. The allowlist was Claude's addition in the design doc ("having a Jellyfin account
isn't enough"), accepted with it.

## Consequences

- Wizarr invites plus a tick on Beacon's list are the whole onboarding.
- Sign-in depends on Jellyfin being responsive ([INC-0004](../incidents/INC-0004-slow-jellyfin-sign-in.md)).
- Single sign-on across Empyrean is still undecided.
