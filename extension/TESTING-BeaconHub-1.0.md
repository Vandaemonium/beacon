# Beacon Hub 1.0: Test results

These tests ran in Chromium with this exact extension loaded. Trakt, Premiumize, add-ons, an Express provider and an IPTV server were **simulated**.

**Passed:**
- The full end-to-end suite: 84/84 checks, including the new ones below.
- Express search, Live TV HLS playback and the guide.
- 4 out of 4 cold starts with all Home rows present.

## New in Hub 1.0 (all passed)
- An HEVC/HDR MKV with no DTS/TrueHD plays the **original** file.
- A DTS-HD file starts on the browser-friendly stream, shows why, and **Try original** switches back.
- Returning to the tab with no changes does not redraw the rows.
- When Trakt rejects the sign-in:
  - The Reconnect banner appears and the avatar shows a warning dot.
  - Beacon Hub tries the refresh only once.
  - Lists are kept and the saved sign-in is not deleted.
  - Settings shows "Sign-in expired" and a Reconnect button.
- A successful reconnect clears the warning.
- The Trakt card shows the chromiumapp.org address. No password or Client Secret is ever sent.
- Branding reads Beacon Hub 1.0.

## Still needs your real accounts
- The actual Trakt sign-in window. Headless Chrome can't open it, so tests simulated a completed sign-in.
- Your real Premiumize files and providers.
- H.264/AAC and HEVC playback in Google Chrome on your PC. The test browser has no proprietary codecs.
- Your IPTV provider.
