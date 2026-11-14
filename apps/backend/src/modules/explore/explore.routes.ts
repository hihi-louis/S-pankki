import { Router } from "express";
import { breakdownQuerySchema, compareQuerySchema, exploreCustomerSchema } from "./explore.schema.js";
import { exploreService } from "./explore.service.js";

/** Gắn tại /explore */
export const exploreRouter = Router();

exploreRouter.get("/breakdown", async (req, res, next) => {
  try {
    res.json(await exploreService.breakdown(breakdownQuerySchema.parse(req.query)));
  } catch (e) {
    next(e);
  }
});

exploreRouter.get("/compare", async (req, res, next) => {
  try {
    res.json(await exploreService.compare(compareQuerySchema.parse(req.query)));
  } catch (e) {
    next(e);
  }
});

exploreRouter.get("/recurring", async (req, res, next) => {
  try {
    const { customerId } = exploreCustomerSchema.parse(req.query);
    res.json(await exploreService.recurring(customerId));
  } catch (e) {
    next(e);
  }
});

exploreRouter.get("/income", async (req, res, next) => {
  try {
    const { customerId } = exploreCustomerSchema.parse(req.query);
    res.json(await exploreService.incomeSummary(customerId));
  } catch (e) {
    next(e);
  }
});
