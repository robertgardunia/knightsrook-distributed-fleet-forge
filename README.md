# knightsrook-distributed-fleet-forge

Distributed Fleet Forge: A containerized chaos lab where sovereign-tier kiosk fleets learn to survive everything you throw at them — and the test bed is the production build.

## Socket events

| Event | Direction | Description |
|---|---|---|
| `fleet:graph` | server → client | Full fleet graph (nodes + links + `isMock` flag) |
| `fleet:request` | client → server | Request/re-request fleet data. Pass `{ mock: true }` to force mock fleet regardless of live agents. |
| `agent:register` | agent → server | Agent announces itself (`id`, `name`, `role`, `parentId`) |
| `agent:heartbeat` | agent → server | Keepalive every 5s — node enters `alerting` state at 9s silence, goes `dead` at 15s |
| `kiosk:event` | agent → server | Kiosk state change (`SIGNIN`/`SIGNOUT`, `VISITOR_ARRIVE`/`VISITOR_DEPART`) — updates `activePlayer` on the fleet graph node in real-time regardless of log subscribers |
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
| Lower-left | Stats/Screen | Two tabs: Stats (uptime, CPU, RAM, disk, net, ping, location, ID) and Screen (role-aware: in Online Lab, kiosks show a live iframe of the kiosk's nginx page; in Offline Demo, game kiosks show static HexGL screenshots and info kiosks cycle through simulator slides; controllers/homebase show system status) |
| Lower-right | Logs/Shell | Two tabs: Logs (streaming journal output) and Shell (interactive bash session) |

Click background or the ✕ button to return to full-screen graph.

The header search box filters all nodes by name/role. Selecting a result zooms and centers the graph to that node identically to clicking it directly.

## Architecture

Three-tier cascade autonomy: homebase → station-controllers → kiosk swarms. Each node type carries a status (federation / island / swarm / dead) that reflects its connectivity tier. The fleet dashboard visualizes live node state as a force-directed graph.

### Node types

| Role | Tier | Description |
|---|---|---|
| `homebase` | 1 | `Home` — host dev server (`pnpm dev`), not a container; shell/logs use demo simulation |
| `station-controller` | 2 | `S#` — per-station sovereign node; container names `s1-controller`…`s4-controller` match agent IDs |
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

Nodes that miss 1–2 heartbeats (9–15s window) show a pulsing orange ring while still alive — visual warning before going dead. Sidebar node-detail header uses the same uppercase/spaced register as the panel tab headers.

## Quickstart

```bash
cp .env.example .env   # minimum: PORT=5020, NODE_ENV=development

pnpm install
pnpm dev
```

The header has a two-mode segmented toggle:

| Mode | Behavior |
|---|---|
| **Offline Demo** | Default. Mock fleet, no containers needed. Switching to it calls `POST /api/chaos/stop` (spins down any running lab). Graph is cleared and rebuilt from mock data — live nodes never bleed through. |
| **Online Lab** | Calls `POST /api/chaos/start` → clears registry then `docker compose -f docker-compose.chaos.yml up --build -d`. Station controllers connect back to the host dev server via `host.docker.internal:5020` (Docker Desktop resolves this automatically). Graph clears on switch; "Forging Network" overlay shows until real agents register and `isMock` flips to `false`. Registry is also cleared on `chaos/stop` so stale dead nodes never bleed into a new lab session. |

> **Windows note:** `windowsHide: true` is set on the chaos `docker compose` spawn to prevent a CLI window flashing on screen. Vite proxy targets use `127.0.0.1` instead of `localhost` to avoid the IPv6/IPv4 mismatch in Node 18+ on Windows.

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

Each station-controller runs a relay (`containers/station-controller/`) that connects upstream to homebase and listens downstream for kiosk registrations — the cascade autonomy seam.

Game kiosks (`containers/game-kiosk/`) serve HexGL on port 8080 in attract mode: title screen with "INSERT COIN" blink → pre-recorded replay drives the ship around the track → loops. Info kiosks (`containers/info-kiosk/`) serve a slideshow of simulator guide slides on port 8080 with random 8–20s intervals between slides. Each kiosk agent simulates player activity: game kiosks emit `SIGNIN / GAME_START / LAP_COMPLETE / GAME_OVER / SIGNOUT` events; info kiosks emit `VISITOR_ARRIVE / SLIDE_VIEW / QR_SCAN / VISITOR_DEPART` — all streamed to the Logs tab via docker logs. Both use a two-stage Docker build: TypeScript compiles in stage 1, the runtime stage installs production `node_modules` separately so the fleet agent has `socket.io-client` available. Nginx serves kiosk HTML using the `index` directive (not a redirect) to avoid nginx leaking the internal container port (8080) in Location headers when accessed via host-mapped ports.

**Toxiproxy** control API is exposed on `:8474` for the gremlin driver to inject failures between tiers.

The server falls back to `buildMockFleet()` when no agents are connected (`USE_MOCK=true` forces mock always).
