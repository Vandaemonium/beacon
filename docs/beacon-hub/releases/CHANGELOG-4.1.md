# Beacon 4.1

- Replaced device code + Client Secret flow with Chrome Identity authorization code + PKCE (S256).
- Removed obsolete `urn:ietf:wg:oauth:2.0:oob` redirect.
- Added `identity` manifest permission.
- Configured user's registered public Trakt client ID; no Client Secret stored.
- Updated refresh and revoke to avoid Client Secret.
- Kept the original poster-based UI, Trakt sync functions, Live TV, source engine, TorBox and Premiumize modules.

**Not yet verified:** successful real-account Trakt authorization, refresh, IPTV and cloud playback.
