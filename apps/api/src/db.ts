import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DuckDBConnection, DuckDBInstance } from "@duckdb/node-api";

const here = dirname(fileURLToPath(import.meta.url));
export const DB_PATH = resolve(here, "../data/sbank.duckdb");

let connPromise: Promise<DuckDBConnection | null> | null = null;

async function connect(): Promise<DuckDBConnection | null> {
  if (!existsSync(DB_PATH)) {
    console.warn(`[db] WARNING: ${DB_PATH} not found. Run "npm run db:build" first. Queries will fail until then.`);
    return null;
  }
  const instance = await DuckDBInstance.create(DB_PATH, { access_mode: "READ_ONLY" });
  return instance.connect();
}

export async function query<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  connPromise ??= connect();
  const conn = await connPromise;
  if (!conn) {
    connPromise = null; // retry next time (db may have been built meanwhile)
    throw new Error("Database not available. Run `npm run db:build`.");
  }
  const reader = await conn.runAndReadAll(sql, params as never);
  return reader.getRowObjectsJson() as T[];
}
