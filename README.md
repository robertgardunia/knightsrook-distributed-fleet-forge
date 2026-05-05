# knightsrook-distributed-fleet-forge

Distributed Fleet Forge: A containerized chaos lab where sovereign-tier kiosk fleets learn to survive everything you throw at them — and the test bed is the production build.

## Socket events

| Event | Direction | Description |
|---|---|---|
| `fleet:graph` | server → client | Full fleet graph (nodes + links + `isMock` flag) |
| `fleet:request` | client → server | Request/re-request fleet data. Pass `{ mock: true }` to force mock fleet regardless of live agents. |
| `agent:register` | agent → server | Agent announces itself (`id`, `name`, `role`, `parentId`) |
| `agent:heartbeat` | agent → server | Keepalive every 5s — node enters `alerting` state at 9s silence, goes `dead` at 15s |
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
| `node:stats:error` | server → client | Stats stream error (e.g. Docker unavailable) |

## Telemetry API

Node history is held in-memory (no external database). Stats are sampled every 5s (capped at 720 entries per node, ~1 hour) and events (register / alerting / dead / recovered) are capped at 500 per node. Used by the recovery agent to distinguish degradation curves from instant failures and detect endemic instability.

| Endpoint | Description |
|---|---|
| `GET /api/fleet` | Current fleet graph as `{ nodes[], links[] }` — live registry only (no mock fallback). |
| `GET /api/chaos/ready` | Returns `{ ready: true }` once the lab homebase container is answering on `:5025`. Polled by the dashboard before connecting the fleet socket — prevents `ERR_CONNECTION_REFUSED` spam during container startup. |
| `POST /api/chaos/trigger` | Fires one chaos cycle immediately — emits `chaos:trigger` to the chaos agent which runs `runChaosStep()` without waiting for the next scheduled interval. Exposed as an `⚡ Chaos` button in the dashboard header (visible in Online Lab mode only). |
| `GET /api/telemetry/:nodeId` | Returns `{ nodeId, windowMs, stats[], events[] }` for the node. Optional `?window=<ms>` param (default 5 minutes). |

Each station controller also exposes its own telemetry HTTP server (same port as the relay, `:5021`) for homebase pull-sync:

| Endpoint | Description |
|---|---|
| `GET /telemetry/:nodeId[?window=<ms>]` | Events for a specific kiosk. |
| `GET /telemetry?since=<ts>` | All kiosk events since a Unix ms timestamp — used by homebase gap sync on reconnect. |

Station telemetry records kiosk events only (register / alerting / dead / recovered). Stats remain the King's spy channel via Docker API. Network address (IP on station subnet) is captured from the socket connection and included in registration gossip upstream.

## Branding

`client/public/logo.png` — 512×512 transparent-background logo mark (AI-generated, Flux 1 Dev). Also used as `favicon.ico`.

## Stack

- **Frontend:** React + Vite (TypeScript), react-force-graph-2d, socket.io-client
- **Backend:** Express (TypeScript), socket.io
- **Telemetry:** In-memory Maps (stats + events per node); playbook persisted to `server/data/playbook.json`
- **Deploy:** Docker

## Dashboard

The right sidebar shows fleet status (federation/island/swarm/dead counts, station + kiosk totals) and a live activity log — chaos actions, fireman spawns, and recovery events stream in as they happen with timestamps and color coding.

Click any node in the fleet graph to open a resizable 2×2 panel layout. Drag the center vertical or horizontal divider to resize quadrants.

| Quadrant | Panel | Content |
|---|---|---|
| Upper-left | Monitor | Animated htop-style CPU/MEM/NET + process list. SSH button (stub). |
| Upper-right | Fleet graph | Force-directed topology, shrinks to quadrant |
| Lower-left | Stats/Screen | Two tabs: Stats (uptime, CPU, RAM, disk, net, ping, location, ID) and Screen (role-aware: in Online Lab, kiosks show a live iframe of the kiosk's nginx page; in Offline Demo, game kiosks show static HexGL screenshots and info kiosks cycle through simulator slides; controllers/homebase show system status) |
| Lower-right | Logs/Shell | Two tabs: Logs (streaming journal output) and Shell (interactive bash session) |

Click background or the ✕ button to return to full-screen graph. A refresh button sits in the top-right corner of the fleet graph panel in both full-screen and panel mode.

The header search box filters all nodes by name/role. Selecting a result zooms and centers the graph to that node identically to clicking it directly.

### Live event overlays

Three fixed overlays provide real-time narrative visibility during Online Lab mode:

| Overlay | Position | Content |
|---|---|---|
| **Toast strip** | Top-center | `⚡ chaos action → target` and `✓ recovered` toasts, auto-dismiss after 3.5s |
| **Fireman panel** | Bottom-right | Incidents grouped by ID: fault type → action steps → outcome. Escalations shown in red with ACK button. |
| **Playbook panel** | Bottom-left | Accumulated fault patterns with success rate bar (green ≥80%, yellow ≥50%, red below). Refreshes every 10s. Hidden until first incident resolves. |

Node animations on the force graph:
- **Red shockwave** — two expanding rings when chaos agent targets a node
- **Blue pulse** — beating ring on a dead node while Fireman is actively working it
- **Green burst** — three cascading rings on recovery

## Architecture

Three-tier cascade autonomy: homebase → station-controllers → kiosk swarms. Each node type carries a status (federation / island / swarm / dead) that reflects its connectivity tier. The fleet dashboard visualizes live node state as a force-directed graph.

### Node types

| Role | Tier | Description |
|---|---|---|
| `homebase` | 1 | `Home` — host dev server (`pnpm dev`), not a container; shell/logs use demo simulation |
| `station-controller` | 2 | `S#` — per-station sovereign node; container names `s1-controller`…`s4-controller` match agent IDs |
| `game-kiosk` | 3 | `KG1–KG4` — game terminals (4 per station), swarm participants |
| `info-kiosk` | 3 | `KI1–KI2` — info displays (2 per station), swarm participants |

Force layout uses charge `-60` with per-link distances (homebase→station `38`, station→kiosk `22`) plus a `forceCollide` radius guard to prevent node overlap. Type shim for `d3-force-3d` lives in `client/src/d3-force-3d.d.ts`.

### Status colors

| Status | Color | Meaning |
|---|---|---|
| `federation` | green | All tiers connected |
| `island` | yellow | Station operating without homebase |
| `swarm` | orange | Kiosks operating without controller |
| `dead` | red | Node unreachable |

Nodes that miss 1–2 heartbeats (9–15s window) show a pulsing orange ring while still alive — visual warning before going dead. Sidebar node-detail header uses the same uppercase/spaced register as the panel tab headers.

## Testing

```bash
cd server && npm test        # run tests once
cd server && npm run test:watch  # watch mode
```

Server unit tests (Vitest) cover the critical business logic:
- `FleetRegistry` — register, heartbeat, alerting/dead transitions, recovered events, event firing
- `telemetry` — recordStats throttle, recordEvent, getHistory window queries

Tests run automatically via pre-commit hook.

## Quickstart

```bash
cp .env.example .env   # minimum: PORT=5020, NODE_ENV=development
                       # add ANTHROPIC_API_KEY=sk-... for Online Lab (chaos agent)

pnpm install
pnpm dev
```

The header has a two-mode segmented toggle:

| Mode | Behavior |
|---|---|
| **Offline Demo** | Default. Mock fleet via host dev server (port 5020, Vite proxy). No containers needed. Switching to it calls `POST /api/chaos/stop`, clears registry, reconnects socket to Vite proxy. |
| **Online Lab** | Calls `POST /api/chaos/start` → `docker compose -f docker-compose.chaos.yml up --build -d`. All fleet servers are real containers — homebase publishes fleet socket on port **5025**, dashboard reconnects directly to `localhost:5025`. Station controllers connect to `homebase:5020` inside Docker; Toxiproxy can inject failures on `fleet-net`. Graph clears on switch; "Forging Network" overlay shows until agents register. |

The chaos API (`/api/chaos/start|stop`) always routes through the Vite proxy to the host dev server (port 5020) because that process has Docker CLI access. Fleet state (socket.io) switches servers on mode change without a page reload — the same exported socket reference is reused by all components.

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

Game kiosks (`containers/game-kiosk/`) run Chromium (headless, SwiftShader software WebGL) loading HexGL on port 8080: title screen → INSERT COIN attract cycle → pre-recorded replay. Info kiosks (`containers/info-kiosk/`) run Chromium loading a slideshow of simulator guide slides. Both kiosk containers are fully autonomous — they boot and run independently of the fleet monitor; if upstream connectivity is lost the game/slideshow continues. Docker stats reflect real Chromium CPU/memory from rendering the live application. The dashboard's Screen view is a separate iframe loading the same nginx page (operator viewport only); the kiosk has no knowledge of being observed. Mute/audio toggle on the Screen view controls the dashboard iframe, not the kiosk container.

Each kiosk agent independently simulates activity for the Logs tab: game kiosks log `SIGNIN / GAME_START / LAP_COMPLETE / GAME_OVER / SIGNOUT`; info kiosks log `VISITOR_ARRIVE / SLIDE_VIEW / QR_SCAN / VISITOR_DEPART`. Both also emit xAPI-format statements (`verb=launched`, `verb=progressed`, `verb=completed`, `verb=exited`, `verb=experienced`, `verb=interacted`) alongside each event — groundwork for routing xAPI and system telemetry up the chain. All output is streamed to the Logs tab via docker logs. Both use a two-stage Docker build: TypeScript compiles in stage 1, the runtime stage installs production `node_modules` separately so the fleet agent has `socket.io-client` available. Nginx serves kiosk HTML using the `index` directive (not a redirect) to avoid nginx leaking the internal container port (8080) in Location headers when accessed via host-mapped ports.

**Toxiproxy** sits between every station controller and homebase. Four proxies are pre-configured at startup (`config/toxiproxy.json`): `s1-upstream` through `s4-upstream` on ports 21001–21004. Station controllers connect through their proxy instead of directly to homebase. The control API on `:8474` lets the chaos agent add and remove toxics at runtime.

**Chaos agent** (`containers/chaos-agent/`) is a Claude Haiku-powered gremlin that runs as a container in the lab stack. It observes the live fleet via socket.io and queries Toxiproxy for the current active faults on each station proxy before every cycle, building a per-station situation report: controller status, kiosk alive/alerting/dead counts, active faults, and recent action history per station. Haiku sees four independent stories and advances each one separately.

Three fault categories:
- **Network** — latency, packet loss, bandwidth throttle via Toxiproxy (station→homebase link only)
- **Power** — container stop (hard failure, stays down) or restart with delay (self-recovering blip)
- **Code** — `hang_process`: SIGSTOP/SIGCONT via Docker exec; container stays alive and looks healthy but the agent freezes and stops heartbeating. Simulates GC pause, deadlock, blocking I/O. Universal — can target any container regardless of station.

The chaos agent does not target itself or homebase (homebase is the fleet socket server — stopping it disconnects the dashboard). It can target the Fireman container — the recovery system going dark while failures are unfolding is a valid story. Manual trigger (`⚡ Chaos` button) forces a real action by excluding the `observe` tool. Requires `ANTHROPIC_API_KEY` in the host environment.

**Fireman** — on-demand incident recovery agents spawned by a dispatcher in the homebase server. When the fleet registry marks a node dead, the dispatcher spawns a Fireman instance for that incident (preventing double-spawning). Each instance: pulls telemetry history and playbook patterns, classifies the fault (network / power / code / endemic), calls Sonnet (or Haiku for well-known patterns) with multi-turn tool use, executes recovery actions (reset network via Toxiproxy, restart container via Docker), and writes the outcome back to the shared playbook. Multiple incidents are handled concurrently — each gets its own instance. Escalations surface to the dashboard as persistent alerts. Authority is scoped: homebase can only fix what Docker and Toxiproxy can reach. Homebase itself makes no decisions — the Fireman does, and the user makes fleet-level calls via the dashboard.

**Playbook** — shared JSON store (`server/data/playbook.json`) of incident records (capped at 500) and extracted patterns. Universal read via `GET /api/playbook/patterns` and `GET /api/playbook/incidents`. Pattern confidence grows with each successful resolution. Firemen use it to select Haiku for high-confidence patterns and Sonnet for novel situations.

**Dashboard Fireman panel** — fixed overlay in the bottom-right corner. Shows active incidents, per-step actions with reasoning, resolutions, and escalations. Escalations are highlighted in red and persist until acknowledged. Hidden when no Fireman activity has occurred.

The server falls back to `buildMockFleet()` when no agents are connected (`USE_MOCK=true` forces mock always).
