import { Router } from "express";
import { planCustomerSchema, proposeQuerySchema, savePlanBodySchema } from "./plan.schema.js";
import { planService } from "./plan.service.js";

/** Gắn tại /plan */
export const planRouter = Router();

planRouter.get("/", async (req, res, next) => {
  try {
    const { customerId } = planCustomerSchema.parse(req.query);
    res.json(await planService.get(customerId));
  } catch (e) {
    next(e);
  }
});

/** Lưu kế hoạch (người dùng bấm Save plan trên thẻ). */
planRouter.put("/", async (req, res, next) => {
  try {
    const { customerId, plan } = savePlanBodySchema.parse(req.body);
    res.json(await planService.save(customerId, plan));
  } catch (e) {
    next(e);
  }
});

planRouter.get("/propose", async (req, res, next) => {
  try {
    res.json(await planService.propose(proposeQuerySchema.parse(req.query)));
  } catch (e) {
    next(e);
  }
});

planRouter.get("/progress", async (req, res, next) => {
  try {
    const { customerId } = planCustomerSchema.parse(req.query);
    const { card: _card, ...progress } = await planService.progress(customerId);
    res.json(progress);
  } catch (e) {
    next(e);
  }
});
