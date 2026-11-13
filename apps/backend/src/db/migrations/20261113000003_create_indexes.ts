import type { Knex } from "knex";

// Mọi query đều lọc theo khách + khoảng ngày
export async function up(knex: Knex): Promise<void> {
  await knex.raw(`CREATE INDEX IF NOT EXISTS tx_customer_date_idx ON transactions (customer_id, tx_date)`);
  await knex.raw(`CREATE INDEX IF NOT EXISTS tx_customer_cat_date_idx ON transactions (customer_id, category, tx_date)`);
  await knex.raw(`CREATE INDEX IF NOT EXISTS tx_customer_mcc_date_idx ON transactions (customer_id, mcc_code, tx_date)`);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP INDEX IF EXISTS tx_customer_mcc_date_idx, tx_customer_cat_date_idx, tx_customer_date_idx`);
}
