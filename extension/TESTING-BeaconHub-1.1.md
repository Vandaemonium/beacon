# Beacon Hub 1.1: Test results

These tests ran in Chromium with the extension loaded. Trakt, Premiumize, add-ons, an Express provider and an IPTV server (34 channels, 7 categories, now/next guide) were **simulated**.

**Passed:**
- The full regression suite: 84/84 checks.
- The new Live TV and compatibility suite: 25/25 checks.
- 4 out of 4 cold starts with all rows present, plus the Express search.

## Live TV (all passed)
- **Signing in:** styled sign-in page. The login is saved in the same slot as classic Live TV, and the classic page still signs in with it.
- **Channel rows:** grouped by category, with now-playing info filled in on each card.
- **Player:** the HLS channel plays with the NOW/NEXT guide. ↑/↓ changes channel, C opens the channel list, Esc closes it.
- **After watching:** "Continue watching" banner and Recently Watched row. Favorites are saved in the classic format.
- **TV Guide view.**
- **Finding channels:** category chips, channel search, and hiding a category.
- **Home:** Live TV row.
- **Phone width:** no sideways scrolling.

## Browser compatibility filter (all passed)
These checks simulated a browser without HEVC or Dolby audio support.
- A 4K HEVC + DD+ source is hidden, with the reason shown.
- A DD+ source that Premiumize has a browser-friendly copy of stays visible, labeled "Plays in Chrome (browser-friendly)."
- **Show them** reveals hidden sources with "Won't play here: HEVC video, DD+ audio."
- On a browser that supports HEVC, an HEVC MKV plays the original file.
- The Settings card lists what the browser supports.

## Needs your PC and accounts
- **Format support:** what your Chrome can play depends on your PC and graphics card. The ✓/✗ list in Settings shows the real result.
- **Your IPTV provider's streams.** Some providers only offer formats browsers can't play. The player says so and offers Next channel.
- **Real Trakt sign-in, Premiumize files and providers.**
