# knightsrook-distributed-fleet-forge

Distributed Fleet Forge: A containerized chaos lab where sovereign-tier kiosk fleets learn to survive everything you throw at them — and the test bed is the production build.

## Stack

- **Frontend:** React + Vite (TypeScript)
- **Backend:** Express (TypeScript)
- **Database:** MySQL
- **Deploy:** Docker

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
