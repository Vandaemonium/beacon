# Beacon 4.1.1 — Screen refresh stability

- Prevented repeated refresh-timer rescheduling while the player is open.
- Rate-limited full row refreshes to prevent poster flashing during background data events.
- Avoided re-fetching Premiumize merely because its cloud library is empty.
- Retained the existing Trakt OAuth/PKCE implementation, source search, Live TV, and playback.

These are targeted code corrections. Real-browser playback and Trakt synchronization require user testing.
