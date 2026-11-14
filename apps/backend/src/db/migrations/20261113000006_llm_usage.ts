import type { Knex } from "knex";

// Một dòng mỗi câu hỏi chat: để đo token, độ trễ, tỉ lệ cache. Không lưu nội dung câu hỏi (riêng tư).
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("llm_usage", (t) => {
    t.bigIncrements("id");
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.text("customer_id").notNullable();
    t.text("path").notNullable(); // llm | cache | fast | error
    t.text("model");
    t.integer("prompt_tokens").notNullable().defaultTo(0);
    t.integer("completion_tokens").notNullable().defaultTo(0);
    t.integer("cached_tokens").notNullable().defaultTo(0);
    t.smallint("turns").notNullable().defaultTo(0);
    t.specificType("tools", "text[]").notNullable().defaultTo("{}");
    t.integer("latency_ms").notNullable();
    t.boolean("verified"); // null = chưa kiểm tra
    t.text("error");
    t.index("created_at");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("llm_usage");
}
