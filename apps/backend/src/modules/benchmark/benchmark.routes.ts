import { Router } from "express";
import { benchmarkQuerySchema } from "./benchmark.schema.js";
import { benchmarkService } from "./benchmark.service.js";

/** Gắn tại /benchmark */
export const benchmarkRouter = Router();

benchmarkRouter.get("/", async (req, res, next) => {
  try {
    res.json(await benchmarkService.compare(benchmarkQuerySchema.parse(req.query)));
  } catch (e) {
    next(e);
  }
});
