import type { ChatRequest, ChatResponse, Persona, SummaryResponse } from "@sbank/shared";
import chatMock from "./mock/chat.json";
import summaryMock from "./mock/summary.json";

const BASE = import.meta.env.VITE_API_URL ?? "http://localhost:3001";
const USE_MOCK = import.meta.env.VITE_USE_MOCK === "true";
/** Fall back to mock data if the API fails or is slow, so the demo never breaks. */
const FALLBACK = import.meta.env.VITE_MOCK_FALLBACK !== "false";
const TIMEOUT_MS = 10_000;

// Mock data is real numbers for CUST05020 (age 21), Sep 2026.
const mockChats = chatMock as unknown as Record<string, ChatResponse>;

const mockPersonas: Persona[] = [
  { customerId: "CUST05020", name: "Aino", age: 21, description: "Student, balance often dips below zero before payday." },
  { customerId: "CUST05014", name: "Eetu", age: 23, description: "Spends a big share of salary eating out." },
  { customerId: "CUST04121", name: "Ella", age: 18, description: "First job, wants to start saving." },
];

function mockChat(message: string): ChatResponse {
  const m = message.toLowerCase();
  if (/safe|afford|this week|left/.test(m)) return mockChats.safe;
  if (/kind|spender|type of/.test(m)) return mockChats.spender;
  if (/save|cut|what if|reduce/.test(m)) return mockChats.save;
  return mockChats.where;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${BASE}${path}`, {
      ...init,
      signal: ctrl.signal,
      headers: { "Content-Type": "application/json", ...init?.headers },
    });
    if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

async function withFallback<T>(call: () => Promise<T>, mock: () => T): Promise<T> {
  if (USE_MOCK) return mock();
  try {
    return await call();
  } catch (err) {
    if (!FALLBACK) throw err;
    console.warn("[api] falling back to mock:", err);
    return mock();
  }
}

export const getPersonas = () => withFallback(() => request<Persona[]>("/personas"), () => mockPersonas);

export const chat = (req: ChatRequest) =>
  withFallback(
    () => request<ChatResponse>("/chat", { method: "POST", body: JSON.stringify(req) }),
    () => mockChat(req.message),
  );

export const getSummary = (customerId: string) =>
  withFallback(
    () => request<SummaryResponse>(`/summary?customerId=${encodeURIComponent(customerId)}`),
    () => summaryMock as SummaryResponse,
  );
