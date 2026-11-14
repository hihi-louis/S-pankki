import { sql } from "kysely";
import { db } from "../../db/kysely.js";

export const basketsRepository = {
  /** Tổng chi theo giỏ trong [from, to), đọc từ bảng tổng hợp. */
  async spentByBasket(customerId: string, from: string, to: string) {
    return db
      .selectFrom("monthly_spend")
      .select(["basket", sql<number>`SUM(spent)`.as("spent")])
      .where("customer_id", "=", customerId)
      .where("month", ">=", from)
      .where("month", "<", to)
      .groupBy("basket")
      .execute();
  },

  /** Chi theo (giỏ, danh mục) trong một tháng, nhiều nhất trước. */
  async categoriesInMonth(customerId: string, month: string) {
    return db
      .selectFrom("monthly_spend")
      .select(["basket", "category", sql<number>`SUM(spent)`.as("spent")])
      .where("customer_id", "=", customerId)
      .where("month", "=", month)
      .groupBy(["basket", "category"])
      .orderBy("spent", "desc")
      .execute();
  },
};
