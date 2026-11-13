import { z } from "zod";

const customerId = z.string().regex(/^CUST\d{5}$/, "Expected CUSTxxxxx");

export const coachQuerySchema = z.object({ customerId });
export type CoachQuery = z.infer<typeof coachQuerySchema>;

/** What-if: cắt một giỏ HOẶC một danh mục, theo % HOẶC theo số tiền €/tháng. Dùng chung cho route và LLM tool. */
export const whatIfQuerySchema = z
  .object({
    customerId,
    basket: z.coerce.number().int().min(1).max(3).optional() as z.ZodType<1 | 2 | 3 | undefined>,
    category: z.string().min(1).optional(),
    percent: z.coerce.number().gt(0).max(100).optional(),
    amountEur: z.coerce.number().gt(0).optional(),
  })
  .refine((v) => (v.basket !== undefined) !== (v.category !== undefined), {
    message: "Provide exactly one of: basket, category",
  })
  .refine((v) => (v.percent !== undefined) !== (v.amountEur !== undefined), {
    message: "Provide exactly one of: percent, amountEur",
  });
export type WhatIfQuery = z.infer<typeof whatIfQuerySchema>;
