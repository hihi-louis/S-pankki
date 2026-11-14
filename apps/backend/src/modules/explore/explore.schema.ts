import { z } from "zod";
import { customerIdSchema } from "../customers/customers.schema.js";
import { isoDate, spendingQuerySchema } from "../spending/spending.schema.js";

export const GROUP_BY = ["category", "month", "merchant", "basket", "weekday"] as const;

/** Chi tiêu gom theo một chiều tùy chọn; dùng chung cho route và LLM tool. */
export const breakdownQuerySchema = spendingQuerySchema.extend({
  groupBy: z.enum(GROUP_BY),
  limit: z.coerce.number().int().min(1).max(31).default(8),
});
export type BreakdownQuery = z.infer<typeof breakdownQuerySchema>;

/** So sánh khoảng B (mới) với khoảng A (nền); cùng bộ lọc như spending. */
export const compareQuerySchema = z.object({
  customerId: customerIdSchema,
  fromA: isoDate,
  toA: isoDate,
  fromB: isoDate,
  toB: isoDate,
  category: z.string().optional(),
  basket: spendingQuerySchema.shape.basket,
  mcc: spendingQuerySchema.shape.mcc,
});
export type CompareQuery = z.infer<typeof compareQuerySchema>;

export const exploreCustomerSchema = z.object({ customerId: customerIdSchema });
