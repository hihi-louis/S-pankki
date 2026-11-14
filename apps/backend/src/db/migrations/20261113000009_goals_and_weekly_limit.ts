import type { Knex } from "knex";

// Plans become two simple things: goals (a customer can have several) and one weekly limit for everyday spending.
// The old one-row-per-customer `plans` table is read once to carry existing plans over, then left alone.
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("goals", (t) => {
    t.increments("id");
    t.text("customer_id").notNullable().references("customers.customer_id");
    t.text("name").notNullable();
    t.text("kind").notNullable().defaultTo("savings"); // home | savings
    t.decimal("target_amount", 12, 2);
    t.integer("months");
    t.decimal("monthly_amount", 12, 2).notNullable();
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.index(["customer_id"]);
  });
  await knex.schema.createTable("weekly_limits", (t) => {
    t.text("customer_id").primary().references("customers.customer_id");
    t.decimal("amount", 12, 2).notNullable();
    t.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });
  await knex.raw(`
    INSERT INTO goals (customer_id, name, kind, target_amount, months, monthly_amount, created_at)
    SELECT customer_id, goal_label, goal_type, goal_amount, months, monthly_saving, created_at FROM plans`);
  await knex.raw(`
    INSERT INTO weekly_limits (customer_id, amount)
    SELECT customer_id, ROUND(cap_everyday / 4.33) FROM plans`);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("weekly_limits");
  await knex.schema.dropTableIfExists("goals");
}
