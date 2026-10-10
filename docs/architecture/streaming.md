# Streaming, audio conversion and limits

*Living document. Code: `server/src/providers.js`, `vault.js`, `upstream.js`, `convert.js`, `liveaudio.js`, and
the viewer limit in `app.js`.*

## Stream links

Every media URL a provider returns (Premiumize `link`/`stream_link`/`location`, TorBox download links, IPTV
streams) is replaced with `/api/stream/<token>` before it reaches the browser.

- The token is **AES-256-GCM encrypted** (`vault.js`), because it carries the provider URL. That URL can contain the
  IPTV login or a signed CDN path.
- It lasts **12 hours** and names the user it was issued to. If that user has been removed from the allowlist, it stops working.
- It needs **no cookie**. That's what lets VLC open a downloaded `.m3u` playlist.
- `GET /api/stream/<token>` pipes the provider's response through Sol, passing Range requests both ways.

Video therefore flows **provider → Sol → viewer**. Each account sees a single address (Sol's VPN exit), and nobody
can copy a key or IPTV login out of their browser. The cost is that every stream uses Sol's home upload.

## Viewer limit

`MAX_VIEWERS` (default 4) caps how many **people** watch at once, across films, converted films and Live TV.
A person counts while one of their streams is open, and for 20 s after their last request. One person may open as
many streams of their own as they like (seeks, HLS segments). When the limit is reached, the server answers 429 with
a plain message, and both players show it. Why 4: [ADR-0008](../history/decisions/ADR-0008-viewer-limit-from-upload.md).

## Live TV

- `player_api` calls get the IPTV login added on Sol and stripped from every answer.
- `live/<id>.m3u8` playlists are rewritten so each segment is a Beacon stream link.
- **Slots:** open channels are counted against `IPTV_MAX_STREAMS` (3 on the current plan). A slot is freed 30 s after
  its last request. When all slots are in use, the viewer is told so instead of the provider cutting someone off.
- **Dolby audio:** about 1 in 3 sampled channels sent AC-3/E-AC-3, which Chrome plays silently. `liveaudio.js`
  probes each channel's audio once (cached 10 min). For AC-3/E-AC-3 channels, it re-encodes each MPEG-TS segment's
  audio to AAC with ffmpeg (video copied, timestamps kept, run under `nice`) and rewrites the playlist's `CODECS`.
  AAC channels pass through untouched.

## Films and episodes: audio conversion

Browsers can't play Dolby Digital / DD+, DTS or TrueHD audio in files. Premiumize's "browser-friendly" links turned
out to be the original files ([EXP-0001](../history/experiments/EXP-0001-premiumize-stream-link-is-the-original.md)).
So Sol converts the audio itself:

| Route | Returns |
|---|---|
| `GET /api/stream/<token>/info` | `{ duration, video, audio: [{index, codec, channels, default}] }` (cached 1 h) |
| `GET /api/stream/<token>/start?t=S` | `{ start }`: the keyframe at or before S where the converted stream really begins |
| `GET /api/stream/<token>/aac?t=S` | The film from that keyframe as fragmented MP4: video copied, default audio track → AAC stereo |

- ffmpeg reads the original through Beacon's own `/api/stream/<token>` on 127.0.0.1. That way it gets Range
  requests and the VPN, and never sees a provider URL.
- **Sync:** copied video can only start on a keyframe. `-noaccurate_seek -copyts` starts the audio at the same
  keyframe, and `/start` tells the player where that is, so its clock is right. `aresample=async=1` with `first_pts`
  pads late-starting audio with silence. Without it, a file with 11 s of video before its first audio packet played
  sound 11 s early ([INC-0003](../history/incidents/INC-0003-converted-audio-11-seconds-early.md)).
- **Seeking:** in converted mode, the player restarts Sol's stream at the new time (debounced while scrubbing), and
  adds the offset to the clock, progress bar, resume point and Trakt progress.
- **When:** a release whose only problem is audio starts converted. A silent original switches automatically. The
  "…" menu toggles it.
- **Limits:** 2 conversions per person and 10 in total. Cost measured on Sol on 2026-10-09: 2.4% of one core for
  DD+ 5.1, and 4.6% for TrueHD 7.1, per viewer. Upload, not CPU, is the limit.
- Video and container problems (for example AVI, or codecs the browser lacks) are **not** fixed. Those sources are
  labelled "Won't play here", and the VLC playlist is offered instead.

## "Plays in Chrome" labels

`extension/app/lib/compat.js` labels each source from its release name and this browser's `canPlayType`. Viewers'
players report after 6 s whether audio actually decoded (`webkitAudioDecodedByteCount`). Those reports are shared on
Sol (`compat-reports.json`, newest 5000 releases) and override the release name either way.
