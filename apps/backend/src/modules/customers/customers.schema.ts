import { z } from "zod";

export const customerIdSchema = z.string().regex(/^CUST\d{5}$/, "Expected CUSTxxxxx");
export const customerParamsSchema = z.object({ id: customerIdSchema });
