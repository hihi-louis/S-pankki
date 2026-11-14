import type { Knex } from "knex";

// Mỗi khách một kế hoạch đang dùng; lưu khi người dùng bấm "Save plan" (LLM không ghi trực tiếp).
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("plans", (t) => {
    t.text("customer_id").primary().references("customers.customer_id");
    t.text("goal_type").notNullable(); // home | savings
    t.text("goal_label").notNullable();
    t.decimal("goal_amount", 12, 2);
    t.integer("months");
    t.decimal("monthly_saving", 12, 2).notNullable();
    t.decimal("cap_essentials", 12, 2).notNullable();
    t.decimal("cap_unexpected", 12, 2).notNullable();
    t.decimal("cap_everyday", 12, 2).notNullable();
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("plans");
}
