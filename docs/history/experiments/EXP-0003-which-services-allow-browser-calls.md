---
id: EXP-0003
type: experiment
title: Which outside services can the browser call directly?
date: 2026-10-09
recorded: 2026-10-09
source: reconstructed
status: done
authors: [Claude (Opus 5.5)]
evidence: [design doc "What changes, file by file" (sources.js, meta.js row), commit b41f376]
related: [ADR-0001]
---

# EXP-0003: Which outside services can the browser call directly?

## Question

The extension's `host_permissions` let it call any site. A web page can only call sites that allow cross-site
requests (CORS). Which of Beacon's services still work straight from the browser, and which need the server?

## Method

Checked on 2026-10-09 during design. The exact requests aren't recorded.

## Results

The design doc reports that Stremio add-ons, Cinemeta and Trakt all allow it. Barr's Express search sites (the
OpenScrapers rules) block cross-site browser requests (commit `9c35fb9`).

## Conclusion

Metadata, add-on and Trakt calls stay in the browser. Express searches need the server.

## Follow-up

- The CSP's `connect-src 'self' https:` allows those direct calls (`b41f376`).
- `/api/express/fetch` fetches Express search pages through the VPN, limited to hosts in the shared packages (`9c35fb9`).
- If an add-on someone adds doesn't allow CORS, it won't work on the website. That hasn't been reported yet.
