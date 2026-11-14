import { sql } from "kysely";
import { db } from "../../db/kysely.js";
import { filtered } from "../spending/spending.repository.js";
import type { BreakdownQuery } from "./explore.schema.js";

export const exploreRepository = {
  /** Chi tiêu gom theo category | month | merchant | basket | weekday. */
  async breakdown(f: BreakdownQuery) {
    const key = {
      category: sql<string>`category`,
      basket: sql<string>`basket::text`,
      month: sql<string>`to_char(tx_date, 'YYYY-MM')`,
      merchant: sql<string>`COALESCE(merchant_id, 'no merchant')`,
      weekday: sql<string>`to_char(tx_date, 'FMDay')`,
    }[f.groupBy];
    let base = filtered(f);
    // Gom theo cửa hàng thì chỉ tính giao dịch có cửa hàng (tiền nhà, hóa đơn không có merchant)
    if (f.groupBy === "merchant") base = base.where("merchant_id", "is not", null);
    let q = base
      .select([
        key.as("key"),
        sql<number>`-SUM(amount)`.as("spent"),
        sql<number>`COUNT(*)::int`.as("count"),
        sql<number | null>`MIN(mcc_code)`.as("mcc"),
        sql<number>`MIN(EXTRACT(ISODOW FROM tx_date))::int`.as("dow"),
      ])
      .groupBy(key);
    q = f.groupBy === "month" ? q.orderBy("key") : f.groupBy === "weekday" ? q.orderBy("dow") : q.orderBy("spent", "desc");
    return q.limit(f.groupBy === "month" ? 36 : f.limit).execute();
  },

  /** Tổng chi và số giao dịch chỉ của các cửa hàng có merchant_id. */
  async shopsTotal(f: BreakdownQuery) {
    return filtered(f)
      .where("merchant_id", "is not", null)
      .select([sql<number>`-COALESCE(SUM(amount), 0)`.as("total"), sql<number>`COUNT(*)::int`.as("count")])
      .executeTakeFirstOrThrow();
  },

  /** Chi tiêu theo tháng của từng khoản (merchant, hoặc loại giao dịch với hóa đơn/tiền nhà) để tìm khoản định kỳ. */
  async monthlyByPayee(customerId: string, from: string, to: string) {
    const res = await sql<{
      payee: string;
      category: string;
      mcc: number | null;
      txType: string;
      month: string;
      amount: number;
      dom: number;
    }>`
      SELECT COALESCE(merchant_id, tx_type) AS payee, category, MIN(mcc_code) AS mcc, tx_type AS "txType",
             to_char(tx_date, 'YYYY-MM') AS month, -SUM(amount) AS amount,
             MIN(EXTRACT(DAY FROM tx_date))::int AS dom
      FROM transactions
      WHERE customer_id = ${customerId} AND basket > 0 AND tx_date >= ${from} AND tx_date < ${to}
        AND (merchant_id IS NOT NULL OR tx_type IN ('housing_payment', 'utilities_payment'))
      GROUP BY 1, 2, 4, 5`.execute(db);
    return res.rows;
  },

  /** Thu nhập và tiền đã chuyển vào đầu tư theo tháng. */
  async monthlyIncome(customerId: string, from: string, to: string) {
    return db
      .selectFrom("transactions")
      .select([
        sql<string>`to_char(tx_date, 'YYYY-MM')`.as("month"),
        sql<number>`COALESCE(SUM(amount) FILTER (WHERE tx_type = 'salary'), 0)`.as("salary"),
        sql<number>`COALESCE(SUM(amount) FILTER (WHERE tx_type = 'other_income'), 0)`.as("otherIncome"),
        sql<number>`-COALESCE(SUM(amount) FILTER (WHERE tx_type IN ('investment_deposit', 'investment_withdrawal')), 0)`.as("invested"),
      ])
      .where("customer_id", "=", customerId)
      .where("tx_date", ">=", from)
      .where("tx_date", "<", to)
      .groupBy(sql`1`)
      .orderBy(sql`1`)
      .execute();
  },
};

export const exploreExtras = {
  /** Các giao dịch chi lớn nhất của một danh mục trong khoảng [from, to). */
  async biggest(customerId: string, from: string, to: string, category: string, limit = 5) {
    return db
      .selectFrom("transactions")
      .select(["tx_date as date", "amount", "merchant_id as merchantId", sql<number | null>`mcc_code`.as("mcc")])
      .where("customer_id", "=", customerId)
      .where("tx_date", ">=", from)
      .where("tx_date", "<", to)
      .where("basket", ">", 0)
      .where(sql`lower(category)`, "=", category.toLowerCase())
      .orderBy("amount")
      .limit(limit)
      .execute();
  },

  /** Mỗi danh mục thuộc giỏ nào (giỏ chiếm nhiều chi tiêu nhất của khách trong khoảng thời gian). */
  async basketByCategory(customerId: string, from: string, to: string) {
    const rows = await db
      .selectFrom("monthly_spend")
      .select(["category", "basket", sql<number>`SUM(spent)`.as("spent")])
      .where("customer_id", "=", customerId)
      .where("month", ">=", from)
      .where("month", "<", to)
      .groupBy(["category", "basket"])
      .execute();
    const best = new Map<string, { basket: number; spent: number }>();
    for (const r of rows) {
      const cur = best.get(r.category);
      if (!cur || r.spent > cur.spent) best.set(r.category, { basket: r.basket, spent: r.spent });
    }
    return new Map([...best].map(([c, v]) => [c, v.basket as 1 | 2 | 3]));
  },
};
