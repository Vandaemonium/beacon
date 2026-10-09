# Beacon 4.0: Streaming-style redesign

Built on the Beacon 3.6 Chrome extension you supplied. Everything from 3.6 is still here: Live TV, the guide, favorites, add-ons, Express providers, vendors, TorBox, Premiumize, backups and history.

## New look
- New main screen (`beacon.html`) opens when you click the toolbar icon. It has a top navigation bar: **Home · Live TV · Movies · TV Shows · My Lists · Premiumize**, plus Search, Settings and your Trakt avatar.
- A large featured banner with backdrop, title logo, rating, runtime, genres and **Play / More Info / + Watchlist**. It cycles through a few titles slowly and pauses when you hover over it.
- Horizontal poster rows that scroll with arrows, plus a "Top 10" row with large rank numbers. Landscape cards with progress bars for Continue Watching, Next Episodes and Upcoming.
- Hovering a poster shows the title, year, rating and quick buttons (sources, watchlist, info). Cards also show watched ✓ and cloud badges.
- Click any row title to collapse it, and Beacon remembers that. "See all" opens a full grid for the row.
- A details window for each title. Movies show the synopsis, year, runtime, genres, certification, rating, watched status, list membership, your Trakt rating and any copies in your Premiumize cloud.
- Shows get a full **season and episode browser**: every season, every episode, thumbnail, air date, runtime, synopsis, watched ✓, progress and an "In your cloud" tag. Unaired episodes show their air date.
- New fonts (Inter and Outfit, bundled locally), a dark midnight theme with Beacon-amber accents, a mobile layout, and keyboard support (`/` opens search, Esc closes windows).

## Trakt (new)
- Sign in through Trakt's official **device-code OAuth**: you enter a code at trakt.tv/activate. Beacon never asks for your Trakt password.
- Tokens are kept in `chrome.storage.local`, which only this extension can read, and refresh automatically. Settings has Connect, Disconnect (which also revokes the token) and Sync Now.
- Syncs when Beacon opens and every 15 minutes while it is open. It uses `/sync/last_activities` to download only what changed.
- What syncs: watchlist, your custom lists, liked lists, watched movies, watched episodes, Continue Watching (paused playback), Up Next, history, ratings, recommendations, your episode calendar, plus trending, popular, anticipated and recently released titles.
- Changes you make in Beacon go back to Trakt: watchlist add/remove, list add/remove, create a list, mark watched or unwatched, rate 1–10, and remove an item from Trakt's Continue Watching (asks first).
- Playback is scrobbled with Trakt's official `/scrobble` start, pause and stop. Trakt only marks something watched at 80% or more, and each viewing sends a single stop, so nothing is marked twice. Searching never marks anything watched.
- All Trakt data is cached, so your lists still show when Trakt is down.

## Sources
- **Play** or **Search for Sources** searches all of your enabled providers for that exact title automatically: your Premiumize cloud, your TorBox cloud, installed stream add-ons and enabled Express providers.
  - Movies are searched by IMDb ID plus title and year.
  - Episodes are searched by `tt…:S:E` and `Title S03E04`.
- Results show quality, file name, size, seeders, provider, and HDR / Dolby Vision / HEVC / Atmos tags. They also show **⚡ Instant on Premiumize** (from a cache check), **In your cloud** and **Full-season pack**.
- Filters: Ready to play, 4K, 1080p, 720p, Season packs.
- There is a per-provider status list. A provider that fails or times out is shown as failed and does not block the others.
- Playing a season pack automatically picks the right episode's file.
- The source menu has: Save to Premiumize, Send to TorBox, Copy magnet, and **Copy link for VLC**.

## Player
- New full-screen player with custom controls: seek bar with buffer, ±10 s, volume, full screen, keyboard shortcuts and the title shown.
- **Resume** jumps to the saved spot and shows a "Start over" button. It falls back to Trakt's saved progress if there's no local position.
- Progress is saved every 10 s, on pause and on close. Watched locally means 90% or more.
- If Chrome can't play a file's codec, the player switches to Premiumize's browser-friendly stream automatically. You can also switch manually in the ⋯ menu. It warns you if a file plays with no sound.
- **Up Next** card near the end of an episode, with an optional countdown that opens the next episode's sources. It can also auto-play a similar source; that option is off by default.
- If a link fails you get a clear message with Choose another source, Copy link for VLC, or Try browser-friendly stream.

## Premiumize
- A Premiumize page that sorts your cloud into TV Series and Movies, with posters where the title matches confidently. Other videos are listed separately.
- Transfers tab with progress and status. You can add a magnet or URL, remove a transfer, or clear finished ones.
- Cloud files appear first in source results and are tagged on episodes.

## Fixes to existing pages
- **`vendor/hls.min.js` in 3.6 was corrupted** (its first bytes were missing), so hls.js never loaded. It is replaced with a clean hls.js 1.6.15 and Live TV HLS channels play in the browser again.
- On the Live TV page, Chrome's security policy (CSP) was silently blocking inline styles, which hid the progress bars and hero artwork. These now work.
- Live TV's Movies and TV Shows buttons open the new screens, and there is a **← Beacon Home** link. The Media Hub opens straight to the right tab (`media.html#providers`, `#accounts`).
- Live TV and Media Hub were restyled to match. Their behavior is unchanged.

## Storage compatibility
- Same storage keys as before: IPTV login, Premiumize/TorBox keys (`beacon:hub:*`), add-ons, Express packages and history (`beacon:media:history:v1`, extended in a backward-compatible way).
- Added the `storage` permission (used for the Trakt tokens).
