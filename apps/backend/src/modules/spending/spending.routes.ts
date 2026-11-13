import { Router } from "express";
import { spendingQuerySchema } from "./spending.schema.js";
import { spendingService } from "./spending.service.js";

export const spendingRouter = Router();

spendingRouter.get("/", async (req, res, next) => {
  try {
    const q = spendingQuerySchema.parse(req.query);
    res.json(await spendingService.getSpending(q));
  } catch (e) {
    next(e);
  }
});
