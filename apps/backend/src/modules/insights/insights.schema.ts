import { z } from "zod";
import { customerIdSchema } from "../customers/customers.schema.js";

export const insightsQuerySchema = z.object({ customerId: customerIdSchema });
