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
npm run dev:frontend    # frontend only (set VITE_USE_MOCK=true in apps/frontend/.env to work without the backend)
npm run typecheck  # all workspaces
```

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
npm run db:build   # (re)creates tables tx, customers, tx_b, monthly
```

The backend starts without a database and logs a warning. Use `$1, $2` placeholders in `query()`.
