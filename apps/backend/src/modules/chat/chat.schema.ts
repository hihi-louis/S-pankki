import { z } from "zod";

export const chatRequestSchema = z.object({
  customerId: z.string().regex(/^CUST\d{5}$/, "Expected CUSTxxxxx"),
  message: z.string().trim().min(1).max(500),
  history: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(4000) }))
    .max(100)
    .transform((h) => h.slice(-10)) // chỉ giữ 10 tin gần nhất
    .optional(),
});
export type ChatRequestBody = z.infer<typeof chatRequestSchema>;
