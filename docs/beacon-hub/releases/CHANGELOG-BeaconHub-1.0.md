# Beacon Hub 1.0

Beacon Hub 1.0 is built on Beacon 5.1. Your saved data carries over: IPTV login, providers, Premiumize/TorBox keys, Trakt sign-in and watch history.

## Changes since Beacon 5.1

**Playback: original quality first**
- MKV files no longer jump straight to Premiumize's browser-friendly (re-encoded) stream. The original plays first, including H.264 and HEVC/HDR files.
- Beacon Hub only starts with the browser-friendly stream when the file name shows something Chrome can't handle:
  - DTS or TrueHD audio, which would otherwise play with no sound.
  - An AVI, WMV, FLV or TS file.
- When that happens, a note explains why, with a **Try original** button.
- If an original file fails to play, Beacon Hub still switches to the browser-friendly stream automatically, as before.
- Error messages now describe the actual causes (HEVC video your PC can't decode, AVI/WMV files).

**Trakt: expired sign-ins are visible**
- If Trakt rejects your saved sign-in (you revoked access, or the session expired), a banner asks you to **Reconnect Trakt**. The Trakt avatar gets an amber dot.
- Settings shows "Sign-in expired" and a Reconnect button.
- Your cached lists stay visible in the meantime. Your saved sign-in isn't deleted.
- Beacon Hub stops retrying a rejected sign-in, instead of calling Trakt over and over.
- Sync problems now show a one-time notice. The details are listed under Settings › Trakt instead of being hidden in the developer console.
- Reconnecting in another Beacon Hub tab is picked up automatically.

**Smoother screen**
- Switching back to the Beacon Hub tab no longer redraws every row unless something actually changed.

**Name and version**
- Renamed to **Beacon Hub 1.0** everywhere: toolbar, tab titles, navigation, Settings, footer, Live TV and the Providers page.
- Removed the superseded setup notes (`SETUP-4.1.md`, `SETUP-5.0.md`, `README-5.1.txt`). `SETUP.md` replaces them.

## Kept from Beacon 4.1–5.1
- Trakt sign-in with PKCE (no Client Secret).
- Only one tab renews the Trakt sign-in at a time.
- Screen updates are delayed, never dropped.
- Express providers are searched from the new screens.
- "Copy active link for VLC."
