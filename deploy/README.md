# Running Beacon on Sol

Beacon runs as the `beacon` container in Sol's `~/docker/compose.yaml`, built from a
checkout of this repo at `~/beacon` on Sol. During the build-out it is **tailnet only**:
<https://sol.tail5afeac.ts.net:8445>. It goes public at `beacon.empyrean.cc` in build step 5.

## Secrets (Sol's `~/docker/.env`, never in git)

| Name | What |
|---|---|
| `JELLYFIN_API_KEY` | Already there (used by `health`). Lists users for the admin page. |
| `BEACON_SESSION_SECRET` | 48+ random characters; signs login cookies. Changing it signs everyone out. |

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
    extra_hosts:
      - host.docker.internal:host-gateway
    ports:
      - 127.0.0.1:8796:8796
    volumes:
      - ./config/beacon:/data      # allowlist.json (owned by uid 1000)
    cpu_shares: 256
    restart: unless-stopped
```

Step 4 moves it into Gluetun's network so provider traffic leaves through ProtonVPN.

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
