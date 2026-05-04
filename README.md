# knightsrook-distributed-fleet-forge

Distributed Fleet Forge: A containerized chaos lab where sovereign-tier kiosk fleets learn to survive everything you throw at them — and the test bed is the production build.

## Socket events

| Event | Direction | Description |
|---|---|---|
| `fleet:graph` | server → client | Full fleet graph (nodes + links + `isMock` flag) |
| `fleet:request` | client → server | Request/re-request fleet data |
| `agent:register` | agent → server | Agent announces itself (`id`, `name`, `role`, `parentId`) |
| `agent:heartbeat` | agent → server | Keepalive every 5s — node goes `dead` after 15s silence |
| `node:logs:subscribe` | client → server | Start streaming `docker logs -f` for a node |
| `node:logs:unsubscribe` | client → server | Stop log stream |
| `node:logs:line` | server → client | Single log line with timestamp |
| `node:logs:error` | server → client | Log stream error (e.g. container not found) |
| `node:shell:open` | client → server | Open PTY shell (`docker exec -it /bin/sh`) |
| `node:shell:input` | client → server | Keystrokes to shell stdin |
| `node:shell:resize` | client → server | Terminal resize (cols × rows) |
| `node:shell:close` | client → server | Close shell |
| `node:shell:output` | server → client | PTY output bytes |
| `node:shell:ready` | server → client | Shell is open and ready |
| `node:shell:error` | server → client | Shell error (e.g. Docker unavailable) |
| `node:stats:subscribe` | client → server | Start streaming `docker stats` for a node |
| `node:stats:unsubscribe` | client → server | Stop stats stream |
| `node:stats:data` | server → client | Stats snapshot (cpu, mem, net rates, uptime, process list) |

## Branding

`client/public/logo.png` — 512×512 transparent-background logo mark (AI-generated, Flux 1 Dev). Also used as `favicon.ico`.

## Stack

- **Frontend:** React + Vite (TypeScript), react-force-graph-2d, socket.io-client
- **Backend:** Express (TypeScript), socket.io
- **Database:** MySQL
- **Deploy:** Docker

## Dashboard

Click any node in the fleet graph to open a resizable 2×2 panel layout. Drag the center vertical or horizontal divider to resize quadrants.

| Quadrant | Panel | Content |
|---|---|---|
| Upper-left | Monitor | Animated htop-style CPU/MEM/NET + process list. SSH button (stub). |
| Upper-right | Fleet graph | Force-directed topology, shrinks to quadrant |
| Lower-left | Stats/Screen | Two tabs: Stats (uptime, CPU, RAM, disk, net, ping, location, ID) and Screen (role-aware: game kiosks show HexGL screenshot, info kiosks show event schedule, controllers/homebase show system status) |
| Lower-right | Logs/Shell | Two tabs: Logs (streaming journal output) and Shell (interactive bash session) |

Click background or the ✕ button to return to full-screen graph.

## Architecture

Three-tier cascade autonomy: homebase → station-controllers → kiosk swarms. Each node type carries a status (federation / island / swarm / dead) that reflects its connectivity tier. The fleet dashboard visualizes live node state as a force-directed graph.

### Node types

| Role | Tier | Description |
|---|---|---|
| `homebase` | 1 | `Home` — central control plane |
| `station-controller` | 2 | `S#` — per-station sovereign node |
| `game-kiosk` | 3 | `KG1–KG4` — game terminals (4 per station), swarm participants |
| `info-kiosk` | 3 | `KI1–KI2` — info displays (2 per station), swarm participants |

Force layout uses charge `-30` with per-link distances (homebase→station `80`, station→kiosk `40`) plus a `forceCollide` radius guard to prevent node overlap. Type shim for `d3-force-3d` lives in `client/src/d3-force-3d.d.ts`.

### Status colors

| Status | Color | Meaning |
|---|---|---|
| `federation` | green | All tiers connected |
| `island` | yellow | Station operating without homebase |
| `swarm` | orange | Kiosks operating without controller |
| `dead` | red | Node unreachable |

## Quickstart

```bash
cp .env.example .env
# fill in .env values

pnpm install
pnpm dev
```

The header has a two-mode segmented toggle:

| Mode | Behavior |
|---|---|
| **Offline Demo** | Default. Mock fleet, no containers needed. Switching to it calls `POST /api/chaos/stop` (spins down any running lab). |
| **Online Lab** | Calls `POST /api/chaos/start` → `docker compose -f docker-compose.chaos.yml up --build -d`. Once real agents register, `isMock` on `fleet:graph` flips to `false`. |

> **Windows note:** Vite proxy targets use `127.0.0.1` instead of `localhost` to avoid the IPv6/IPv4 mismatch in Node 18+ on Windows.

## Docker

```bash
# Production (app + MySQL)
docker compose up --build

# Chaos lab (homebase + 2 stations + kiosks + Toxiproxy)
docker compose -f docker-compose.chaos.yml up --build
```

## Chaos lab

`docker-compose.chaos.yml` spins up the full cascade autonomy stack with correct network isolation:

- **`fleet-net`** — homebase ↔ station-controllers only
- **`station-s1-net` / `station-s2-net`** — kiosks ↔ their station-controller relay only; no direct route to homebase

Each station-controller runs a relay (`containers/station-controller/`) that connects upstream to homebase and listens downstream for kiosk registrations — the cascade autonomy seam. Kiosks (`containers/fleet-agent/`) connect only to their controller relay.

**Toxiproxy** control API is exposed on `:8474` for the gremlin driver to inject failures between tiers.

The server falls back to `buildMockFleet()` when no agents are connected (`USE_MOCK=true` forces mock always).
