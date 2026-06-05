# Operator setup — wiring ynab-mcp into bexar-egress-proxy

These changes live in the **operator-managed** `~/projects/bexar-egress-proxy/`
stack (not in agent reach). They mirror the existing `egress-proxy-hub` /
`ingress-edge` blocks. Apply once, then `docker compose up -d` that stack
BEFORE bringing up ynab-mcp (whose `docker-compose.yml` requires the external
`bexar-egress-ynab` network).

## 1. `bexar-egress-proxy/compose.yml`

### a) Add the per-service tinyproxy (egress)

```yaml
  egress-proxy-ynab:
    build:
      context: ./proxy-image
      dockerfile: Dockerfile
    container_name: egress-proxy-ynab
    restart: unless-stopped
    environment:
      PROJECT_NAME: ynab
      ALLOWLIST_SOURCE: /etc/tinyproxy/in/ynab.allowlist
    volumes:
      - /home/dkay/projects/ynab_mcp/tools/egress:/etc/tinyproxy/in:ro
    networks:
      - bexar-egress-ynab
      - internet
    healthcheck:
      test: ["CMD", "nc", "-z", "127.0.0.1", "3128"]
      interval: 30s
      timeout: 5s
      retries: 3
```

### b) Attach `ingress-edge` to the new network and publish a host port (ingress)

Add `"8002:8002"` to `ingress-edge.ports` and `bexar-egress-ynab` to its
`networks:` list so nginx can resolve `ynab-mcp` by DNS.

### c) Declare the network

```yaml
  bexar-egress-ynab:
    name: bexar-egress-ynab
    internal: true     # no direct NAT; outbound only via egress-proxy-ynab
```

## 2. `bexar-egress-proxy/ingress/default.conf`

Add a server block (host 8002 -> ynab-mcp Streamable-HTTP endpoint). The long
read timeout matches the MCP block for hub-mcp (SSE streams stay open).

```nginx
server {
    listen 8002;
    server_name _;

    set $ynab_upstream "ynab-mcp:4322";

    location / {
        proxy_pass http://$ynab_upstream$request_uri;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_connect_timeout 5s;
        proxy_read_timeout 300s;
    }
}
```

## 3. (optional) bexar-deployer

Add `projects/ynab_mcp.conf` (copy `hub.conf`) with `PROJECT_NAME=ynab_mcp`,
this repo's `REPO_PATH`, `PATH_MAPPINGS` mapping `src/`, `Dockerfile`,
`package*.json` -> `ynab-mcp`, and `HEALTHCHECK_CONTAINERS=ynab-mcp`.
Note: editing `tools/egress/ynab.allowlist` only affects the tinyproxy
(which reads it live on restart), not the app container.

## Result

- Clients reach the MCP server at `http://<bexar-host>:8002/mcp`.
- ynab-mcp has no direct NAT; all outbound calls tunnel through
  `egress-proxy-ynab`, which permits only hosts in `ynab.allowlist`
  (`api.ynab.com`). Default-deny.
