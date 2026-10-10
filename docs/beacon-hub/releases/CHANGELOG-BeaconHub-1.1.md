# Beacon Hub 1.1

## Only show sources this browser can play
- Beacon Hub now checks which video and audio formats **this Chrome on this PC** can actually play: H.264, HEVC/H.265, AV1, Dolby Vision, AAC, Dolby Digital, DD+, DTS and TrueHD.
- It compares that with each source's file name (x265, DDP5.1, DTS-HD, AVI…).
- By default, the source list **hides sources that would need VLC or another player outside the browser**. A note says how many were hidden and why, with **Show them** if you want to see them anyway.
- Each source is labeled:
  - **Plays in Chrome**
  - **Plays in Chrome (browser-friendly)**: Premiumize already has a version Chrome can play.
  - **Won't play here: …**: only shown after you click Show them.
- Playable sources sort first. Your own Premiumize cloud files are never hidden.
- The player uses the same check, so a file is only switched to Premiumize's browser-friendly stream when this browser really can't handle the original.
- New **Settings › Browser compatibility** card: choose "Hide sources this browser can't play" (default) or "Show every source". It also shows what your browser supports, with a ✓ or ✗ for each format.

## Live TV rebuilt in the Hub style
- **Live TV** in the top navigation now opens inside Beacon Hub, in the same style as Movies and TV Shows.
- **Continue watching** banner for your last channel, showing what's on now and next with a progress bar.
- Channel rows by category with a **LIVE** badge and channel logo. Each card shows what's on now and when it ends. ★ adds a channel to favorites.
- **Recently Watched** and **Favorites** rows. Category chips, channel search, and a **Categories** button to hide categories you never watch.
- **TV Guide** view listing what's on now and next for every channel, with progress bars.
- New full-screen live player:
  - Now/next guide and a LIVE indicator.
  - **↑ / ↓** (or the arrow buttons) change channels within the category. **C** opens a channel list with search.
  - Recovers automatically from brief stream hiccups. If a channel is down, it offers **Try again** or **Next channel**.
- A **Live TV** row on Home lets you jump back into recent channels.
- Uses the **same saved IPTV login, favorites, recent channels and hidden categories** as before, so there's nothing to set up again.
- The classic Live TV page still works. Open it from Settings › Live TV › **Classic Live TV**.
- All IPTV requests still go straight from this browser to your provider, so your browser VPN extension can cover them (1.2 adds a check to confirm it).

## Fixes
- The mobile menu button was being squeezed on narrow screens.
