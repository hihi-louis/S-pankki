import { Router } from "express";
import { insightsQuerySchema } from "./insights.schema.js";
import { insightsService } from "./insights.service.js";

/** Gắn tại /insights */
export const insightsRouter = Router();

insightsRouter.get("/", async (req, res, next) => {
  try {
    const { customerId } = insightsQuerySchema.parse(req.query);
    res.json(await insightsService.forCustomer(customerId));
  } catch (e) {
    next(e);
  }
});
