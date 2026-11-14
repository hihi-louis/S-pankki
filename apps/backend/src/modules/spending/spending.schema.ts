import { z } from "zod";

export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");

/** Dùng chung cho route và LLM tool. */
export const spendingQuerySchema = z.object({
  customerId: z.string().regex(/^CUST\d{5}$/, "Expected CUSTxxxxx"),
  from: isoDate,
  to: isoDate,
  category: z.string().optional(),
  basket: z.coerce.number().int().min(1).max(3).optional() as z.ZodType<1 | 2 | 3 | undefined>,
  mcc: z.coerce.number().int().optional(),
});
export type SpendingQuery = z.infer<typeof spendingQuerySchema>;
