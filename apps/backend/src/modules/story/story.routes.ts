import { Router } from "express";
import { insightsQuerySchema } from "../insights/insights.schema.js";
import { categoryQuerySchema, snapshotQuerySchema, storyParamsSchema } from "./story.schema.js";
import { storyService } from "./story.service.js";

/** Gắn tại gốc: /snapshot, /category, /insights/:id */
export const storyRouter = Router();

storyRouter.get("/snapshot", async (req, res, next) => {
  try {
    const { customerId } = snapshotQuerySchema.parse(req.query);
    res.json(await storyService.snapshot(customerId));
  } catch (e) {
    next(e);
  }
});

storyRouter.get("/category", async (req, res, next) => {
  try {
    const { customerId, category } = categoryQuerySchema.parse(req.query);
    res.json(await storyService.categoryDive(customerId, category));
  } catch (e) {
    next(e);
  }
});

storyRouter.get("/insights/:id", async (req, res, next) => {
  try {
    const { customerId } = insightsQuerySchema.parse(req.query);
    const { id } = storyParamsSchema.parse(req.params);
    res.json(await storyService.insightStory(customerId, id));
  } catch (e) {
    next(e);
  }
});
