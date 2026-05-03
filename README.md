# knightsrook-distributed-fleet-forge

Distributed Fleet Forge: A containerized chaos lab where sovereign-tier kiosk fleets learn to survive everything you throw at them — and the test bed is the production build.

## Stack

- **Frontend:** React + Vite (TypeScript), react-force-graph-2d, socket.io-client
- **Backend:** Express (TypeScript), socket.io
- **Database:** MySQL
- **Deploy:** Docker

## Architecture

Three-tier cascade autonomy: homebase → station-controllers → kiosk swarms. Each node type carries a status (federation / island / swarm / dead) that reflects its connectivity tier. The fleet dashboard visualizes live node state as a force-directed graph.

### Node types

| Role | Tier | Description |
|---|---|---|
| `homebase` | 1 | Central control plane |
| `station-controller` | 2 | Per-station sovereign node |
| `game-kiosk` | 3 | Game terminal, swarm participant |
| `info-kiosk` | 3 | Info display, swarm participant |

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
