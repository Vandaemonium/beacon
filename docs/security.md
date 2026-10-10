# Security

*Living document. Beacon is public on the internet and sits between that internet and three paid accounts. The
server must never become an open relay into Sol.*

## Secrets

| Secret | Lives | Never |
|---|---|---|
| Premiumize / TorBox keys, IPTV login | Sol `~/docker/.env` → container env | In git, in a browser, in a log, in a stream link in clear text |
| `SESSION_SECRET` | Sol `.env` | Anywhere else. Changing it signs everyone out |
| Users' Trakt tokens | `DATA_DIR/users/<id>.json` on Sol | Shared between users |
| Jellyfin passwords | Nowhere: checked against Jellyfin, then forgotten | Logged |

The repository is **public** (GitHub reports `PUBLIC` as of 2026-10-09). `.gitignore` blocks `.env`, settings
backups, passcode files and `.m3u`/`.m3u8` playlists. A history scan on 2026-10-09 found no committed secrets. The
only key-like string is Barr's Trakt client ID in `extension/app/lib/trakt.js`, which is public by design (PKCE, no
client secret).

## Defenses in place

- **Login:** Jellyfin password, plus Beacon's allowlist (Jellyfin admins always allowed). Failed logins are
  rate-limited per address.
- **Session:** HttpOnly, Secure, signed cookie (`beacon_session`). The allowlist is re-checked on every request,
  and Jellyfin about once a minute.
- **CSRF:** every state-changing request must come from the same host (or `ALLOWED_ORIGINS`) and be JSON.
- **CSP and headers** on every response: scripts only from `self`, no framing, `object-src 'none'`.
- **The app is gated:** `extension/` files are served only to signed-in users. Only `web/` is public.
- **Provider calls:** only allowlisted Premiumize/TorBox paths. Premiumize deletes are admin-only. IPTV login
  added on Sol and stripped from every answer. Express fetches are limited to hosts in the shared packages.
- **Stream links:** AES-256-GCM tokens, 12 h, tied to a user who must still be allowed.
- **No reaching inside Sol:** `upstream.js` refuses non-http(s) URLs, `localhost`/`.local`/`.internal` names, and
  private, loopback, link-local and CGNAT addresses.
- **VPN, fail closed:** all outside traffic goes through Gluetun's HTTP proxy. If the VPN is down, requests fail
  instead of leaving from Sol's home address. Provider hostnames are not resolved by Sol's DNS
  ([INC-0001](history/incidents/INC-0001-provider-dns-resolved-outside-the-vpn.md)).

## Known gaps

1. **Names are checked inside the VPN, not by Beacon.** Behind the proxy, only literal IP addresses are checked
   locally, to avoid DNS leaks. A hostile provider could return a hostname that resolves to `127.0.0.1` *inside the
   Gluetun container*, which would reach services sharing Gluetun's network (qBittorrent, Mylar3, Brave). Risk is low:
   links come only from Barr's configured providers. Noted in the design doc on 2026-10-09; not yet fixed.
2. **Redirects aren't re-checked.** `fetchUpstream` follows redirects (`redirect: 'follow'`), and only the first URL
   passes `assertPublic`. When the proxy is off, a redirect to a private address wouldn't be caught. Fix: follow
   redirects manually and check each hop.
3. **The classic pages** (`media.html`, `index.html`) weren't reviewed for the website. They're gated behind login,
   but they may try to store keys in the browser if someone types them in.
4. **Shared accounts.** Debrid and IPTV services may treat a shared account as a terms violation. Streams are proxied
   from one address partly for this reason ([ADR-0003](history/decisions/ADR-0003-communal-accounts-proxied-through-sol.md)).

## Reporting

This is a private project. Tell the owner (Cory) or Barr directly. Don't open a public issue for anything that could
expose the accounts.
