import type { Knex } from "knex";

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
    t.smallint("payday_dom"); // ngày trong tháng thường nhận lương
    t.decimal("avg_salary", 12, 2);
    t.decimal("basket3_share", 5, 4); // tỉ lệ chi tiêu giỏ 3
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("customer_stats");
  await knex.schema.dropTableIfExists("monthly_spend");
}
