import { z } from "zod";
import { customerIdSchema } from "../customers/customers.schema.js";

const price = z.coerce.number().min(20_000).max(5_000_000);

/** Giá nhà tùy chọn: có thì kiểm tra thêm tiền đặt cọc và chi phí cho căn nhà đó. */
export const affordabilityQuerySchema = z.object({ customerId: customerIdSchema, price: price.optional() });
export type AffordabilityQuery = z.infer<typeof affordabilityQuerySchema>;

export const savingsPlanQuerySchema = z.object({
  customerId: customerIdSchema,
  price,
  /** Cắt bao nhiêu % chi tiêu hằng ngày để xem sớm hơn bao nhiêu tháng. */
  cutPct: z.coerce.number().min(0).max(100).default(20),
});
export type SavingsPlanQuery = z.infer<typeof savingsPlanQuerySchema>;

export const mortgageCustomerSchema = z.object({ customerId: customerIdSchema });
