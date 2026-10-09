# Beacon 5.0 changelog
- Changed Home refresh throttle to a trailing, pending refresh queue; updates arriving during cooldown or while hidden/player-open are not discarded.
- Added Chrome Web Locks cross-tab coordination around Trakt refresh-token rotation where supported.
- On refresh errors, checks whether a different tab has saved a newer token; does not automatically clear a user session for HTTP 400/401.
- Preserved Beacon 4.1.2 Express-source search fix, Trakt PKCE, Live TV, cloud integrations and the UI.
- Consistent manifest, Settings and package version 5.0.0 / Beacon 5.0.
- Replaced obsolete 4.0 Trakt setup/testing documents.
- Extension ID NOT pinned: current public key was not available; generating a new key would break the existing Chrome extension ID and redirect.

Limitations: Real Trakt, TorBox, Premiumize and IPTV tests have not run in this environment. Web Locks coordination requires same-origin Chrome extension pages.
