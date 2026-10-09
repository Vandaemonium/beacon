# Beacon 4.1.2 — Express search bridge fix

- Fixes movie and episode searches from the new Beacon UI silently skipping every Express provider because of a stale `searchRaw` capability check.
- Uses existing `searchRule` method, preserving enabled provider rules and individual diagnostics.
- No changes to Trakt, playback, Premiumize, TorBox, IPTV, or stored account settings.
- Chrome/browser integration remains to be tested.
