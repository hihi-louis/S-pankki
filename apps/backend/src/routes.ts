import { Router } from "express";
import { basketsRouter } from "./modules/baskets/baskets.routes.js";
import { benchmarkRouter } from "./modules/benchmark/benchmark.routes.js";
import { chatRouter } from "./modules/chat/chat.routes.js";
import { coachRouter } from "./modules/coach/coach.routes.js";
import { customersRouter, personasRouter } from "./modules/customers/customers.routes.js";
import { exploreRouter } from "./modules/explore/explore.routes.js";
import { spendingRouter } from "./modules/spending/spending.routes.js";

export const router = Router();

router.get("/health", (_req, res) => {
  res.json({ ok: true });
});

router.use("/spending", spendingRouter);
router.use("/personas", personasRouter);
router.use("/customers", customersRouter);
router.use("/summary", basketsRouter);
router.use("/coach", coachRouter);
router.use("/explore", exploreRouter);
router.use("/benchmark", benchmarkRouter);
router.use("/chat", chatRouter);
