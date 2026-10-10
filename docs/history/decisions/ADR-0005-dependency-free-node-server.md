---
id: ADR-0005
type: decision
title: A Node server with no npm dependencies
date: 2026-10-09
recorded: 2026-10-09
source: reconstructed
status: accepted
authors: [Claude (Opus 5.5)]
evidence: [design doc "Build order" step 2, commit f3ce215, server/package.json]
supersedes: []
related: [ADR-0001]
---

# ADR-0005: A Node server with no npm dependencies

## Context

The backend needed HTTP routing, cookies, crypto, JSON file storage, outbound fetches, a test runner and ffmpeg
process control.

## Decision

Node, *"the same language as Barr's code"* (design doc), so he can work on both halves. It uses only Node built-ins:
`node:http`, `node:crypto`, `node:fs`, `node:test`, global `fetch`, and `NODE_USE_ENV_PROXY` for the proxy. The
first commit describes `server/` as "a dependency-free Node service". `package.json` has no `dependencies`.

**Why no dependencies** is not written down beyond that phrase. Plausible reasons (inferred, not recorded): nothing to
audit or update, a small image, and no supply-chain exposure in a public-facing service.

## Consequences

- The image is `node:24-alpine` plus ffmpeg, and needs no `npm install`.
- Anything a library would normally do (routing, cookie signing, rate limiting) is a small hand-written module. New
  dependencies need a new ADR (see `AGENTS.md`).
