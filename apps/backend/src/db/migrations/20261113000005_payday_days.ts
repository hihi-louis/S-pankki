import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("customer_stats", (t) => {
    // Các ngày trong tháng lương hay về (lặp lại >= 2 lần trong 6 lần gần nhất); nếu không có thì [ngày trung vị]
    t.specificType("payday_days", "smallint[]").notNullable().defaultTo("{}");
    t.boolean("payday_estimated").notNullable().defaultTo(false); // true = không có ngày nào lặp lại, chỉ là ước lượng
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("customer_stats", (t) => {
    t.dropColumn("payday_estimated");
    t.dropColumn("payday_days");
  });
}
