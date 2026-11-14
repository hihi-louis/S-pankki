import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  // Một dòng mỗi hồ sơ vay: liên kết với khách có giao dịch + kết quả cuối cùng
  await knex.schema.createTable("mortgage_applications", (t) => {
    t.text("mortgage_id").primary(); // C0004
    t.text("customer_id").notNullable().references("customers.customer_id");
    t.text("final_decision").notNullable(); // approved | rejected
    t.text("rejection_reason"); // insufficient_collateral | insufficient_income | insufficient_equity | existing_debt
    t.decimal("property_price", 12, 2);
    t.decimal("requested_loan", 12, 2);
    t.decimal("equity_amount", 12, 2);
    t.decimal("collateral_value", 12, 2);
    t.decimal("required_monthly_income", 12, 2);
    t.decimal("loan_to_value", 6, 4);
    t.index("customer_id");
  });

  // Dòng thời gian của hồ sơ: mỗi sự kiện một dòng
  await knex.schema.createTable("mortgage_events", (t) => {
    t.bigIncrements("id");
    t.text("mortgage_id").notNullable().references("mortgage_applications.mortgage_id");
    t.timestamp("ts").notNullable();
    t.text("event_type").notNullable();
    t.text("property_id");
    t.text("property_type");
    t.decimal("property_price_estimate", 12, 2);
    t.decimal("loan_amount", 12, 2);
    t.decimal("equity_amount", 12, 2);
    t.text("collateral_type");
    t.decimal("collateral_value", 12, 2);
    t.text("collateral_status");
    t.text("decision");
    t.text("rejection_reason");
    t.text("expense_type");
    t.decimal("expense_amount", 12, 2);
    t.text("note");
    t.index(["mortgage_id", "ts"]);
  });

  // Bảng tạm cho COPY (toàn text, theo đúng thứ tự cột của CSV)
  await knex.raw(`
    CREATE UNLOGGED TABLE raw_mortgage_link (
      mortgage_customer_id text, customer_id text, final_decision text, rejection_reason text,
      final_property_price_eur text, final_requested_loan_eur text, final_equity_amount_eur text,
      final_collateral_value_eur text, required_monthly_income_eur text, final_loan_to_value text
    )`);
  await knex.raw(`
    CREATE UNLOGGED TABLE raw_mortgage_events (
      mortgage_customer_id text, ts text, event_type text, property_id text, property_type text,
      property_price_estimate text, loan_amount text, equity_amount text, collateral_type text,
      collateral_value text, collateral_status text, decision text, rejection_reason text,
      expense_type text, expense_amount text, note text
    )`);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("raw_mortgage_events");
  await knex.schema.dropTableIfExists("raw_mortgage_link");
  await knex.schema.dropTableIfExists("mortgage_events");
  await knex.schema.dropTableIfExists("mortgage_applications");
}
