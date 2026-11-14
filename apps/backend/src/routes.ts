import { Router } from "express";
import { config } from "./config.js";
import { adminRouter } from "./modules/admin/admin.routes.js";
import { basketsRouter } from "./modules/baskets/baskets.routes.js";
import { benchmarkRouter } from "./modules/benchmark/benchmark.routes.js";
import { chatRouter } from "./modules/chat/chat.routes.js";
import { coachRouter } from "./modules/coach/coach.routes.js";
import { loanContextRouter } from "./modules/context/context.routes.js";
import { customersRouter, personasRouter } from "./modules/customers/customers.routes.js";
import { exploreRouter } from "./modules/explore/explore.routes.js";
import { insightsRouter, recommendationsRouter } from "./modules/insights/insights.routes.js";
import { mortgageRouter } from "./modules/mortgage/mortgage.routes.js";
import { planRouter } from "./modules/plan/plan.routes.js";
import { storyRouter } from "./modules/story/story.routes.js";
import { spendingRouter } from "./modules/spending/spending.routes.js";

export const router = Router();

router.get("/health", (_req, res) => {
  // Safe to show: whether the assistant is configured (never the key itself), to spot a missing variable on a deployment
  res.json({
    ok: true,
    llm: { configured: Boolean(config.llmApiKey?.trim()), model: config.llmModel, host: new URL(config.llmBaseUrl).host },
  });
});

router.use("/spending", spendingRouter);
router.use("/personas", personasRouter);
router.use("/customers", customersRouter);
router.use("/summary", basketsRouter);
router.use("/coach", coachRouter);
router.use("/explore", exploreRouter);
router.use("/benchmark", benchmarkRouter);
router.use("/insights", insightsRouter);
router.use("/recommendations", recommendationsRouter);
router.use("/", storyRouter);
router.use("/mortgage", mortgageRouter);
router.use("/loan-context", loanContextRouter);
router.use("/plan", planRouter);
router.use("/chat", chatRouter);
router.use("/admin", adminRouter);
