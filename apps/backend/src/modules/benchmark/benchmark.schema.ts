import { z } from "zod";
import { customerIdSchema } from "../customers/customers.schema.js";

export const BENCHMARK_TOPICS = ["total", "groceries", "housing", "transport", "restaurants", "recreation", "health"] as const;

/** topic bỏ trống = so sánh tất cả các nhóm. Dùng chung cho route và LLM tool. */
export const benchmarkQuerySchema = z.object({
  customerId: customerIdSchema,
  topic: z.enum(BENCHMARK_TOPICS).optional(),
});
export type BenchmarkQuery = z.infer<typeof benchmarkQuerySchema>;
