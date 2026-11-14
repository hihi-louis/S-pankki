import { sql } from "kysely";
import { db } from "../../db/kysely.js";

export const benchmarkRepository = {
  /** Tổng chi theo danh mục trong [from, to), đọc từ bảng tổng hợp. */
  async spentByCategory(customerId: string, from: string, to: string) {
    const rows = await db
      .selectFrom("monthly_spend")
      .select(["category", sql<number>`SUM(spent)`.as("spent")])
      .where("customer_id", "=", customerId)
      .where("month", ">=", from)
      .where("month", "<", to)
      .groupBy("category")
      .execute();
    return new Map(rows.map((r) => [r.category, r.spent]));
  },
};
