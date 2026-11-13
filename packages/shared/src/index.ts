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
}

export interface Chart {
  type: "bar" | "line" | "donut";
  title: string;
  data: { label: string; value: number }[];
}

export interface ChatResponse {
  answer: string;
  cards: { type: "amount"; label: string; value: number; currency: "EUR" }[];
  chart: Chart | null;
  sources: SourceTx[];
  sourcesTotal?: number;
  suggestions: string[];
}

export interface Basket {
  id: 1 | 2 | 3;
  name: string;
  spent: number;
  avg6m: number;
  top: { category: string; spent: number }[];
}

export interface SummaryResponse {
  month: string;
  balance: number;
  nextPayday: { date: string; expected: number };
  baskets: Basket[];
}

export interface Persona {
  customerId: string;
  name: string;
  age: number;
  description: string;
}
