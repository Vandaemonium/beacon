# Testing

*Living document.*

## Server tests

```bash
cd server && npm test        # node --test test/
```

There are 49 tests as of `5ce8534` (2026-10-09). They need Node 22+, plus `ffmpeg` and `ffprobe` on `PATH` for the
conversion tests. They use no network: Jellyfin, Premiumize, TorBox and IPTV are fake servers started by the tests.

| File | Covers |
|---|---|
| `app.test.js` | Login, lockout after 5 failures, allowlist, disabled users, sessions and tampered cookies, origin checks, static gating, per-user secrets, the Trakt client ID, sound reports |
| `providers.test.js` | Path allowlists, key injection, **leak checks** (no key or IPTV login in any answer or playlist), stream links, Live TV slots, Express fetch rules |
| `convert.test.js` | Real ffmpeg conversions from mid-film, keyframe start, late-audio padding (fails without the INC-0003 fix) |
| `liveaudio.test.js` | Real AC-3 → AAC segment conversion, AAC pass-through byte for byte, switched-off behavior |
| `compat.test.js` | The UI's `compat.js` labelling, run with a stub browser |
| `viewers.test.js` | The viewer limit, and that turning someone away alerts |
| `monitor.test.js` | Counters, alert throttling, the daily summary |

**Not covered by tests:** the slow-Jellyfin sign-in handling (`5ce8534`), the playlist `CODECS` rewrite, and anything in the browser except `compat.js`.

When you fix a bug, add a test that fails without the fix, as `5fe1631` did.

## Documentation checks

```bash
node scripts/docs.mjs check                  # against origin/backend
node scripts/docs.mjs check --base <ref>     # against another base
```

This checks:

- relative links in our Markdown resolve (Barr's files in `docs/beacon-hub/` are skipped);
- every history record has valid front matter, an ID matching its filename, and a unique ID;
- `docs/history/_index.md` is up to date (`node scripts/docs.mjs index` regenerates it);
- **append-only:** no history record that exists on the base was modified, renamed or deleted.

## Manual checks

There is no automated browser test. Before merging UI or streaming changes, check in Chrome on the tailnet address:
sign in, open a film with Dolby audio (it should play converted, in sync, and seek), open a Live TV channel, and
download a VLC playlist. Say in the commit or PR which of these you did and didn't do.

## CI

`.github/workflows/check.yml` runs the server tests and the documentation checks on every push and pull request.
