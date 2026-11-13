import { db } from "../../db/kysely.js";

export const customersRepository = {
  async findWithStats(customerId: string) {
    return db
      .selectFrom("customers as c")
      .leftJoin("customer_stats as s", "s.customer_id", "c.customer_id")
      .select([
        "c.customer_id as customerId",
        "c.age",
        "c.postal_code as postalCode",
        "s.current_balance as balance",
        "s.last_tx_date as lastTxDate",
        "s.payday_dom as paydayDom",
        "s.avg_salary as avgSalary",
        "s.basket3_share as basket3Share",
      ])
      .where("c.customer_id", "=", customerId)
      .executeTakeFirst();
  },

  async findAges(customerIds: string[]) {
    return db
      .selectFrom("customers")
      .select(["customer_id as customerId", "age"])
      .where("customer_id", "in", customerIds)
      .execute();
  },
};
