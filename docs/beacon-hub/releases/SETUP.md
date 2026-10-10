# Beacon Hub 1.2: Setup

## Update without losing anything
1. Back up your current Beacon extension folder by copying it somewhere safe.
2. Copy the contents of `Beacon-Hub-1.2/` **into that same folder**, replacing its files.
   - Don't load it from a new folder. Chrome ties the extension ID, your saved settings and the Trakt return address to the folder location.
3. Go to `chrome://extensions` and click **Reload** on the extension. It now shows as **Beacon Hub**, version 1.2.

The version number restarts at 1.0.0 because of the new name. That's fine for an unpacked extension.

## Trakt
Go to Settings › Trakt › **Connect Trakt** and sign in on Trakt's page. No Client Secret is needed.

The return address shown in Settings (`https://<extension-id>.chromiumapp.org/`) must be listed in your Trakt app's Redirect URIs. It's already set up if you connected in 4.1–5.1.

If you ever see the amber **Reconnect Trakt** banner, click it and sign in again. Nothing is lost.

## Premiumize
Settings › Premiumize. Paste your API key and click **Connect & test**. If you were already connected, nothing changes.

## Playback format
Settings › Playback › Stream format:
- **Auto** (recommended): plays the original file. Uses the browser-friendly stream only for DTS/TrueHD audio or AVI/WMV/TS files, or when the original fails to play.
- **Always original file**: never uses the browser-friendly stream.
- **Prefer browser-friendly stream**: always uses Premiumize's re-encoded version when one exists.

## Keeping everything in the browser
**Settings › Browser compatibility › Source filter**
- **Hide sources this browser can't play** (default). Only sources marked **Won't play here** are hidden. The source list tells you how many and why, with a **Show them** link.
  - **Plays in Chrome:** the file name lists both the video and audio format, and this browser supports both. (Or Premiumize already has a browser-friendly copy.)
  - **Format unknown:** the name doesn't say enough to be sure. These are never hidden.
- **Show every source.**

The ✓ / ✗ list on that card shows what your Chrome can play. It's checked live on your PC.

## Live TV
Click **Live TV** in the top bar.
- If you were already signed in to Live TV, your channels, favorites and recent channels appear right away.
- Otherwise, enter your provider's server URL, username and password.

Keyboard: **↑/↓** change channel, **C** opens the channel list, **F** full screen, **M** mute, **Esc** back.

The old Live TV page is still available under Settings › Live TV › **Classic Live TV**.

## Confirm your VPN covers Beacon Hub
Go to **Settings › Connection & VPN › Check my connection** (or **VPN check** on the Live TV page).
- The address and location shown should match your VPN app, not your home internet.
- If it shows your home internet provider, your VPN extension isn't covering Beacon Hub. Check that its bypass / split-tunnel list doesn't include your IPTV or Premiumize addresses.
