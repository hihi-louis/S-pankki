import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("llm_usage", (t) => {
    t.boolean("regenerated").notNullable().defaultTo(false); // câu trả lời đầu bị kiểm chứng loại và phải viết lại
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("llm_usage", (t) => t.dropColumn("regenerated"));
}
