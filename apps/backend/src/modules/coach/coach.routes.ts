import { Router } from "express";
import { coachQuerySchema, whatIfQuerySchema } from "./coach.schema.js";
import { coachService } from "./coach.service.js";

/** Gắn tại /coach */
export const coachRouter = Router();

coachRouter.get("/safe-to-spend", async (req, res, next) => {
  try {
    const { customerId } = coachQuerySchema.parse(req.query);
    res.json(await coachService.safeToSpend(customerId));
  } catch (e) {
    next(e);
  }
});

coachRouter.get("/safe-to-save", async (req, res, next) => {
  try {
    const { customerId } = coachQuerySchema.parse(req.query);
    res.json(await coachService.safeToSave(customerId));
  } catch (e) {
    next(e);
  }
});

coachRouter.get("/forecast", async (req, res, next) => {
  try {
    const { customerId } = coachQuerySchema.parse(req.query);
    res.json(await coachService.forecast(customerId));
  } catch (e) {
    next(e);
  }
});

coachRouter.get("/what-if", async (req, res, next) => {
  try {
    res.json(await coachService.whatIf(whatIfQuerySchema.parse(req.query)));
  } catch (e) {
    next(e);
  }
});

coachRouter.get("/profile", async (req, res, next) => {
  try {
    const { customerId } = coachQuerySchema.parse(req.query);
    res.json(await coachService.spenderProfile(customerId));
  } catch (e) {
    next(e);
  }
});
