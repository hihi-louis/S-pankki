import { Router } from "express";
import { summaryQuerySchema } from "./baskets.schema.js";
import { basketsService } from "./baskets.service.js";

/** Gắn tại /summary */
export const basketsRouter = Router();

basketsRouter.get("/", async (req, res, next) => {
  try {
    const { customerId } = summaryQuerySchema.parse(req.query);
    res.json(await basketsService.getSummary(customerId));
  } catch (e) {
    next(e);
  }
});
