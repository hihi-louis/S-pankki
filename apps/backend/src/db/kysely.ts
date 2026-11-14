import "dotenv/config";
import { Kysely, PostgresDialect } from "kysely";
import pg from "pg";
import type { DB } from "./types.js";

// NUMERIC mặc định trả về string -> đổi sang number (đủ chính xác cho số tiền EUR)
pg.types.setTypeParser(pg.types.builtins.NUMERIC, (v) => parseFloat(v));
// DATE giữ nguyên 'YYYY-MM-DD', không chuyển sang Date
pg.types.setTypeParser(pg.types.builtins.DATE, (v) => v);

export const db = new Kysely<DB>({
  dialect: new PostgresDialect({
    pool: new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 10 }),
  }),
});
