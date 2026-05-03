# knightsrook-distributed-fleet-forge

Distributed Fleet Forge: A containerized chaos lab where sovereign-tier kiosk fleets learn to survive everything you throw at them — and the test bed is the production build.

## Stack

- **Frontend:** React + Vite (TypeScript), react-force-graph-2d, socket.io-client
- **Backend:** Express (TypeScript), socket.io
- **Database:** MySQL
- **Deploy:** Docker

## Dashboard

Click any node in the fleet graph to open a 2×2 panel layout:

| Quadrant | Panel | Content |
|---|---|---|
| Upper-left | Monitor | Animated htop-style CPU/MEM/NET + process list. SSH button (stub). |
| Upper-right | Fleet graph | Force-directed topology, shrinks to quadrant |
| Lower-left | Stats | Uptime, CPU, RAM, disk, network, ping, node ID |
| Lower-right | Screen | Role-aware: game kiosks show a game screen, info kiosks show a schedule, controllers/homebase show a terminal log |

Click background or the ✕ button to return to full-screen graph.

## Architecture

Three-tier cascade autonomy: homebase → station-controllers → kiosk swarms. Each node type carries a status (federation / island / swarm / dead) that reflects its connectivity tier. The fleet dashboard visualizes live node state as a force-directed graph.

### Node types

| Role | Tier | Description |
|---|---|---|
| `homebase` | 1 | `Home` — central control plane |
| `station-controller` | 2 | `S#` — per-station sovereign node |
| `game-kiosk` | 3 | `KG1–KG6` — game terminals (6 per station), swarm participants |
| `info-kiosk` | 3 | `KI1–KI3` — info displays (3 per station), swarm participants |

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

## Docker

```bash
docker compose up --build
```
