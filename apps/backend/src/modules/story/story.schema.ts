import { z } from "zod";
import { customerIdSchema } from "../customers/customers.schema.js";

export const snapshotQuerySchema = z.object({ customerId: customerIdSchema });
export const categoryQuerySchema = z.object({ customerId: customerIdSchema, category: z.string().trim().min(1).max(40) });
export const storyParamsSchema = z.object({ id: z.string().trim().min(1).max(60) });
export const basketTxQuerySchema = z.object({ customerId: customerIdSchema, basket: z.coerce.number().int().min(1).max(3) });
