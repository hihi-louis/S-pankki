# Deploying Sipi on Railway (one service + Postgres)

The backend also serves the built frontend and answers the API under `/api`, so the whole app is **one public service** plus a Postgres database.
No custom domain is needed: Railway gives the service a free `*.up.railway.app` address.

## 1. Postgres
1. New project, **Add Postgres**.
2. Copy the **public** connection URL of the Postgres service (Variables, `DATABASE_PUBLIC_URL`). It contains the password: do not paste it anywhere shared.
3. Load the data from your machine (about 90 MB; it creates the tables, the indexes and the migration history):
   ```
   pg_restore --no-owner --no-privileges -d "<DATABASE_PUBLIC_URL>" /Users/trietpham/Desktop/junction2026/sipi.dump
   ```
   A few warnings about unknown settings are harmless if the Postgres version is older than your `pg_dump`. Check afterwards:
   ```
   psql "<DATABASE_PUBLIC_URL>" -c "select count(*) from transactions"   # about 3,626,755
   ```
   To rebuild the dump later: `pg_dump -Fc --no-owner --no-privileges --exclude-table-data=llm_usage postgresql://sbank:sbank@localhost:5432/sbank -f sipi.dump`

## 2. The app service
1. **New service, GitHub repo** (Railway asks for access to the repository; a private repo works).
2. `railway.json` in the repo root sets the build (`npm ci && npm run build`) and the start (`npm run start`) commands and the health check (`/health`). Leave the root directory as `/`.
3. **Variables** (service settings):
   - `DATABASE_URL` = reference to the Postgres variable `${{Postgres.DATABASE_URL}}` (the private address)
   - `LLM_API_KEY` = your key (only here, never in git)
   - `LLM_BASE_URL` = `https://inference.verda.com/v1`
   - `LLM_MODEL` = `kimi-k3-1-pro`
   - `LLM_DAILY_TOKEN_CAP` = `300000`
   - `NODE_ENV` is not needed. Railway sets `PORT`.
4. **Settings, Networking, Generate Domain** to get the public address.
5. Open it and try CUST05020. `/admin/usage` answers 403 on the public address on purpose.

## 3. After a change
Push to the branch Railway watches; it rebuilds and restarts by itself. Schema changes: run `npm run migrate --workspace=backend` with `DATABASE_URL` pointing at the Railway database, or restore a fresh dump.

## Keep in mind
- The data stays frozen at 2026-09-30; "today" in the app is fixed.
- The token cap protects your LLM budget; suggested questions and every screen keep working after it is used up.
