import "dotenv/config";
import pg from "pg";

// Return numeric/int8 as numbers and date as 'YYYY-MM-DD' strings instead of pg's defaults.
pg.types.setTypeParser(1700, (v) => parseFloat(v)); // numeric
pg.types.setTypeParser(20, (v) => parseInt(v, 10)); // int8 (count(*))
pg.types.setTypeParser(1082, (v) => v); // date

const url = process.env.DATABASE_URL;
if (!url) {
  console.warn(
    "[db] WARNING: DATABASE_URL is not set (see apps/api/.env.example). Queries will fail until it is set and `npm run db:build` has been run.",
  );
}

let pool: pg.Pool | null = null;

export async function query<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  if (!url) throw new Error("DATABASE_URL is not set.");
  pool ??= new pg.Pool({ connectionString: url });
  const res = await pool.query(sql, params);
  return res.rows as T[];
}
