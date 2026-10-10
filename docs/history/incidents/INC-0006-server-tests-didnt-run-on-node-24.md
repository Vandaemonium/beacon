---
id: INC-0006
type: incident
title: Server tests didn't run on Node 24
date: 2026-10-09
recorded: 2026-10-09
source: contemporaneous
status: resolved
authors: [Claude (Opus 5.5)]
evidence: [GitHub Actions run 38017811303, server/package.json]
related: [JRN-0002]
---

# INC-0006: Server tests didn't run on Node 24

## Symptoms

The first CI run on PR #1 (GitHub Actions run `38017811303`, Node 24.21.0) failed in "Server tests" with
`MODULE_NOT_FOUND`, reporting `tests 1, fail 1`. On Polaris, the same `npm test` had passed 49/49.

## Impact

None on the live site. It only affected anyone running the tests on Node 24, which is the version in the Docker
image, so on Sol it would have been noticed the first time someone ran the tests there. Every test count reported
so far came from Polaris (Node 26), so those counts are still valid.

## Investigation

- Polaris runs Node 26.8.2, and CI used 24.21.0 (`setup-node` with `node-version: 24`).
- Under `mise exec node@24`, `node --test test/` gave `tests 1, fail 1`: Node 24 treats the `test/` argument as a
  module to load, not a directory to search.

## Cause

`"test": "node --test test/"` relied on Node 26's handling of a directory argument.

## Fix

`server/package.json`: `"test": "node --test 'test/*.test.js'"`. The quoted glob is expanded by Node itself, not the
shell. Verified: 49 pass on Node 24.21.0 and on Node 26.8.2.

## Prevention

CI now runs the tests on Node 24, the image's version, so a regression like this fails the pull request.
