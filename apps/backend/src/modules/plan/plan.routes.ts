import { Router } from "express";
import { addGoalBodySchema, applyCapBodySchema, goalIdParamSchema, planCustomerSchema, proposeQuerySchema, savePlanBodySchema, updateGoalBodySchema, weeklyLimitBodySchema } from "./plan.schema.js";
import { planService } from "./plan.service.js";

/** Gắn tại /plan */
export const planRouter = Router();

/** The customer's plans: goals, the weekly limit and how it is going. */
planRouter.get("/", async (req, res, next) => {
  try {
    const { customerId } = planCustomerSchema.parse(req.query);
    res.json(await planService.overview(customerId));
  } catch (e) {
    next(e);
  }
});

/** "Add to my plans" on a coach plan (the customer presses the button). */
planRouter.put("/", async (req, res, next) => {
  try {
    const { customerId, plan } = savePlanBodySchema.parse(req.body);
    res.json(await planService.saveDraft(customerId, plan));
  } catch (e) {
    next(e);
  }
});

/** "Apply to my plan" on a suggestion. */
planRouter.post("/apply", async (req, res, next) => {
  try {
    const { customerId, basket, reduceBy } = applyCapBodySchema.parse(req.body);
    res.json(await planService.applyCap(customerId, basket, reduceBy));
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

planRouter.post("/goals", async (req, res, next) => {
  try {
    const { customerId, ...goal } = addGoalBodySchema.parse(req.body);
    await planService.addGoal(customerId, goal);
    res.status(201).json(await planService.overview(customerId));
  } catch (e) {
    next(e);
  }
});

planRouter.patch("/goals/:id", async (req, res, next) => {
  try {
    const { id } = goalIdParamSchema.parse(req.params);
    const { customerId, ...fields } = updateGoalBodySchema.parse(req.body);
    await planService.updateGoal(customerId, id, fields);
    res.json(await planService.overview(customerId));
  } catch (e) {
    next(e);
  }
});

planRouter.delete("/goals/:id", async (req, res, next) => {
  try {
    const { id } = goalIdParamSchema.parse(req.params);
    const { customerId } = planCustomerSchema.parse(req.query);
    await planService.removeGoal(customerId, id);
    res.json(await planService.overview(customerId));
  } catch (e) {
    next(e);
  }
});

planRouter.put("/weekly-limit", async (req, res, next) => {
  try {
    const { customerId, amount } = weeklyLimitBodySchema.parse(req.body);
    await planService.setWeeklyLimit(customerId, amount);
    res.json(await planService.overview(customerId));
  } catch (e) {
    next(e);
  }
});

planRouter.delete("/weekly-limit", async (req, res, next) => {
  try {
    const { customerId } = planCustomerSchema.parse(req.query);
    await planService.removeWeeklyLimit(customerId);
    res.json(await planService.overview(customerId));
  } catch (e) {
    next(e);
  }
});
