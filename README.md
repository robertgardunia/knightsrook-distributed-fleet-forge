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
| `xapi:statement` | agent/controller → homebase | xAPI statement relayed up the cascade; homebase queues or posts to LRS |
| `xapi:lrs:set` | client → server, server → all | `{ enabled: boolean }` — toggle LRS posting on/off; cascades down through homebase → station controllers → kiosks; triggers immediate flush at each tier when enabled |
| `xapi:lrs:status` | server → client | `{ enabled: boolean; queued: number }` — homebase LRS state + queue depth; sent on connect, on every toggle, and every 30s |
| `xapi:queue:size` | kiosk/controller → homebase | `{ nodeId, queued }` — per-node queue depth; emitted every 5s and on change; station controllers relay kiosk sizes upstream and report their own |
| `xapi:queues` | server → client | `Record<nodeId, queued>` — fleet-wide queue snapshot; broadcast whenever any node reports a size change |
| `kiosk:emulate:start` | client → homebase → controller → kiosk | Pause kiosk auto-sim and hand control to dashboard |
| `kiosk:emulate:stop` | client → homebase → controller → kiosk | Resume kiosk auto-sim |
| `kiosk:emulate:ready` | kiosk → controller → homebase → client | Kiosk confirms it paused and is ready for a scan |
| `kiosk:scan` | client → homebase → controller → kiosk | Scanned identity string; kiosk signs in that actor and begins an xAPI session |

## Telemetry API

Node history is held in-memory (no external database). Stats are sampled every 5s (capped at 720 entries per node, ~1 hour) and events (register / alerting / dead / recovered) are capped at 500 per node. Used by the recovery agent to distinguish degradation curves from instant failures and detect endemic instability.

| Endpoint | Description |
|---|---|
| `GET /api/fleet` | Current fleet graph as `{ nodes[], links[] }` — live registry only (no mock fallback). |
| `GET /api/chaos/ready` | Returns `{ ready: true }` once the lab homebase container is answering on `:5025`. The dashboard's `waitForLab()` polls this — but first waits for the probe to go DOWN (confirming `--force-recreate` killed old containers) before waiting for it to come back UP. This prevents connecting to stale containers. |
| `POST /api/chaos/trigger` | Fires one chaos cycle immediately — emits `chaos:trigger` to the chaos agent which runs `runChaosStep(forced=true)`. Forced cycles use `pickFreshStation()` to pre-select the station with fewest recent history entries (tiebreak: fewest active faults/alerts). Only that station's context is shown to Haiku, so each manual click always lands on a different, fresh target. The scheduled loop is unaffected and can escalate within a station normally. A step lock (`stepInFlight`) prevents concurrent execution. Client-side guard (`chaosGuard` ref) prevents duplicate fires before React re-renders the disabled state. |
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

The left sidebar is a live activity log — chaos actions (red), fireman spawns (blue), recoveries (green), and escalations (yellow) stream in with timestamps and agent labels. The right sidebar shows fleet status counts and, in Online Lab mode, the accumulated playbook of resolved incident patterns (success rate, count, avg duration). Both the Activity panel and the Playbook section are hidden in Offline Demo mode — they re-appear as soon as you switch to Online Lab.

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

**Auth path config** — `packages/xapi/src/authPaths.ts` defines which capture methods are available at each node role (`game-kiosk` and `info-kiosk` use `qr`; controllers and homebase have none). DFF does not handle authentication — identity is an opaque code captured at the kiosk and passed as-is to the xAPI pipeline. Future input methods (`card`, `pin`) go in the `AuthMethod` union and the relevant role entries.

**Take Control / Emulate User** — Screen tab on any kiosk node (Online Lab only) shows a "Control" button. Clicking it pauses the kiosk's auto-simulation and opens the "Get Started" UI: the operator can scan a QR code from a physical card using the host camera, or type a code manually. A "Skip — use demo id" button supplies a generated code for demo purposes when no real card is available. The kiosk agent receives the captured identity via `kiosk:scan`, starts a real xAPI session under that actor, and all subsequent events flow through the cascade pipeline. "Release" hands control back to the simulation. Relay chain: dashboard → homebase broadcast → station controller (filters by kiosk ID) → kiosk agent. xAPI statements are generated only when a code is active (not during auto-sim). In Offline Demo mode the pipeline is cosmetic — no LRS is connected and nothing is relayed.

**xAPI LRS toggle** — A compact toggle appears in the header whenever Online Lab is connected. Default is OFF. The `xapi:lrs:set` signal cascades through the entire fleet: homebase broadcasts it to station controllers, station controllers relay it down to kiosks. With the toggle OFF, every tier queues locally — kiosks hold statements in memory, station controllers accumulate a JSONL file, homebase accumulates its own JSONL file. Flip it ON and the cascade drains in order: kiosks flush to station controllers, station controllers flush to homebase, homebase flushes to Learning Locker. The badge in the header shows the homebase queue depth. Each tier also reports its own queue depth via `xapi:queue:size` every 5s.

**xAPI queue tab** — The ScreenPanel (lower-right quadrant) gains a third tab "xAPI" (alongside Logs and Shell). It shows the current node's queue depth, the homebase pipeline queue depth, and a fleet-wide snapshot of all nodes with outstanding queued statements. Works in both Online Lab (live data) and Offline Demo (static mock values) modes.

Links degrade visually with their target node: alerting → orange slow particles, dead → red crawling particles. Repeated incidents accumulate stress on a node's links: first repeat → amber particles (0.0008 speed), second repeat → orange-red particles (0.0004 speed), persisting even while the node is recovered — the graph shows which nodes have had a rough session. Stress clears on mode switch. Node animations on the force graph:
- **Red shockwave** — two rings expanding outward from the node when chaos agent targets it
- Animation store clears immediately on every mode switch (via `clearAll()` in the `labMode` effect), and also on `isMock` changes as a secondary safety net
- Screen view defaults to muted on every node selection; per-node mute toggle available in Online Lab kiosk screen
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

The homebase server installs `unhandledRejection` and `uncaughtException` handlers on startup so async failures surface in container logs rather than silently crashing the process.

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
| **Online Lab** | Calls `POST /api/chaos/start` → `docker compose -f docker-compose.chaos.yml up --build --force-recreate -d`. `--force-recreate` guarantees fresh containers every time — old ones are stopped and rebuilt even if a previous demo→lab→demo cycle left them running. All fleet servers are real containers — homebase publishes fleet socket on port **5025**, dashboard reconnects directly to `localhost:5025`. Station controllers connect to `homebase:5020` inside Docker; Toxiproxy can inject failures on `fleet-net`. Graph clears on switch; "Forging Network" overlay shows until agents register. Activity panel and Playbook appear. |

Three reset controls appear in the header while in Online Lab mode:

| Control | Server call | Effect |
|---|---|---|
| **⟳ Nodes** | `POST /api/reset/nodes` | `docker compose restart` — restarts all containers; socket reconnects once homebase is back up |
| **⟳ Playbook** | `POST /api/reset/playbook` | Wipes `server/data/playbook.json` and in-memory patterns/incidents |
| **⟳ Activity** | client-side | Clears the Activity panel log (no server state touched) |

Switching back to Offline Demo retains the playbook. Reset Playbook is the only action that blows it away.

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

Game kiosks (`containers/game-kiosk/`) run Chromium (headless, SwiftShader software WebGL) loading HexGL on port 8080: title screen → INSERT COIN attract cycle → pre-recorded replay. Info kiosks (`containers/info-kiosk/`) run Chromium loading a slideshow of simulator guide slides. Both kiosk containers are fully autonomous — they boot and run independently of the fleet monitor; if upstream connectivity is lost the game/slideshow continues. Docker stats reflect real Chromium CPU/memory from rendering the live application. The dashboard's Screen view is a separate operator viewport. In Online Lab mode, both game kiosks and info kiosks show a live iframe of their nginx-served page (game kiosks: `http://localhost:181xx`, info kiosks: `http://localhost:181x5x`). In Offline Demo mode, game kiosks show a static HexGL screenshot and info kiosks cycle through simulator slide images. Mute/audio toggle on the Screen view controls the dashboard iframe, not the kiosk container.

**Code capture service** — Every kiosk agent (`game-kiosk`, `info-kiosk`) imports `CodeCaptureService` from `@knightsrook/codes/catcher`. The service manages a single active-identity slot: `capture(code)` sets it and emits `user:identified`; `clear()` empties it and emits `user:cleared`. The kiosk agent drives `signIn` / `signOut` from those events. Input wiring is the container's responsibility — real hardware (card reader, HID scanner) calls `capture()` directly; the demo adapter wires `kiosk:scan` from the monitoring control flow. xAPI statements only fire when the slot is occupied (`codeCapture.current()` non-null); auto-sim activity is never recorded.

Each kiosk agent independently simulates activity for the Logs tab: game kiosks log `SIGNIN / GAME_START / LAP_COMPLETE / GAME_OVER / SIGNOUT`; info kiosks log `VISITOR_ARRIVE / SLIDE_VIEW / QR_SCAN / VISITOR_DEPART`. Both also emit xAPI-format statements (`verb=launched`, `verb=progressed`, `verb=completed`, `verb=exited`, `verb=experienced`, `verb=interacted`) alongside each event — groundwork for routing xAPI and system telemetry up the chain. All output is streamed to the Logs tab via docker logs. Both use a two-stage Docker build: TypeScript compiles in stage 1, the runtime stage installs production `node_modules` separately so the fleet agent has `socket.io-client` available. Nginx serves kiosk HTML using the `index` directive (not a redirect) to avoid nginx leaking the internal container port (8080) in Location headers when accessed via host-mapped ports.

**Toxiproxy** sits between every station controller and homebase. Four proxies are pre-configured at startup (`config/toxiproxy.json`): `s1-upstream` through `s4-upstream` on ports 21001–21004. Station controllers connect through their proxy instead of directly to homebase. The control API on `:8474` lets the chaos agent add and remove toxics at runtime.

**Chaos agent** (`containers/chaos-agent/`) is a Claude Haiku-powered gremlin that runs as a container in the lab stack. It observes the live fleet via socket.io and queries Toxiproxy for the current active faults on each station proxy before every cycle, building a per-station situation report: controller status, kiosk alive/alerting/dead counts, active faults, and recent action history per station. Haiku sees four independent stories and advances each one separately.

Three fault categories:
- **Network** — latency, packet loss, bandwidth throttle via Toxiproxy (station→homebase link only)
- **Power** — container stop (hard failure, stays down) or restart with delay (self-recovering blip)
- **Code** — `hang_process`: SIGSTOP/SIGCONT via Docker exec; container stays alive and looks healthy but the agent freezes and stops heartbeating. Simulates GC pause, deadlock, blocking I/O. Universal — can target any container regardless of station.

The chaos agent does not target itself or homebase (homebase is the fleet socket server — stopping it disconnects the dashboard). It can target the Fireman container — the recovery system going dark while failures are unfolding is a valid story. Manual trigger (`⚡ Chaos` button) forces a real action by excluding the `observe` tool. Requires `ANTHROPIC_API_KEY` in the host environment.

**Fireman** — on-demand incident recovery agents spawned by a dispatcher in the homebase server. When the fleet registry marks a node dead, the dispatcher spawns a Fireman instance for that incident (preventing double-spawning). Each instance: pulls telemetry history and playbook patterns, classifies the fault (network / power / code / endemic), then executes in three tiers: **(1) Playbook fast path** — if there is a high-confidence pattern for this exact fault signature (≥3 successes, ≥80% success rate), execute the known fix directly with no LLM call. **(2) Haiku** — novel situations with no confident playbook match. **(3) Sonnet** — only if a playbook action was already attempted and still failed (something unexpected is happening). Each LLM call uses multi-turn tool use to execute recovery actions (reset network via Toxiproxy, restart container via Docker). Outcomes are written back to the shared playbook. Multiple incidents are handled concurrently — each gets its own instance. Escalations surface to the dashboard as persistent alerts. Authority is scoped: homebase can only fix what Docker and Toxiproxy can reach.

Progressive escalation: each Fireman queries the last hour of closed incidents for its target node before building its prompt. If a node has failed ≥2 times in the past hour, the fault is immediately classified as `endemic` regardless of the telemetry window. The prompt includes prior incident history (fault type, outcome, actions taken, how long ago) and an urgency note that escalates from "First incident" → "⚠ SECOND incident — look for a pattern" → "🚨 N incidents — prior restarts have not held, escalate." Toast notifications on the dashboard reflect incident count: first incident is blue, second is amber, third+ is red, with an `· #N` suffix on the fault tag.

**xAPI pipeline** — xAPI logic lives in the `@knightsrook/xapi` workspace package (`packages/xapi/`). The package provides: `buildStatement` / `VERBS` / `ACTIVITY_BASE` / `toMbox` / `isTsnSeed` / `PLATFORM_MBOX` for building statements; `MemQueue` (in-memory, kiosks) and `FileQueue` (JSONL file-backed, station-controllers) for per-tier queueing; `createLrsClient` for homebase → Learning Locker posting; `validateStatement` to reject malformed statements at entry; and `AUTH_PATHS` / `getAuthConfig` for node-role auth config. Actor identity follows the TSN spec: `actor.mbox = mailto:{seed}@teamsteamnation.org`; `authority.mbox` is fixed to `PLATFORM_MBOX` (not the actor). `isTsnSeed(s)` validates a 16-char hex TSN seed. The package is browser-safe at its main export; Node.js-only code (`FileQueue`, `createLrsClient`) is behind sub-path exports (`@knightsrook/xapi/file-queue`, `@knightsrook/xapi/lrs-client`). Kiosk agents emit fully-formed xAPI statements (ADL verb IRIs, activity IRIs on `teamsteamnation.org`) via `xapi:statement` socket events. Statements flow up the cascade: kiosk → station controller → homebase → Learning Locker. Each tier queues locally if the next hop is unavailable and flushes on reconnect. Kiosk queue is in-memory; station-controller queue is JSONL on a named Docker volume (survives restarts); homebase queue is JSONL at `server/data/xapi-queue.jsonl` with a 30s retry. Dockerfiles build the package in a dedicated `xapi-build` stage and copy the compiled output into each container's `node_modules/@knightsrook/xapi`. See [Extracting `@knightsrook/xapi`](#extracting-knightsrookxapi) for how to part it out.

**Playbook** — shared JSON store (`server/data/playbook.json`) of incident records (capped at 500) and extracted patterns. Universal read via `GET /api/playbook/patterns` and `GET /api/playbook/incidents`. Pattern confidence grows with each successful resolution. Firemen check it first — a high-confidence match executes directly with no LLM call.

**Dashboard Fireman panel** — fixed overlay in the bottom-right corner. Shows active incidents, per-step actions with reasoning, resolutions, and escalations. Escalations are highlighted in red and persist until acknowledged. Hidden when no Fireman activity has occurred.

The server falls back to `buildMockFleet()` when no agents are connected (`USE_MOCK=true` forces mock always). The mock fleet has 5 stations with intentionally varied kiosk counts per station (Main Hall: 5 game + 2 info; East Pavilion: 4 game + 3 info; West Wing: 3 game + 1 info; North Atrium: 6 game + 1 info; South Concourse: 4 game + 2 info) — 35 nodes total, all at different venues.

## Extracting `@knightsrook/xapi`

The package has no imports from DDF and is ready to move to its own repo at any time. Steps:

**1. Copy the source**
```bash
cp -r packages/xapi /path/to/new-repo
cd /path/to/new-repo
git init && git add . && git commit -m "init: extract from knightsrook-distributed-fleet-forge"
```

**2. Build and publish**
```bash
# Build the compiled dist (required before publishing)
npm install
npm run build          # tsc → dist/

# Publish (adjust registry/scope as needed)
npm publish --access public
```

**3. Update consumers in DDF**

In `pnpm-workspace.yaml`, remove `packages/*` (or just the xapi entry). Then in each consumer's `package.json`, swap the workspace ref for the published version:

```diff
- "@knightsrook/xapi": "workspace:*"
+ "@knightsrook/xapi": "^0.1.0"
```

Run `pnpm install` to pull the published package.

**4. Update Dockerfiles**

Each container Dockerfile has an `xapi-build` stage that compiles the package from source. Replace it with a simple install:

```dockerfile
# Before (builds from source):
FROM node:20-alpine AS xapi-build
WORKDIR /repo/packages/xapi
COPY packages/xapi/package.json .
RUN npm install
COPY packages/xapi/tsconfig.json .
COPY packages/xapi/src/ ./src/
RUN npm run build

# After (install from registry):
# Remove the xapi-build stage entirely.
# In the agent-build stage, add @knightsrook/xapi to the container's
# package.json dependencies, then npm install picks it up automatically:
#   "dependencies": { "@knightsrook/xapi": "^0.1.0", ... }
# Remove the manual COPY --from=xapi-build lines and the inline
# echo '...' > node_modules/@knightsrook/xapi/package.json lines.
```

Also remove the `COPY packages/xapi/src/ /repo/packages/xapi/src/` lines (those exist only for tsconfig `paths` resolution during local type-checking — once the package is published, node_modules resolution handles it).

**5. Clean up tsconfig paths**

The container tsconfigs have `paths` entries pointing to `../../packages/xapi/src/*.ts` for local type resolution. Once the package is published and in `node_modules`, these are no longer needed:

```diff
-    "paths": {
-      "@knightsrook/xapi": ["../../packages/xapi/src/index.ts"],
-      "@knightsrook/xapi/*": ["../../packages/xapi/src/*.ts"]
-    }
```

## `@knightsrook/codes` (`packages/codes/`)

Code identity package — two entry points:

- **`@knightsrook/codes/catcher`** — `CodeCaptureService`: active-identity slot, `capture(code)` / `clear()`, emits `user:identified` / `user:cleared`. No adapter code — the container wires its own input sources. Runs in every kiosk agent.
- **`@knightsrook/codes/batcher`** — `CodeBatcher`: requests pending-account codes from Moodle (`requestCodes`), falls back to offline generation (`generateOfflineCode`: SHA-256 of `kioskId:timestamp:entropy`, first 16 hex chars — valid TSN seed format). Offline-generated codes are queued to a file-backed `OfflineQueue` and synced to Moodle when connectivity returns (`sync()`). Moodle creates pending accounts from those codes; if a user registers with the code, the account activates and links to their xAPI history.

Moodle API (`moodleClient.ts`) is stubbed — actual `wsfunction` names require a custom Moodle plugin (`local_knightsrook_*`). Extraction to its own repo mirrors `@knightsrook/xapi`.

## Planned: `@knightsrook/auth`

`AuthMethod`, `AuthPathConfig`, and `authPaths.ts` currently live in `@knightsrook/xapi` for convenience but are logically unrelated to xAPI tracking. When real input-method configuration is needed (card reader, PIN, etc.) these should move to a dedicated `packages/auth` workspace package (`@knightsrook/auth`).

What belongs there when the time comes:
- `AuthMethod` / `AuthPathConfig` / `NodeRole` types (from `packages/xapi/src/types.ts`)
- `AUTH_PATHS` / `getAuthConfig` (from `packages/xapi/src/authPaths.ts`)

Extraction steps mirror those for `@knightsrook/xapi` above. Until then, the types and config are re-exported from `@knightsrook/xapi` and the misplacement is annotated in source.
