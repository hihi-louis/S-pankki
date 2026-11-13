import { existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DuckDBInstance } from "@duckdb/node-api";

const dataDir = resolve(dirname(fileURLToPath(import.meta.url)), "../data");
const txCsv = resolve(dataDir, "tx_junction_transactions.csv");
const custCsv = resolve(dataDir, "tx_customers_junction.csv");
const dbPath = resolve(dataDir, "sbank.duckdb");

mkdirSync(dataDir, { recursive: true });
const missing = [txCsv, custCsv].filter((f) => !existsSync(f));
if (missing.length) {
  console.error(`Missing CSV file(s):\n${missing.map((m) => "  - " + m).join("\n")}\n
Download them from https://github.com/hackjunction/Junction-2026-S-pankki
(the transactions file is in Git LFS) into apps/api/data/.`);
  process.exit(1);
}

if (existsSync(dbPath)) rmSync(dbPath);
const instance = await DuckDBInstance.create(dbPath);
const conn = await instance.connect();
const esc = (p: string) => p.replace(/'/g, "''");

await conn.run(`CREATE TABLE tx AS SELECT * FROM read_csv_auto('${esc(txCsv)}')`);
await conn.run(`CREATE TABLE customers AS SELECT * FROM read_csv_auto('${esc(custCsv)}')`);
await conn.run(`CREATE TABLE tx_b AS
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
await conn.run(`CREATE TABLE monthly AS
  SELECT customer_id, date_trunc('month', tx_date) AS month, category, basket,
         round(-sum(tx_amount_eur),2) AS spent, count(*) AS n
  FROM tx_b WHERE basket > 0 GROUP BY ALL`);

for (const t of ["tx", "customers", "tx_b", "monthly"]) {
  const r = await conn.runAndReadAll(`SELECT count(*) AS n FROM ${t}`);
  console.log(`${t}: ${r.getRowObjectsJson()[0].n} rows`);
}
console.log(`Built ${dbPath}`);
