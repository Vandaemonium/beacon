# Beacon Hub 1.2

## Honest compatibility labels
Every source now gets one of three labels:
- **Plays in Chrome:** only when the file name lists *both* the video and audio format, and this browser supports both. Also shown when Premiumize already has a browser-friendly copy.
- **Format unknown:** the name doesn't say enough to be sure, for example `Movie.1080p.mp4` or `720p.HDTV.x264` with no audio listed. These are **never hidden**. Hover over the label to see what's missing.
- **Won't play here:** the name lists a format this browser can't play. Only these are hidden by default.

In 1.1, a file with no format information got a green "Plays in Chrome" label. That overpromised.

Settings › Browser compatibility now explains the three labels. Playable sources still sort first, then unknown, then incompatible.

## Live TV: freeze detection and controlled reconnect
- A **watchdog** checks the picture every 2 seconds. If a channel freezes for 10 seconds without reporting an error, or takes more than 20 seconds to start, it reloads the stream quietly. A small "Reconnecting (1 of 3)…" message shows, then "Reconnected."
- Errors and freezes go through the same path: up to **3 reconnects** with short waits between them (immediately, 2 s, 5 s). After that you get a clear error with **Try again**, **Next channel** and **Close**. No endless retrying.
- Pausing yourself never triggers a reconnect. After a pause of more than 30 seconds, Play jumps back to live instead of playing old video.

## Connection & VPN check
- New **Settings › Connection & VPN** card with **Check my connection**. It shows the IP address, location and network that Beacon Hub's requests come from. It also says whether that looks like a VPN/hosting network or a regular internet provider.
- A **VPN check** button on the Live TV page does the same check.
- Wording fixed throughout. Beacon Hub sends requests through Chrome so your VPN extension **can** cover them, and this check is how you confirm it actually does.
