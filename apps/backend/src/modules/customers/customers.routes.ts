import { Router } from "express";
import { customerParamsSchema } from "./customers.schema.js";
import { customersService } from "./customers.service.js";

/** Gắn tại gốc: GET /personas */
export const personasRouter = Router();
personasRouter.get("/", async (_req, res, next) => {
  try {
    res.json(await customersService.getPersonas());
  } catch (e) {
    next(e);
  }
});

/** Gắn tại /customers: GET /customers/:id/stats */
export const customersRouter = Router();
customersRouter.get("/:id", async (req, res, next) => {
  try {
    const { id } = customerParamsSchema.parse(req.params);
    res.json(await customersService.getProfile(id));
  } catch (e) {
    next(e);
  }
});

customersRouter.get("/:id/stats", async (req, res, next) => {
  try {
    const { id } = customerParamsSchema.parse(req.params);
    res.json(await customersService.getStats(id));
  } catch (e) {
    next(e);
  }
});
