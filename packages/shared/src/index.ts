// API contract shared by frontend and backend.
// Rules: amounts are in EUR, negative = money out. Dates are ISO "YYYY-MM-DD".
// The dataset ends 2026-09-30, so the backend treats that date as "today" (see SummaryResponse.asOf).
// Numbers in `cards` / `chart` must come from code (SQL/logic), never invented by the LLM.

export interface ChatRequest {
  customerId: string;
  message: string;
  history?: { role: "user" | "assistant"; content: string }[];
}

export interface SourceTx {
  date: string;
  amount: number;
  category: string;
  merchantId?: string | null;
  /** 4-digit MCC, e.g. "4121" = taxi. Null for transfers. */
  mcc?: string | null;
}

export interface Chart {
  type: "bar" | "line" | "donut";
  title: string;
  data: { label: string; value: number }[];
}

/** One big number. */
export interface AmountCard {
  type: "amount";
  label: string;
  value: number;
  currency: "EUR";
}

/** "What can I safely spend?" — money left after upcoming bills, per day until payday. */
export interface SafeToSpendCard {
  type: "safe_to_spend";
  perDay: number;
  total: number;
  /** Next payday, ISO date. */
  until: string;
  currency: "EUR";
}

/** "How much can I put aside right now?" — money not needed before payday, plus how many months of essentials the balance covers. */
export interface SafeToSaveCard {
  type: "safe_to_save";
  amount: number;
  /** Next payday, ISO date. */
  until: string;
  /** Balance divided by monthly essentials; null if unknown. */
  monthsCovered: number | null;
  currency: "EUR";
}

/** A spending plan the customer can save: monthly caps per basket plus a monthly saving target. */
export interface PlanDraft {
  goalType: "home" | "savings";
  goalLabel: string;
  goalAmount: number | null;
  /** Months to reach the goal, or null when no deadline was given. */
  months: number | null;
  monthlySaving: number;
  capEssentials: number;
  capUnexpected: number;
  capEveryday: number;
}

export interface SavedPlan extends PlanDraft {
  createdAt: string;
}

/** How this month is going against the saved plan. `plan` is null when the customer has none. */
export interface PlanProgressResponse {
  asOf: string;
  month: string;
  plan: SavedPlan | null;
  baskets: { id: 1 | 2 | 3; name: string; cap: number; spent: number; pct: number }[];
  saving: { target: number; actual: number; pct: number };
  /** Everyday-spending cap divided into weeks. */
  weeklyEverydayAllowance: number;
  status: "on_track" | "watch" | "over";
  message: string;
}

/**
 * A small table of ready-to-show facts (mortgage answers, plans). The backend formats the values, so every
 * number on the card comes from code. `tone` colours a row: good = positive, warn = needs attention.
 */
export interface FactsCard {
  type: "facts";
  title: string;
  headline?: { label: string; value: string };
  rows: { label: string; value: string; tone?: "good" | "warn" }[];
  note?: string;
  /** A button under the table. `save_plan` saves `draft` through PUT /plan (the model never writes to the database). */
  action?: { kind: "save_plan"; draft: PlanDraft };
}

/** What-if slider. Frontend recalculates savings locally as the user drags. */
export interface WhatIfCard {
  type: "what_if";
  category: string;
  monthlySpend: number;
  defaultCutPct: number;
  currency: "EUR";
}

/** You vs. peers (e.g. same age group, Statistics Finland). */
export interface BenchmarkCard {
  type: "benchmark";
  label: string;
  you: number;
  peers: number;
  peerGroup: string;
  /** Where the peer figure comes from, e.g. "Statistics Finland, 2022". */
  source?: string;
  currency: "EUR";
}

export type Card = AmountCard | SafeToSpendCard | SafeToSaveCard | FactsCard | WhatIfCard | BenchmarkCard;

export interface ChatResponse {
  answer: string;
  cards: Card[];
  chart: Chart | null;
  sources: SourceTx[];
  sourcesTotal?: number;
  suggestions: string[];
}

export interface Basket {
  /** 1 = Regular essentials, 2 = Unexpected necessities, 3 = Everyday spending (S-Bank's names). */
  id: 1 | 2 | 3;
  name: string;
  spent: number;
  avg6m: number;
  top: { category: string; spent: number }[];
}

export interface SummaryResponse {
  /** "YYYY-MM" */
  month: string;
  /** The "today" the numbers are calculated from (dataset end), ISO date. */
  asOf?: string;
  balance: number;
  /** `estimated` = the customer's pay days are irregular, so the date is a best guess. */
  nextPayday: { date: string; expected: number; estimated?: boolean };
  baskets: Basket[];
}

/** A proactive observation the app shows on the Overview, before the customer asks anything. */
export interface Insight {
  id: string;
  /** alert = needs attention, tip = something to consider, good = positive, info = neutral. */
  tone: "alert" | "tip" | "good" | "info";
  title: string;
  body: string;
  /** Question sent to the chat when the customer taps the insight. */
  ask: string;
}

export interface InsightsResponse {
  asOf: string;
  insights: Insight[];
}

/** Who is signed in. The dataset has no names, so the app shows the customer ID. */
export interface CustomerProfile {
  customerId: string;
  age: number | null;
  postalCode: string | null;
}

export interface Persona {
  customerId: string;
  name: string;
  age: number;
  description: string;
}
