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

## Sharing the app with teammates

The browser only talks to the Vite server (port 5173): `/api/*` is forwarded to the backend on 3001, so one port is enough.

- **Same network** (home Wi-Fi, a phone hotspot): open `http://<your-ip>:5173` (`ipconfig getifaddr en0`).
- **Campus Wi-Fi such as eduroam** blocks devices from reaching each other, so use a tunnel instead:
  `cloudflared tunnel --url http://localhost:5173` (`brew install cloudflared`), or without installing anything:
  `ssh -R 80:localhost:5173 nokey@localhost.run`. Share the https URL it prints.
- A tunnel makes the app public and the login has no password, and every chat uses LLM credits: share the link only
  with your team and stop the tunnel afterwards.

## Trust and cost

- **Numbers come from code.** The model only writes sentences around tool results. Before an answer is shown, every amount and
  percentage is checked against the data the tools returned (`chat/verifier.ts`); a wrong answer is rewritten once, then replaced by a
  safe sentence. Each answer carries `verified` and `provenance[]` ("How I calculated this").
- **Suggested questions cost nothing.** Chips and insight buttons are answered by `chat/fast.ts` straight from the services
  (0 LLM tokens, about 10-50 ms). Free-form questions use the LLM, with a per-minute rate limit and an optional daily token cap
  (`LLM_DAILY_TOKEN_CAP`); when the budget is used up the suggested questions still work.
- **Measure it.** Every question writes a row to `llm_usage` (tokens, cache hits, latency, verified); `GET /admin/usage` (localhost only) summarises it.
- `npm test --workspace=backend` runs the unit tests (verifier, agent paths with a fake LLM, fast paths, budget).
  `npm run eval --workspace=backend` asks 30 questions and checks each number against SQL or the REST API (backend must be running).

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
