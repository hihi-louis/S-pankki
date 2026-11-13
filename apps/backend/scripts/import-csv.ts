import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { from as copyFrom } from "pg-copy-streams";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA = path.join(ROOT, "data");
const TX_CSV = path.join(DATA, "tx_junction_transactions.csv");
const CUST_CSV = path.join(DATA, "tx_customers_junction.csv");
const sql = (f: string) => fs.readFileSync(path.join(ROOT, "src/db/sql", f), "utf8");

const INDEXES = [
  "CREATE INDEX tx_customer_date_idx ON transactions (customer_id, tx_date)",
  "CREATE INDEX tx_customer_cat_date_idx ON transactions (customer_id, category, tx_date)",
  "CREATE INDEX tx_customer_mcc_date_idx ON transactions (customer_id, mcc_code, tx_date)",
];

async function copyFile(client: pg.PoolClient, target: string, file: string) {
  const stream = client.query(copyFrom(`COPY ${target} FROM STDIN WITH (FORMAT csv, HEADER true)`));
  await pipeline(fs.createReadStream(file), stream);
}

async function step(name: string, fn: () => Promise<unknown>) {
  const t = Date.now();
  await fn();
  console.log(`✓ ${name} (${((Date.now() - t) / 1000).toFixed(1)}s)`);
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set (see apps/backend/.env.example).");
  for (const f of [TX_CSV, CUST_CSV]) {
    if (!fs.existsSync(f)) throw new Error(`Missing ${f}. Download from the S-Pankki repo (Git LFS).`);
    // Pointer của Git LFS chỉ vài trăm byte
    if (fs.statSync(f).size < 1024 && fs.readFileSync(f, "utf8").startsWith("version https://git-lfs"))
      throw new Error(`${f} is a Git LFS pointer, not the real data. Use "Download raw file" on GitHub.`);
  }
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  try {
    await step("truncate", () =>
      client.query("TRUNCATE raw_transactions, transactions, customers, monthly_spend, customer_stats RESTART IDENTITY CASCADE"));
    await step("copy customers", () => copyFile(client, "customers (customer_id, postal_code, age)", CUST_CSV));
    await step("copy raw transactions", () => copyFile(client, "raw_transactions", TX_CSV));
    // Insert không có index nhanh hơn nhiều; tạo lại index sau
    await step("drop indexes", () =>
      client.query("DROP INDEX IF EXISTS tx_customer_date_idx, tx_customer_cat_date_idx, tx_customer_mcc_date_idx"));
    await step("transform", () => client.query(sql("transform.sql")));
    await step("create indexes", async () => { for (const i of INDEXES) await client.query(i); });
    await step("truncate raw", () => client.query("TRUNCATE raw_transactions"));
    await step("aggregates", () => client.query(sql("aggregates.sql")));
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
