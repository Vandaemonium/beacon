# Beacon Hub 1.2: Test results

These tests ran in Chromium with the extension loaded. Services and the IPTV provider were **simulated**.

**Passed:**
- The full regression suite: 84/84.
- The Live TV and compatibility suite: 25/25.
- The new 1.2 suite: 14/14.
- 4 out of 4 cold starts with all rows present, plus the Express search.

## New in 1.2 (all passed)
- **Format unknown:** a name without audio info (`720p.HDTV.x264`) and a bare `.mp4` show "Format unknown", not "Plays in Chrome".
- **Browser-friendly copy:** a source Premiumize already has a browser-friendly copy of shows "Plays in Chrome (browser-friendly)".
- **Filtering:** "Format unknown" sources stay visible. Only "Won't play here" is hidden.
- **Connection check:** shows the IP, location and network, and recognizes a VPN/hosting network. It's available in Settings and on the Live TV page.
- **Freeze detection:**
  - A frozen live stream with no error event is detected after about 10 seconds.
  - It reconnects by itself and shows "Reconnected."
  - Pausing yourself for 13 seconds doesn't trigger a reconnect.
- **Dead channel:** it retries 3 times (4 requests in total, about 12 seconds), then shows "The channel isn't responding, and reconnecting didn't help."

## Needs your setup
- **Check my connection** with Surfshark on. Compare the result with the location Surfshark shows.
- How your provider's real streams behave when they stall.
- Your Chrome's actual format support, shown in Settings › Browser compatibility.
