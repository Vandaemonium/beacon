# Troubleshooting

*Living document. Each entry is a symptom, a check and a fix. When you solve something new, add it here **and**
write an incident record in [`../history/incidents/`](../history/incidents/).*

| Symptom | Check | Fix / meaning |
|---|---|---|
| Sign-in: "The media server is very busy and took too long to check your password" (503) | Is Jellyfin slow? Sol's library disk is often very busy | Wait and retry. Sign-ins wait up to 30 s ([INC-0004](../history/incidents/INC-0004-slow-jellyfin-sign-in.md)) |
| "Your Jellyfin account works, but it isn't on Beacon's list yet" | The user isn't on the allowlist | An admin ticks them on "Who can use Beacon" |
| Every provider fails at once | Settings → Connection & VPN, or `docker exec beacon node -e "fetch('https://ipinfo.io/org').then(r=>r.text()).then(console.log)"` | Should say Datacamp/Proton. If it fails, Gluetun is down or its `HTTPPROXY` is off. Beacon fails closed by design |
| Film plays without sound | Is the label "Sol converts the audio"? Use the player's "…" menu | Toggle converted audio. If the original was silent, a report is sent and the label changes for everyone |
| Sound ahead of or behind the picture in a converted film | Which release? Seek once | Report it with the release name. Past cause: [INC-0003](../history/incidents/INC-0003-converted-audio-11-seconds-early.md) |
| Live TV channel silent | Dolby audio on that channel? | Should be converted automatically (`liveaudio.js`). Needs ffmpeg in the image |
| "All N Live TV slots are in use right now" | Admin panel: Live TV slots | Wait. Slots free 30 s after a viewer leaves. The plan allows 3 |
| "Beacon is at its limit of N people watching right now" | Admin panel: viewers | Expected under load; see [monitoring.md](monitoring.md) |
| "This link has expired…" / "…or its owner was signed out" | Was the link (or VLC playlist) older than 12 h, or was the user removed? | Start the video again in Beacon, or download a new playlist |
| Trakt sign-in returns an error | The address must match a Redirect URI of the "Empyrean Beacon" Trakt app | Use `beacon.empyrean.cc` or the tailnet address, not another hostname |
| A change to `shared-defaults.json` doesn't show up | Did you bump `version`? | Bump it. Browsers reload once to apply it |
| Express search finds nothing on the website | Is the site's host named in the shared Express packages? | `/api/express/fetch` only fetches those hosts |
| Classic Media Hub / Classic Live TV misbehave on the website | Those pages weren't adapted | Known gap (see [../architecture/overview.md](../architecture/overview.md#known-gaps)) |
