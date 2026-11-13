import "dotenv/config";
import { createReadStream, existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { from as copyFrom } from "pg-copy-streams";

const dataDir = resolve(dirname(fileURLToPath(import.meta.url)), "../data");
const txCsv = resolve(dataDir, "tx_junction_transactions.csv");
const custCsv = resolve(dataDir, "tx_customers_junction.csv");

const missing = [txCsv, custCsv].filter((f) => !existsSync(f));
if (missing.length) {
  console.error(`Missing CSV file(s):\n${missing.map((m) => "  - " + m).join("\n")}\n
Download them from https://github.com/hackjunction/Junction-2026-S-pankki
(the transactions file is in Git LFS) into apps/backend/data/.`);
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set. Copy apps/backend/.env.example to apps/backend/.env and edit it.");
  process.exit(1);
}

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

/** Create `table` with every CSV column as TEXT, then COPY the file in (UTF-8 BOM stripped from header). */
async function loadCsv(table: string, file: string) {
  const text = await readFile(file, "utf8");
  const header = text.replace(/^﻿/, "").split(/\r?\n/, 1)[0];
  const cols = header.split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
  const colDefs = cols.map((c) => `"${c.replace(/"/g, '""')}" text`).join(", ");
  await client.query(`DROP TABLE IF EXISTS ${table} CASCADE`);
  await client.query(`CREATE TABLE ${table} (${colDefs})`);
  await pipeline(
    createReadStream(file),
    client.query(copyFrom(`COPY ${table} FROM STDIN WITH (FORMAT csv, HEADER true, ENCODING 'UTF8')`)),
  );
  return cols;
}

async function retype(table: string, cols: string[], types: Record<string, string>) {
  for (const [col, type] of Object.entries(types)) {
    if (!cols.includes(col)) continue;
    await client.query(`ALTER TABLE ${table} ALTER COLUMN ${col} TYPE ${type} USING NULLIF(${col}, '')::${type}`);
  }
}

await client.query("DROP TABLE IF EXISTS monthly");
await client.query("DROP TABLE IF EXISTS tx_b");

const txCols = await loadCsv("tx", txCsv);
await retype("tx", txCols, { tx_date: "date", tx_amount_eur: "numeric", mcc_code: "integer" });
await loadCsv("customers", custCsv);

await client.query(`CREATE TABLE tx_b AS
  SELECT *,
    CASE
      WHEN transaction_type IN ('salary','other_income','salary_sweep','investment_deposit','investment_withdrawal') THEN 0
      WHEN category IN ('Housing','Utilities','Groceries') THEN 1
      WHEN category = 'Transportation' AND mcc_code <> 4121 THEN 1
      WHEN category = 'Health' THEN 2
      WHEN category = 'Home & Tech' AND tx_amount_eur <= -200 THEN 2
      ELSE 3
    END AS basket
  FROM tx`);
await client.query(`CREATE TABLE monthly AS
  SELECT customer_id, date_trunc('month', tx_date)::date AS month, category, basket,
         round(-sum(tx_amount_eur), 2) AS spent, count(*)::int AS n
  FROM tx_b WHERE basket > 0
  GROUP BY customer_id, date_trunc('month', tx_date), category, basket`);

for (const t of ["tx", "customers", "tx_b", "monthly"]) {
  const r = await client.query(`SELECT count(*) AS n FROM ${t}`);
  console.log(`${t}: ${r.rows[0].n} rows`);
}
await client.end();
