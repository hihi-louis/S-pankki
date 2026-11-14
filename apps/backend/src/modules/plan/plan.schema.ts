import { z } from "zod";
import { customerIdSchema } from "../customers/customers.schema.js";

/** Đề xuất kế hoạch: không có mục tiêu thì đưa kế hoạch khởi điểm (để dành 15% thu nhập). */
export const proposeQuerySchema = z.object({
  customerId: customerIdSchema,
  goalAmount: z.coerce.number().positive().max(10_000_000).optional(),
  months: z.coerce.number().int().min(1).max(360).optional(),
  goalType: z.enum(["home", "savings"]).default("savings"),
  goalLabel: z.string().trim().min(1).max(60).optional(),
});
export type ProposeQuery = z.infer<typeof proposeQuerySchema>;

/** Kế hoạch gửi lên khi người dùng bấm Save plan. */
export const planDraftSchema = z.object({
  goalType: z.enum(["home", "savings"]),
  goalLabel: z.string().trim().min(1).max(60),
  goalAmount: z.number().positive().max(10_000_000).nullable(),
  months: z.number().int().min(1).max(360).nullable(),
  monthlySaving: z.number().min(0).max(1_000_000),
  capEssentials: z.number().min(0).max(1_000_000),
  capUnexpected: z.number().min(0).max(1_000_000),
  capEveryday: z.number().min(0).max(1_000_000),
});
export const savePlanBodySchema = z.object({ customerId: customerIdSchema, plan: planDraftSchema });

/** Hạ trần một giỏ khi khách bấm "Apply to my plan". */
export const applyCapBodySchema = z.object({
  customerId: customerIdSchema,
  basket: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  reduceBy: z.number().positive().max(100_000),
});

export const planCustomerSchema = z.object({ customerId: customerIdSchema });
