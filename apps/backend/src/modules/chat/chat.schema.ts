import { z } from "zod";

export const chatRequestSchema = z.object({
  customerId: z.string().regex(/^CUST\d{5}$/, "Expected CUSTxxxxx"),
  message: z.string().trim().min(1).max(500),
  history: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(2000) }))
    .max(10)
    .optional(),
});
export type ChatRequestBody = z.infer<typeof chatRequestSchema>;
