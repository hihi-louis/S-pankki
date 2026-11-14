# sbank-coach

AI money-coach web app (hackathon). React mobile-layout frontend + Node/Express backend with PostgreSQL.

## Ownership

| Folder | Owner | Notes |
|---|---|---|
| `apps/frontend` | Frontend dev | Vite + React + TS |
| `apps/backend` | Backend dev | Express + TS + PostgreSQL |
| `packages/shared` | Both (agree on changes) | `@sbank/shared` API types, no build step |
| `docs/` | Both | |

## Install

Requires Node 20+.

```bash
npm install
cp apps/backend/.env.example apps/backend/.env
cp apps/frontend/.env.example apps/frontend/.env
```

## Run

```bash
npm run dev        # backend (3001) + frontend (5173) together
npm run dev:backend    # backend only
npm run dev:frontend    # frontend only
npm run typecheck  # all workspaces
```

## What the backend offers

REST endpoints (all take `customerId`): `/summary`, `/insights`, `/spending`, `/explore/{breakdown,compare,recurring,income}`,
`/coach/{safe-to-spend,safe-to-save,what-if,profile}`, `/benchmark`, `/personas`, `/customers/:id/stats`,
and chat at `POST /chat` and `POST /chat/stream`. The chat model calls the same services as tools, so numbers
always come from code. Peer benchmarks use a snapshot of Statistics Finland's household budget survey
(`npm run data:statfin --workspace=backend` refreshes it). See `docs/api-contract.md`.

## Database (PostgreSQL)

Start a Postgres and create a database, e.g.:

```bash
docker run -d --name sbank-pg -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=sbank -p 5432:5432 postgres:16
```

Set `DATABASE_URL` in `apps/backend/.env` (see `.env.example`).

Download `tx_junction_transactions.csv` and `tx_customers_junction.csv` from
https://github.com/hackjunction/Junction-2026-S-pankki (transactions file is in Git LFS)
into `apps/backend/data/`, then:

```bash
cd apps/backend
npm run migrate     # create tables + indexes (Knex)
npm run db:import   # COPY CSVs, assign baskets, build aggregates (~1 min)
npm run db:codegen  # generate src/db/types.ts (Kysely)
```

Queries go through Kysely (`src/db/kysely.ts`); Knex is only used for migrations.
