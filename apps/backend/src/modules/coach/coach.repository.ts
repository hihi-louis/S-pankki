import { sql } from "kysely";
import { db } from "../../db/kysely.js";

export const coachRepository = {
  /** Tổng chi của một giỏ hoặc một danh mục trong [from, to), đọc từ bảng tổng hợp. */
  async spentInRange(
    customerId: string,
    target: { basket?: number; category?: string },
    from: string,
    to: string,
  ) {
    let q = db
      .selectFrom("monthly_spend")
      .select(sql<number>`COALESCE(SUM(spent), 0)`.as("spent"))
      .where("customer_id", "=", customerId)
      .where("month", ">=", from)
      .where("month", "<", to);
    if (target.basket) q = q.where("basket", "=", target.basket);
    if (target.category) q = q.where(sql`lower(category)`, "=", target.category.toLowerCase());
    return (await q.executeTakeFirstOrThrow()).spent;
  },

  /** Phần trăm khách có basket3_share thấp hơn `share` (0-100). */
  async basket3Percentile(share: number) {
    const r = await db
      .selectFrom("customer_stats")
      .select([
        sql<number>`COUNT(*) FILTER (WHERE basket3_share < ${share})::int`.as("below"),
        sql<number>`COUNT(basket3_share)::int`.as("total"),
      ])
      .executeTakeFirstOrThrow();
    return r.total === 0 ? 0 : (r.below / r.total) * 100;
  },
};
