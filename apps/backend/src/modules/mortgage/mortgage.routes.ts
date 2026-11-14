import { Router } from "express";
import { affordabilityQuerySchema, mortgageCustomerSchema, savingsPlanQuerySchema } from "./mortgage.schema.js";
import { mortgageService } from "./mortgage.service.js";

/** Gắn tại /mortgage */
export const mortgageRouter = Router();

mortgageRouter.get("/affordability", async (req, res, next) => {
  try {
    res.json(await mortgageService.affordability(affordabilityQuerySchema.parse(req.query)));
  } catch (e) {
    next(e);
  }
});

mortgageRouter.get("/status", async (req, res, next) => {
  try {
    const { customerId } = mortgageCustomerSchema.parse(req.query);
    res.json(await mortgageService.status(customerId));
  } catch (e) {
    next(e);
  }
});

mortgageRouter.get("/savings-plan", async (req, res, next) => {
  try {
    res.json(await mortgageService.savingsPlan(savingsPlanQuerySchema.parse(req.query)));
  } catch (e) {
    next(e);
  }
});

mortgageRouter.get("/process", async (_req, res, next) => {
  try {
    res.json(await mortgageService.process());
  } catch (e) {
    next(e);
  }
});
