import { z } from "zod";

export const summaryQuerySchema = z.object({
  customerId: z.string().regex(/^CUST\d{5}$/, "Expected CUSTxxxxx"),
});
export type SummaryQuery = z.infer<typeof summaryQuerySchema>;
