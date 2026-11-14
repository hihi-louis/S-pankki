import { Router } from "express";
import { customerIdSchema } from "../customers/customers.schema.js";
import { loanStatus } from "./context.service.js";

/** Gắn tại /loan-context */
export const loanContextRouter = Router();
loanContextRouter.get("/", async (req, res, next) => {
  try {
    const customerId = customerIdSchema.parse(req.query.customerId);
    res.json(await loanStatus(customerId));
  } catch (e) {
    next(e);
  }
});
