import { Router } from "express";
import { z } from "zod";
import { basketsRouter } from "./modules/baskets/baskets.routes.js";
import { coachRouter } from "./modules/coach/coach.routes.js";
import { customersRouter, personasRouter } from "./modules/customers/customers.routes.js";
import { spendingRouter } from "./modules/spending/spending.routes.js";
import type { ChatResponse } from "@sbank/shared";

export const router = Router();

const chatSchema = z.object({
  customerId: z.string().min(1),
  message: z.string().min(1),
  history: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string() })).optional(),
});

router.use("/spending", spendingRouter);
router.use("/personas", personasRouter);
router.use("/customers", customersRouter);
router.use("/summary", basketsRouter);
router.use("/coach", coachRouter);

router.get("/health", (_req, res) => {
  res.json({ ok: true });
});

router.post("/chat", (req, res) => {
  const parsed = chatSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const { message } = parsed.data;
  const body: ChatResponse = {
    answer: `Mock answer. You said: "${message}"`,
    cards: [{ type: "amount", label: "Mock amount", value: 123.45, currency: "EUR" }],
    chart: null,
    sources: [],
    sourcesTotal: 0,
    suggestions: ["What can I safely spend this week?", "Show my recurring payments"],
  };
  res.json(body);
});
