import { Router } from "express";
import { z } from "zod";
import { spendingRouter } from "./modules/spending/spending.routes.js";
import type { ChatResponse, Persona, SummaryResponse } from "@sbank/shared";

export const router = Router();

const personas: Persona[] = [
  { customerId: "demo-1", name: "Aino", age: 29, description: "Young professional, renting in Helsinki." },
  { customerId: "demo-2", name: "Mikko", age: 41, description: "Family of four with a mortgage." },
];

const chatSchema = z.object({
  customerId: z.string().min(1),
  message: z.string().min(1),
  history: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string() })).optional(),
});

router.use("/spending", spendingRouter);

router.get("/health", (_req, res) => {
  res.json({ ok: true });
});

router.get("/personas", (_req, res) => {
  const body: Persona[] = personas;
  res.json(body);
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

const summaryQuery = z.object({ customerId: z.string().min(1) });

router.get("/summary", (req, res) => {
  const parsed = summaryQuery.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const body: SummaryResponse = {
    month: "2026-11",
    balance: 2310.55,
    nextPayday: { date: "2026-11-28", expected: 3120 },
    baskets: [
      { id: 1, name: "Essentials", spent: 1480.2, avg6m: 1522.4, top: [{ category: "Housing", spent: 920 }] },
      { id: 2, name: "Important", spent: 210, avg6m: 185.5, top: [{ category: "Health", spent: 130 }] },
      { id: 3, name: "Discretionary", spent: 365.4, avg6m: 410, top: [{ category: "Dining", spent: 140.2 }] },
    ],
  };
  res.json(body);
});
