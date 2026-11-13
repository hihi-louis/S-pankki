# Backend Plan v2 – Postgres, Knex, Kysely

Nov 13, 2026 · @Louis

## Quyết định chính

Dùng PostgreSQL; Knex chỉ lo migration, Kysely lo mọi câu query; file CSV nặng được nạp bằng `COPY` của Postgres chứ không insert từng dòng; mọi con số hay dùng được tính sẵn vào bảng tổng hợp.

| Quyết định | Lý do |
| --- | --- |
| **PostgreSQL** thay DuckDB | Knex và Kysely không hỗ trợ DuckDB; Postgres chạy tốt trên Railway, bạn đã quen từ PIVOT |
| **Knex chỉ cho migration** | Schema có phiên bản, `migrate:latest` / `rollback` rõ ràng |
| **Kysely cho query** | Type-safe, type sinh tự động từ DB bằng `kysely-codegen`, không phải viết tay |
| **Import bằng `COPY ... FROM STDIN`** (stream) | 3,6 triệu dòng: insert qua ORM mất rất lâu và tốn RAM; COPY stream nhanh hơn nhiều lần và không đọc cả file vào RAM |
| **Bảng tổng hợp tính sẵn** (`monthly_spend`, `customer_stats`) | Câu hỏi của người dùng chạy trên vài trăm dòng thay vì quét 3,6 triệu dòng |
| **Kiến trúc theo module** (repository → service → route) | Thêm tính năng mới = thêm một module, không đụng code cũ; LLM tools gọi lại service, không viết logic hai lần |

## Kiến trúc

Có hai luồng tách biệt: import chạy một lần để đưa CSV vào Postgres và tính sẵn bảng tổng hợp; mỗi request của người dùng chỉ đi qua route → service → repository.

&#91;embedded content: kiến trúc backend · luồng request và luồng import\]

Chat không có logic riêng: LLM tools gọi lại đúng các service mà REST API dùng, nên một con số luôn giống nhau dù xem trên màn hình hay hỏi qua chat.

## Cấu trúc thư mục `apps/api`

Mỗi tính năng là một module trong `src/modules/`, gồm 3 lớp: repository (chỉ query), service (logic nghiệp vụ), routes (HTTP). LLM tools chỉ gọi service, nên API và chat dùng chung một logic.

```
apps/api/
├─ knexfile.ts
├─ .env                      # DATABASE_URL, LLM_API_KEY, PORT, CORS_ORIGIN
├─ data/                     # CSV gốc (KHÔNG commit)
├─ scripts/
│  └─ import-csv.ts          # COPY CSV -> Postgres, tính bảng tổng hợp
└─ src/
   ├─ server.ts              # tạo Express app, gắn routes
   ├─ config.ts              # đọc + validate env bằng zod
   ├─ db/
   │  ├─ migrations/         # Knex migrations (schema có phiên bản)
   │  ├─ sql/                # transform.sql, aggregates.sql
   │  ├─ types.ts            # SINH TỰ ĐỘNG bằng kysely-codegen, không sửa tay
   │  └─ kysely.ts           # instance `db` dùng chung
   ├─ lib/
   │  ├─ dates.ts            # TODAY = 2026-09-30, monthRange(), lastNMonths()
   │  └─ errors.ts           # HttpError + middleware xử lý lỗi
   ├─ modules/
   │  ├─ customers/          # personas, thông tin khách
   │  ├─ spending/           # tổng chi, giao dịch nguồn, theo tháng
   │  ├─ baskets/            # 3 giỏ, so với trung bình 6 tháng
   │  ├─ coach/              # safe-to-spend, what-if, spender profile
   │  └─ chat/               # vòng lặp LLM, tools, prompt
   │     └─ (mỗi module có: x.repository.ts, x.service.ts, x.routes.ts, x.schema.ts)
   └─ routes.ts              # gắn router của từng module
```

| Lớp | Được làm | Không được làm |
| --- | --- | --- |
| `*.repository.ts` | Query Kysely, trả về dữ liệu thô | Logic nghiệp vụ, biết về HTTP |
| `*.service.ts` | Logic (3 giỏ, safe-to-spend...), ghép nhiều repository | Biết về `req`/`res` |
| `*.routes.ts` | Validate input bằng zod, gọi service, trả JSON | Viết SQL |
| `*.schema.ts` | Zod schema cho input, dùng chung cho route và LLM tool | — |

## Bước 1–2: Postgres và migrations

Toàn bộ bước này đã chạy thử với Postgres 16, Node 22 và Knex 3: 3 migration chạy sạch.

**Bước 1 · Postgres local bằng Docker** — `docker-compose.yml` ở gốc repo:

```yaml
services:
  db:
    image: postgres:16
    environment:
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: sbank
    ports: ["5432:5432"]
    volumes: [pgdata:/var/lib/postgresql/data]
volumes:
  pgdata:
```

```bash
docker compose up -d
# apps/api/.env
DATABASE_URL=postgres://postgres:postgres@localhost:5432/sbank
```

**Bước 2 · Cài gói và cấu hình Knex**

```bash
cd apps/api
npm i knex pg pg-copy-streams kysely dotenv zod express cors
npm i -D tsx typescript kysely-codegen @types/pg @types/pg-copy-streams @types/node @types/express @types/cors
```

Script trong `package.json` (chạy Knex qua `tsx` để đọc được file `.ts` ở mọi phiên bản Node):

```json
"scripts": {
  "knex": "tsx ./node_modules/knex/bin/cli.js --knexfile knexfile.ts",
  "migrate": "npm run knex -- migrate:latest",
  "migrate:rollback": "npm run knex -- migrate:rollback",
  "migrate:make": "npm run knex -- migrate:make -x ts",
  "db:import": "tsx scripts/import-csv.ts",
  "db:codegen": "kysely-codegen --dialect postgres --out-file src/db/types.ts --exclude-pattern \"(knex_*|raw_*)\" --date-parser string --numeric-parser number",
  "db:setup": "npm run migrate && npm run db:import && npm run db:codegen",
  "dev": "tsx watch src/server.ts"
}
```

`knexfile.ts`:

```ts
import "dotenv/config";
import type { Knex } from "knex";

const config: Knex.Config = {
  client: "pg",
  connection: process.env.DATABASE_URL,
  migrations: { directory: "./src/db/migrations", extension: "ts" },
};
export default config;
```

**Migration 1 — bảng chính** (`npm run migrate:make create_core_tables`):

```ts
import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("customers", (t) => {
    t.text("customer_id").primary();
    t.text("postal_code");
    t.smallint("age");
  });

  await knex.schema.createTable("transactions", (t) => {
    t.bigIncrements("id");
    t.text("customer_id").notNullable().references("customers.customer_id");
    t.text("account_id").notNullable();
    t.date("tx_date").notNullable();
    t.timestamp("tx_ts").notNullable();
    t.text("category").notNullable();
    t.decimal("amount", 12, 2).notNullable();
    t.decimal("balance_after", 12, 2).notNullable();
    t.text("tx_type").notNullable();
    t.text("merchant_id");
    t.integer("mcc_code");
    t.smallint("basket").notNullable(); // 0 = thu nhập/chuyển tiền, 1/2/3 = giỏ chi tiêu
  });

  // Bảng tạm cho COPY: toàn text, UNLOGGED = ghi nhanh, không ghi WAL
  await knex.raw(`
    CREATE UNLOGGED TABLE raw_transactions (
      customer_id text, bank_account_id text, tx_date text, tx_timestamp text,
      category text, tx_amount_eur text, balance_after_eur text,
      transaction_type text, merchant_id text, mcc_code text
    )`);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("raw_transactions");
  await knex.schema.dropTableIfExists("transactions");
  await knex.schema.dropTableIfExists("customers");
}
```

**Migration 2 — bảng tổng hợp:**

```ts
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("monthly_spend", (t) => {
    t.text("customer_id").notNullable();
    t.date("month").notNullable();
    t.text("category").notNullable();
    t.smallint("basket").notNullable();
    t.decimal("spent", 12, 2).notNullable();
    t.integer("tx_count").notNullable();
    t.primary(["customer_id", "month", "category", "basket"]);
  });

  await knex.schema.createTable("customer_stats", (t) => {
    t.text("customer_id").primary();
    t.decimal("current_balance", 12, 2);
    t.date("last_tx_date");
    t.smallint("payday_dom");          // ngày trong tháng thường nhận lương
    t.decimal("avg_salary", 12, 2);
    t.decimal("basket3_share", 5, 4);  // tỉ lệ chi tiêu giỏ 3
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("customer_stats");
  await knex.schema.dropTableIfExists("monthly_spend");
}
```

**Migration 3 — index** (đúng với các câu hỏi sẽ chạy: luôn lọc theo khách + khoảng ngày):

```ts
export async function up(knex: Knex): Promise<void> {
  await knex.raw(`CREATE INDEX IF NOT EXISTS tx_customer_date_idx ON transactions (customer_id, tx_date)`);
  await knex.raw(`CREATE INDEX IF NOT EXISTS tx_customer_cat_date_idx ON transactions (customer_id, category, tx_date)`);
  await knex.raw(`CREATE INDEX IF NOT EXISTS tx_customer_mcc_date_idx ON transactions (customer_id, mcc_code, tx_date)`);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP INDEX IF EXISTS tx_customer_mcc_date_idx, tx_customer_cat_date_idx, tx_customer_date_idx`);
}
```

Chạy: `npm run migrate`. Muốn làm lại từ đầu: `npm run migrate:rollback -- --all && npm run migrate`.

## Bước 3: import CSV nặng

Toàn bộ 3.626.755 giao dịch vào Postgres trong **\~54 giây** (đo thật). Cách làm: stream file vào bảng tạm bằng `COPY`, rồi để Postgres tự chuyển đổi kiểu dữ liệu và gắn giỏ bằng một câu `INSERT ... SELECT`. Node không bao giờ đọc cả file 346 MB vào RAM.

| Bước | Thời gian đo được |
| --- | --- |
| `COPY` CSV → `raw_transactions` | 3,3 s |
| Chuyển đổi + gắn giỏ → `transactions` | 30,9 s |
| Tạo lại 3 index | 9,4 s |
| Tính `monthly_spend` (840.246 dòng) + `customer_stats` | 9,3 s |

**`src/db/sql/transform.sql`** — logic chuyển đổi và luật 3 giỏ nằm ở một chỗ duy nhất:

```sql
INSERT INTO transactions
  (customer_id, account_id, tx_date, tx_ts, category, amount, balance_after,
   tx_type, merchant_id, mcc_code, basket)
SELECT
  customer_id,
  bank_account_id,
  tx_date::date,
  to_timestamp(tx_timestamp, 'DDMONYY:HH24:MI:SS')::timestamp,  -- "03OCT24:09:04:04"
  category,
  tx_amount_eur::numeric,
  balance_after_eur::numeric,
  transaction_type,
  NULLIF(merchant_id, ''),
  NULLIF(mcc_code, '')::int,
  CASE
    WHEN transaction_type IN ('salary','other_income','salary_sweep',
                              'investment_deposit','investment_withdrawal') THEN 0
    WHEN category IN ('Housing','Utilities','Groceries') THEN 1
    WHEN category = 'Transportation' AND COALESCE(NULLIF(mcc_code,'')::int, 0) <> 4121 THEN 1
    WHEN category = 'Health' THEN 2
    WHEN category = 'Home & Tech' AND tx_amount_eur::numeric <= -200 THEN 2
    ELSE 3
  END
FROM raw_transactions;
```

**`src/db/sql/aggregates.sql`** — bảng tổng hợp cho câu hỏi nhanh:

```sql
TRUNCATE monthly_spend, customer_stats;

INSERT INTO monthly_spend (customer_id, month, category, basket, spent, tx_count)
SELECT customer_id, date_trunc('month', tx_date)::date, category, basket,
       -SUM(amount), COUNT(*)
FROM transactions
WHERE basket > 0
GROUP BY 1, 2, 3, 4;

INSERT INTO customer_stats
  (customer_id, current_balance, last_tx_date, payday_dom, avg_salary, basket3_share)
SELECT c.customer_id, last_tx.balance_after, last_tx.tx_date,
       sal.payday_dom, sal.avg_salary, share.b3
FROM customers c
LEFT JOIN LATERAL (
  SELECT balance_after, tx_date FROM transactions t
  WHERE t.customer_id = c.customer_id ORDER BY tx_ts DESC LIMIT 1
) last_tx ON true
LEFT JOIN LATERAL (
  SELECT mode() WITHIN GROUP (ORDER BY EXTRACT(DAY FROM tx_date))::smallint AS payday_dom,
         ROUND(AVG(amount), 2) AS avg_salary
  FROM (SELECT tx_date, amount FROM transactions t
        WHERE t.customer_id = c.customer_id AND tx_type = 'salary'
        ORDER BY tx_date DESC LIMIT 6) s
) sal ON true
LEFT JOIN LATERAL (
  SELECT ROUND(SUM(spent) FILTER (WHERE basket = 3) / NULLIF(SUM(spent), 0), 4) AS b3
  FROM monthly_spend m WHERE m.customer_id = c.customer_id
) share ON true;

ANALYZE transactions; ANALYZE monthly_spend; ANALYZE customer_stats;
```

**`scripts/import-csv.ts`**:

```ts
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import pg from "pg";
import { from as copyFrom } from "pg-copy-streams";

const DATA = path.resolve("data");
const TX_CSV = path.join(DATA, "tx_junction_transactions.csv");
const CUST_CSV = path.join(DATA, "tx_customers_junction.csv");
const sql = (f: string) => fs.readFileSync(path.resolve("src/db/sql", f), "utf8");

const INDEXES = [
  "CREATE INDEX tx_customer_date_idx ON transactions (customer_id, tx_date)",
  "CREATE INDEX tx_customer_cat_date_idx ON transactions (customer_id, category, tx_date)",
  "CREATE INDEX tx_customer_mcc_date_idx ON transactions (customer_id, mcc_code, tx_date)",
];

async function copyFile(client: pg.PoolClient, table: string, file: string) {
  const stream = client.query(copyFrom(`COPY ${table} FROM STDIN WITH (FORMAT csv, HEADER true)`));
  await pipeline(fs.createReadStream(file), stream);
}

async function step(name: string, fn: () => Promise<unknown>) {
  const t = Date.now();
  await fn();
  console.log(`✓ ${name} (${((Date.now() - t) / 1000).toFixed(1)}s)`);
}

async function main() {
  for (const f of [TX_CSV, CUST_CSV]) {
    if (!fs.existsSync(f)) throw new Error(`Missing ${f}. Download from the S-Pankki repo (Git LFS).`);
  }
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  try {
    await step("truncate", () => client.query(
      "TRUNCATE raw_transactions, transactions, customers, monthly_spend, customer_stats RESTART IDENTITY CASCADE"));
    await step("copy customers", () => copyFile(client, "customers (customer_id, postal_code, age)", CUST_CSV));
    await step("copy raw transactions", () => copyFile(client, "raw_transactions", TX_CSV));
    // Insert không có index nhanh hơn nhiều; tạo lại index sau
    await step("drop indexes", () => client.query(
      "DROP INDEX IF EXISTS tx_customer_date_idx, tx_customer_cat_date_idx, tx_customer_mcc_date_idx"));
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
```

Hai điểm cần biết:

- BOM ở đầu CSV không gây lỗi, vì `HEADER true` bỏ qua cả dòng tiêu đề.
- Script chạy lại bao nhiêu lần cũng được (truncate trước). Đổi luật giỏ trong `transform.sql` rồi chạy lại `npm run db:import` là xong.

## Bước 4: Kysely và type tự động

Sau mỗi lần migrate, chạy `npm run db:codegen`: `kysely-codegen` đọc schema thật trong Postgres và sinh `src/db/types.ts`. Không ai viết type bảng bằng tay, nên schema và code không bao giờ lệch nhau.

Hai cờ quan trọng (đã gặp lỗi type khi thiếu, thêm vào thì `tsc` sạch):

- `--date-parser string`: cột `date` là chuỗi `"2026-09-30"`, tránh lệch múi giờ.
- `--numeric-parser number`: cột tiền là `number`, không phải `string`.

Hai cờ này phải khớp với cách driver `pg` trả dữ liệu, cài ở `src/db/kysely.ts`:

```ts
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
```

Type sinh ra (rút gọn):

```ts
export interface MonthlySpend {
  basket: number;
  category: string;
  customer_id: string;
  month: string;
  spent: number;
  tx_count: number;
}
export interface DB {
  customer_stats: CustomerStats;
  customers: Customers;
  monthly_spend: MonthlySpend;
  transactions: Transactions;
}
```

`raw_transactions` và bảng của Knex bị loại khỏi type nhờ `--exclude-pattern`, nên code app không thể lỡ tay query vào bảng tạm.

## Bước 5: mẫu module (repository → service → route)

Module `spending` dưới đây đã chạy thật: `GET /spending?customerId=CUST04488&from=2026-08-01&to=2026-09-01&mcc=4121` trả về 589,33€ taxi, 15 chuyến, mỗi query \~5 ms. Các module khác (`baskets`, `coach`, `customers`) chép đúng khuôn này.

**`src/lib/dates.ts`** — "hôm nay" cố định theo dữ liệu:

```ts
export const TODAY = "2026-09-30";
const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Ngày đầu tháng, lệch `offset` tháng so với TODAY (0 = tháng này, -1 = tháng trước) */
export function monthStart(offset = 0): string {
  const d = new Date(`${TODAY.slice(0, 7)}-01T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + offset);
  return iso(d);
}
export function monthRange(offset: number) {
  return { from: monthStart(offset), to: monthStart(offset + 1) }; // [from, to)
}
```

**`spending.schema.ts`** — một schema dùng chung cho route và LLM tool:

```ts
import { z } from "zod";
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const spendingQuerySchema = z.object({
  customerId: z.string().regex(/^CUST\d{5}$/),
  from: isoDate,
  to: isoDate,
  category: z.string().optional(),
  basket: z.coerce.number().int().min(1).max(3).optional() as z.ZodType<1 | 2 | 3 | undefined>,
  mcc: z.coerce.number().int().optional(),
});
export type SpendingQuery = z.infer<typeof spendingQuerySchema>;
```

**`spending.repository.ts`** — chỉ query:

```ts
import { sql } from "kysely";
import { db } from "../../db/kysely.js";
import type { SpendingQuery } from "./spending.schema.js";

export const spendingRepository = {
  async total(f: SpendingQuery) {
    let q = db
      .selectFrom("transactions")
      .select([
        sql<number>`-COALESCE(SUM(amount), 0)`.as("total"),
        sql<number>`COUNT(*)::int`.as("count"),
      ])
      .where("customer_id", "=", f.customerId)
      .where("tx_date", ">=", f.from)
      .where("tx_date", "<", f.to)
      .where("basket", ">", 0);
    if (f.category) q = q.where("category", "=", f.category);
    if (f.basket) q = q.where("basket", "=", f.basket);
    if (f.mcc) q = q.where("mcc_code", "=", f.mcc);
    return q.executeTakeFirstOrThrow();
  },

  async sources(f: SpendingQuery, limit = 20) {
    let q = db
      .selectFrom("transactions")
      .select(["tx_date as date", "amount", "category", "merchant_id as merchantId"])
      .where("customer_id", "=", f.customerId)
      .where("tx_date", ">=", f.from)
      .where("tx_date", "<", f.to)
      .where("basket", ">", 0)
      .orderBy("tx_date", "desc")
      .limit(limit);
    if (f.category) q = q.where("category", "=", f.category);
    if (f.basket) q = q.where("basket", "=", f.basket);
    if (f.mcc) q = q.where("mcc_code", "=", f.mcc);
    return q.execute();
  },

  // Đọc từ bảng tổng hợp: vài chục dòng thay vì quét transactions
  async monthlyByBasket(customerId: string, fromMonth: string) {
    return db
      .selectFrom("monthly_spend")
      .select(["month", "basket", sql<number>`SUM(spent)`.as("spent")])
      .where("customer_id", "=", customerId)
      .where("month", ">=", fromMonth)
      .groupBy(["month", "basket"])
      .orderBy("month")
      .execute();
  },
};
```

**`spending.service.ts`** — logic, không biết gì về HTTP:

```ts
import { spendingRepository } from "./spending.repository.js";
import type { SpendingQuery } from "./spending.schema.js";

export const spendingService = {
  async getSpending(q: SpendingQuery) {
    const [summary, sources] = await Promise.all([
      spendingRepository.total(q),
      spendingRepository.sources(q, 20),
    ]);
    return {
      total: Math.round(summary.total * 100) / 100,
      count: summary.count,
      period: { from: q.from, to: q.to },
      sources,
      sourcesTotal: summary.count,
    };
  },
};
```

**`spending.routes.ts`** + gắn vào app:

```ts
// spending.routes.ts
import { Router } from "express";
import { spendingQuerySchema } from "./spending.schema.js";
import { spendingService } from "./spending.service.js";

export const spendingRouter = Router();
spendingRouter.get("/", async (req, res, next) => {
  try {
    const q = spendingQuerySchema.parse(req.query);
    res.json(await spendingService.getSpending(q));
  } catch (e) { next(e); }
});

// routes.ts
export const routes = Router();
routes.get("/health", (_req, res) => { res.json({ ok: true }); });
routes.use("/spending", spendingRouter);
```

**`src/lib/errors.ts`** — một chỗ xử lý lỗi cho cả app (input sai → 400 kèm chi tiết):

```ts
import type { ErrorRequestHandler } from "express";
import { ZodError } from "zod";

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof ZodError) return res.status(400).json({ error: "Invalid input", issues: err.issues });
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
  console.error(err);
  res.status(500).json({ error: "Internal error" });
};
```

**Thứ tự làm các module tiếp theo:**

1. `customers` — `GET /personas`, `GET /customers/:id/stats` (đọc `customer_stats`)
2. `baskets` — `GET /summary`: 3 giỏ tháng này so với trung bình 6 tháng (đọc `monthly_spend`)
3. `coach` — `safeToSpend`, `whatIf`, `spenderProfile` (ghép repository của `spending`, `baskets`, `customers`)
4. `chat` — vòng lặp LLM, tools gọi các service trên

## Bước 6–7: LLM tools và deploy

**Bước 6 · Tools gọi lại service, dùng lại zod schema.** Không viết JSON schema cho tool bằng tay: zod 4 sinh sẵn bằng `z.toJSONSchema` (đã thử). `customerId` bị `omit` khỏi input của tool; backend tự gắn từ request, nên LLM không thể đọc dữ liệu của khách khác.

```ts
// src/modules/chat/tools.ts
import { z } from "zod";
import { spendingQuerySchema } from "../spending/spending.schema.js";
import { spendingService } from "../spending/spending.service.js";

const spendingInput = spendingQuerySchema.omit({ customerId: true });

// Bỏ key "$schema" mà zod thêm vào, API của LLM chỉ cần phần object
const toolSchema = (s: z.ZodType) => {
  const { $schema, ...rest } = z.toJSONSchema(s, { io: "input" });
  return rest;
};

export const tools = [
  {
    name: "query_spending",
    description:
      "Total spending and source transactions for a date range [from, to). " +
      "Filter by category, basket (1 must-haves, 2 surprises, 3 little leaks) or MCC: " +
      "4121 taxi, 4111 public transport, 5814 cafes/fast food, 5813 bars, 5812 restaurants, 5541/5542 fuel.",
    schema: spendingInput,
    input_schema: toolSchema(spendingInput),
    run: (input: unknown, customerId: string) =>
      spendingService.getSpending({ ...spendingInput.parse(input), customerId }),
  },
  // get_baskets, safe_to_spend, simulate_whatif, spender_profile: cùng khuôn
];

export async function runTool(name: string, input: unknown, customerId: string) {
  const tool = tools.find((t) => t.name === name);
  if (!tool) return { error: `Unknown tool ${name}` };
  try { return await tool.run(input, customerId); }
  catch (e) { return { error: String(e) }; } // trả lỗi cho LLM tự sửa, không làm sập request
}
```

Vòng lặp LLM (`agent.ts`) giữ như bản trước: gọi model kèm `tools`, chạy `runTool` khi model yêu cầu, tối đa 5 lượt. Backend tự gom `sources` và `chart` từ kết quả tool vào response.

**Bước 7 · Deploy lên Railway**

1. Tạo project Railway, thêm service **PostgreSQL**, copy `DATABASE_URL`.
2. Chạy migrate và import **từ máy bạn** vào DB Railway (không import lúc deploy, vì CSV không nằm trong repo):

```bash
DATABASE_URL="<url Railway>" npm run migrate
DATABASE_URL="<url Railway>" npm run db:import   # ~1 phút local; qua mạng sẽ lâu hơn
```

3. Thêm service từ repo GitHub, root directory `apps/api`, start command `npm start` (`tsx src/server.ts`). Biến môi trường: `DATABASE_URL` (tham chiếu từ service Postgres), `LLM_API_KEY`, `CORS_ORIGIN=https://<app>.vercel.app`.
4. Kiểm tra `https://<api>.up.railway.app/health`.

Lưu ý dung lượng: sau import, DB local là **\~1 GB** (dữ liệu + 3 index). Kiểm tra giới hạn dung lượng của gói Railway trước. Nếu thiếu chỗ, bỏ index `tx_customer_mcc_date_idx` và chạy `VACUUM FULL` sau import.

## Hiệu năng và khả năng mở rộng

Với dữ liệu này, mỗi request chỉ đọc dữ liệu của **một** khách (\~700 giao dịch), nên index theo `customer_id` là đủ nhanh (đo được \~5 ms mỗi query). Phần chậm nhất sẽ là LLM (1–5 giây), không phải database.

| Nguyên tắc | Áp dụng |
| --- | --- |
| Mọi query lọc theo `customer_id` trước | Index bắt đầu bằng `customer_id`; repository luôn nhận `customerId` |
| Đọc từ bảng tổng hợp khi có thể | Biểu đồ, 3 giỏ, trung bình 6 tháng đọc `monthly_spend`; chỉ cần giao dịch nguồn mới đọc `transactions` |
| Luật nghiệp vụ ở một chỗ | Luật 3 giỏ chỉ nằm trong `transform.sql`; đổi luật thì chạy lại import |
| Không bao giờ trả về không giới hạn | `sources` tối đa 20 dòng kèm `sourcesTotal` |
| Pool kết nối cố định | `max: 10` trong `kysely.ts`; đủ cho demo |
| Cache câu trả lời LLM | Map trong bộ nhớ theo `customerId + message`; câu demo trả ngay lập tức |

**Nếu sau này dữ liệu lớn gấp nhiều lần** (không cần làm trong 48h, chỉ để nói khi pitch):

- Chia `transactions` theo tháng bằng partition của Postgres.
- Cập nhật `monthly_spend` dần dần khi có giao dịch mới, thay vì tính lại toàn bộ.
- Thêm Redis để cache, và read replica cho query đọc.

Kiến trúc module không phải đổi khi làm những việc trên, vì chỉ repository chạm vào database.

## Checklist từng bước

Làm theo thứ tự; mỗi dòng có cách kiểm tra để biết đã xong.

- [ ] **1. Postgres chạy:** `docker compose up -d`, rồi `psql $DATABASE_URL -c 'select 1'` trả về 1
- [ ] **2. Cài gói + Knex:** `npm run knex -- --version` chạy được
- [ ] **3. Migrations:** `npm run migrate` báo "Batch 1 run: 3 migrations"
- [ ] **4. Tải CSV** vào `apps/api/data/` (Git LFS); `head -c 100` ra dữ liệu thật, không phải dòng `version https://git-lfs...`
- [ ] **5. Import:** `npm run db:import` in ra 8 bước ✓; `SELECT count(*) FROM transactions` = 3.626.755
- [ ] **6. Sinh type:** `npm run db:codegen` tạo `src/db/types.ts`; `npx tsc --noEmit` sạch
- [ ] **7. Module spending:** `curl "localhost:3001/spending?customerId=CUST04488&from=2026-08-01&to=2026-09-01&mcc=4121"` trả `total: 589.33, count: 15`
- [ ] **8. Module customers:** `/personas`, `/customers/:id/stats`
- [ ] **9. Module baskets:** `/summary` trả 3 giỏ khớp với SQL viết tay
- [ ] **10. Module coach:** safe-to-spend, what-if, spender profile; tự tính tay 1 khách để đối chiếu
- [ ] **11. Module chat:** `query_spending` qua LLM trả đúng con số ở bước 7, rồi thêm dần các tool khác
- [ ] **12. Deploy:** migrate + import vào Postgres Railway, `/health` trả `{"ok":true}` qua URL công khai
- [ ] **13. Frontend gọi được** từ điện thoại thật (CORS đúng domain Vercel)

Mẹo: bước 1–6 làm được từ tối nay. Vào hackathon bạn bắt đầu luôn từ bước 7.
