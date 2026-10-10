# Monitoring

*Living document. Code: `server/src/monitor.js`; wiring in `app.js`.*

## What is counted

Per day (container local time), in `DATA_DIR/activity/<YYYY-MM-DD>.json`: sign-ins, who watched, films / Live TV /
audio conversions, the peak number of viewers, people turned away (viewer limit, Live TV slots, conversions),
no-sound reports and errors. The last 100 events are also kept in memory.

## Where you see it

| Where | What |
|---|---|
| Sign-in page, as an admin | "Today on Beacon": today's numbers, latest events, who's watching now, Live TV slots. Refreshes every 30 s (`GET /api/admin/activity`) |
| Discord (via n8n's `/webhook/activity`) | **Alerts**, at most one an hour per kind, with a ping: someone turned away by a limit, or 5 errors within 10 minutes |
| Discord, daily at `DIGEST_HOUR` (21:00) | **Summary**: who watched, plays, conversions, peak vs limit, no-sound reports, errors, and days left on Premiumize (`premium_until`) and IPTV (`exp_date`). It pings when either is within 7 days |
| `docker logs beacon` | Sign-ins, allowlist changes, failures (with usernames; never keys, passwords or stream URLs) |

## What to do with it

- **Turned away often by the viewer limit:** see [ADR-0008](../history/decisions/ADR-0008-viewer-limit-from-upload.md)
  before raising `MAX_VIEWERS`. The limit protects Sol's upload, which Jellyfin also uses.
- **No-sound reports:** the release is probably mislabelled. Reports already change its label for everyone. If a
  pattern repeats, `compat.js` may need a new audio-name rule.
- **Days left low:** the accounts are Barr's. Renewals were due on **2026-10-25 (IPTV)** and **2026-10-27 (Premiumize)**.
