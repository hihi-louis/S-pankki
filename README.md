# sbank-coach

AI money-coach web app (hackathon). React mobile-layout frontend + Node/Express backend with PostgreSQL.

## Ownership

| Folder | Owner | Notes |
|---|---|---|
| `apps/web` | Frontend dev | Vite + React + TS |
| `apps/api` | Backend dev | Express + TS + PostgreSQL |
| `packages/shared` | Both (agree on changes) | `@sbank/shared` API types, no build step |
| `docs/` | Both | |

## Install

Requires Node 20+.

```bash
npm install
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
```

## Run

```bash
npm run dev        # api (3001) + web (5173) together
npm run dev:api    # api only
npm run dev:web    # web only (set VITE_USE_MOCK=true in apps/web/.env to work without the api)
npm run typecheck  # all workspaces
```

## Database (PostgreSQL)

Start a Postgres and create a database, e.g.:

```bash
docker run -d --name sbank-pg -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=sbank -p 5432:5432 postgres:16
```

Set `DATABASE_URL` in `apps/api/.env` (see `.env.example`).

Download `tx_junction_transactions.csv` and `tx_customers_junction.csv` from
https://github.com/hackjunction/Junction-2026-S-pankki (transactions file is in Git LFS)
into `apps/api/data/`, then:

```bash
npm run db:build   # (re)creates tables tx, customers, tx_b, monthly
```

The API starts without a database and logs a warning. Use `$1, $2` placeholders in `query()`.
