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

export type Card = AmountCard | SafeToSpendCard | SafeToSaveCard | WhatIfCard | BenchmarkCard;

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

export interface Persona {
  customerId: string;
  name: string;
  age: number;
  description: string;
}
