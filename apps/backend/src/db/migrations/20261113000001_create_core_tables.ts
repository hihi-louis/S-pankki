import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("customers", (t) => {
    t.text("customer_id").primary();
    t.text("postal_code");
    t.smallint("age");
  });

  await knex.schema.createTable("transactions", (t) => {
    t.bigIncrements("id");
    t.text("customer_id").notNullable().references("customers.customer_id");
    t.text("account_id").notNullable();
    t.date("tx_date").notNullable();
    t.timestamp("tx_ts").notNullable();
    t.text("category").notNullable();
    t.decimal("amount", 12, 2).notNullable();
    t.decimal("balance_after", 12, 2).notNullable();
    t.text("tx_type").notNullable();
    t.text("merchant_id");
    t.integer("mcc_code");
    t.smallint("basket").notNullable(); // 0 = thu nhập/chuyển tiền, 1/2/3 = giỏ chi tiêu
  });

  // Bảng tạm cho COPY: toàn text, UNLOGGED = ghi nhanh, không ghi WAL
  await knex.raw(`
    CREATE UNLOGGED TABLE raw_transactions (
      customer_id text, bank_account_id text, tx_date text, tx_timestamp text,
      category text, tx_amount_eur text, balance_after_eur text,
      transaction_type text, merchant_id text, mcc_code text
    )`);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("raw_transactions");
  await knex.schema.dropTableIfExists("transactions");
  await knex.schema.dropTableIfExists("customers");
}
