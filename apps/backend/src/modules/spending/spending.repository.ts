import { sql } from "kysely";
import { db } from "../../db/kysely.js";
import type { SpendingQuery } from "./spending.schema.js";

/** Điều kiện lọc chung cho total(), sources() và các truy vấn khám phá. */
export function filtered(f: SpendingQuery) {
  let q = db
    .selectFrom("transactions")
    .where("customer_id", "=", f.customerId)
    .where("tx_date", ">=", f.from)
    .where("tx_date", "<", f.to)
    .where("basket", ">", 0);
  if (f.category) q = q.where(sql`lower(category)`, "=", f.category.toLowerCase());
  if (f.basket) q = q.where("basket", "=", f.basket);
  if (f.mcc) q = q.where("mcc_code", "=", f.mcc);
  return q;
}

export const spendingRepository = {
  async total(f: SpendingQuery) {
    return filtered(f)
      .select([
        sql<number>`-COALESCE(SUM(amount), 0)`.as("total"),
        sql<number>`COUNT(*)::int`.as("count"),
      ])
      .executeTakeFirstOrThrow();
  },

  async sources(f: SpendingQuery, limit = 20) {
    return filtered(f)
      .select(["tx_date as date", "amount", "category", "merchant_id as merchantId", sql<string | null>`mcc_code::text`.as("mcc")])
      .orderBy("tx_date", "desc")
      .limit(limit)
      .execute();
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
