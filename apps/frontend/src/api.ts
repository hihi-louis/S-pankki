import type { ChatRequest, ChatResponse, InsightsResponse, Persona, SummaryResponse } from "@sbank/shared";

const BASE = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

// Chat calls an LLM (several tool rounds), so it gets a longer timeout than plain reads.
const READ_TIMEOUT_MS = 10_000;
const CHAT_TIMEOUT_MS = 60_000;

async function request<T>(path: string, init?: RequestInit, timeoutMs = READ_TIMEOUT_MS): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${BASE}${path}`, {
      ...init,
      signal: ctrl.signal,
      headers: { "Content-Type": "application/json", ...init?.headers },
    });
    if (!res.ok) throw new Error(await errorMessage(res));
    return (await res.json()) as T;
  } catch (err) {
    if ((err as Error).name === "AbortError") throw new Error("The server took too long to answer.");
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/** Backend errors are `{ error: string }`; fall back to the status code. */
async function errorMessage(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string };
    if (body.error) return body.error;
  } catch {
    // not JSON
  }
  return `Request failed (${res.status})`;
}

export const getPersonas = () => request<Persona[]>("/personas");

export const chat = (req: ChatRequest) =>
  request<ChatResponse>("/chat", { method: "POST", body: JSON.stringify(req) }, CHAT_TIMEOUT_MS);

export const getSummary = (customerId: string) =>
  request<SummaryResponse>(`/summary?customerId=${encodeURIComponent(customerId)}`);

export const getInsights = (customerId: string) =>
  request<InsightsResponse>(`/insights?customerId=${encodeURIComponent(customerId)}`);
