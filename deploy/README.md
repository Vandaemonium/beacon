# Running Beacon on Sol

Beacon runs as the `beacon` container in Sol's `~/docker/compose.yaml`, built from a
checkout of this repo at `~/beacon` on Sol. Public at **<https://beacon.empyrean.cc>** (since 2026-10-09;
Caddy + a DNS record kept by `cloudflare-ddns`), and on the tailnet at <https://sol.tail5afeac.ts.net:8445>.

## Secrets (Sol's `~/docker/.env`, never in git)

| Name | What |
|---|---|
| `JELLYFIN_API_KEY` | Already there (used by `health`). Lists users for the admin page. |
| `BEACON_SESSION_SECRET` | 48+ random characters; signs login cookies. Changing it signs everyone out. |
| `BEACON_TRAKT_CLIENT_ID` | Client ID of the "Empyrean Beacon" Trakt app (not secret). Its Redirect URIs: `https://sol.tail5afeac.ts.net:8445/beacon.html`, `https://beacon.empyrean.cc/beacon.html`. |

| `BEACON_PREMIUMIZE_API_KEY`, `BEACON_TORBOX_API_KEY` | The communal accounts (Barr's). Unset = that provider is off. |
| `BEACON_IPTV_SERVER`, `BEACON_IPTV_USERNAME`, `BEACON_IPTV_PASSWORD` | The communal Live TV login. Never reaches a browser. |
| `BEACON_IPTV_MAX_STREAMS` | How many Live TV streams the plan allows at once (3 as of 2026-10-09). |
| `BEACON_MAX_VIEWERS` | People watching at once (default 4). Every stream uses Sol's home upload: 35-39 Mbit/s measured 2026-10-09, ~8 Mbit/s per 1080p film, shared with Jellyfin. |

Make the session secret with `openssl rand -base64 48`.

## compose.yaml

```yaml
  beacon:
    build: ../beacon               # ~/beacon on Sol (this repo)
    image: local/beacon:latest
    container_name: beacon
    environment:
      TZ: America/Detroit
      JELLYFIN_URL: http://host.docker.internal:8096   # host-networked (ufw: 172.16.0.0/12 -> 8096)
      JELLYFIN_API_KEY: ${JELLYFIN_API_KEY:?set in .env}
      SESSION_SECRET: ${BEACON_SESSION_SECRET:?set in .env}
      TRAKT_CLIENT_ID: ${BEACON_TRAKT_CLIENT_ID:-}   # Empyrean Beacon Trakt app
      PREMIUMIZE_API_KEY: ${BEACON_PREMIUMIZE_API_KEY:-}
      TORBOX_API_KEY: ${BEACON_TORBOX_API_KEY:-}
      IPTV_SERVER: ${BEACON_IPTV_SERVER:-}
      IPTV_USERNAME: ${BEACON_IPTV_USERNAME:-}
      IPTV_PASSWORD: ${BEACON_IPTV_PASSWORD:-}
      IPTV_MAX_STREAMS: ${BEACON_IPTV_MAX_STREAMS:-1}
      # Everything outside Sol goes through Gluetun (ProtonVPN); fails closed if the VPN is down.
      NODE_USE_ENV_PROXY: "1"
      HTTP_PROXY: http://gluetun:8888
      HTTPS_PROXY: http://gluetun:8888
      NO_PROXY: host.docker.internal,localhost,127.0.0.1
    extra_hosts:
      - host.docker.internal:host-gateway
    ports:
      - 127.0.0.1:8796:8796
    volumes:
      - ./config/beacon:/data      # allowlist.json (owned by uid 1000)
    cpu_shares: 256
    restart: unless-stopped
```

Gluetun needs `HTTPPROXY: "on"` (port 8888, reachable only on the Docker network). Beacon stays on
the normal network so it can reach Jellyfin; everything else goes through the proxy. Check it with
Settings → Connection & VPN, or `docker exec beacon node -e "fetch('https://ipinfo.io/org').then(r=>r.text()).then(console.log)"`
(should say Datacamp/Proton, not Comcast).

## Public site (Caddy, `~/docker/caddy/Caddyfile`)

```
beacon.{$NEW_DOMAIN} {
	import common
	reverse_proxy 127.0.0.1:8796 {
		flush_interval -1
	}
}
```

Only the new domain: the Empyrean Beacon Trakt app's Redirect URIs list `beacon.empyrean.cc`. Add
`beacon.${NEW_DOMAIN}` to `cloudflare-ddns`'s `DOMAINS` for the DNS record. A brand-new record can make the
first certificate attempt fail (NXDOMAIN); `docker exec caddy caddy reload --force ...` retries at once.

## Tailnet address

```bash
sudo tailscale serve --bg --https=8445 http://127.0.0.1:8796
```

## Update

```bash
cd ~/beacon && git pull && cd ~/docker && docker compose up -d --build beacon
```

## Who can sign in

Jellyfin admins always can. Everyone else: sign in as an admin and tick them on the
"Who can use Beacon" list. The list lives in `~/docker/config/beacon/allowlist.json`.
