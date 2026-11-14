import type { ChatRequest, ChatResponse, CustomerProfile, InsightsResponse, Persona, SummaryResponse } from "@sbank/shared";

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

export interface ChatStreamHandlers {
  /** What the assistant is doing right now, e.g. "Comparing the periods…". */
  onStatus?: (text: string) => void;
  /** A piece of the answer as it is written. */
  onDelta?: (text: string) => void;
  /** Discard the text received so far. */
  onReset?: () => void;
}

type StreamEvent =
  | { type: "status"; text: string }
  | { type: "delta"; text: string }
  | { type: "reset" }
  | { type: "final"; response: ChatResponse }
  | { type: "error"; message: string };

/** Chat over Server-Sent Events: the answer appears word by word. Resolves with the full response. */
export async function chatStream(req: ChatRequest, handlers: ChatStreamHandlers = {}): Promise<ChatResponse> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), CHAT_TIMEOUT_MS);
  try {
    const res = await fetch(`${BASE}/chat/stream`, {
      method: "POST",
      signal: ctrl.signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req),
    });
    if (!res.ok || !res.body) throw new Error(await errorMessage(res));

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let final: ChatResponse | null = null;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      // Events are separated by a blank line
      let sep: number;
      while ((sep = buffer.indexOf("\n\n")) >= 0) {
        const line = buffer.slice(0, sep).trim();
        buffer = buffer.slice(sep + 2);
        if (!line.startsWith("data:")) continue;
        const event = JSON.parse(line.slice(5)) as StreamEvent;
        if (event.type === "status") handlers.onStatus?.(event.text);
        else if (event.type === "delta") handlers.onDelta?.(event.text);
        else if (event.type === "reset") handlers.onReset?.();
        else if (event.type === "final") final = event.response;
        else if (event.type === "error") throw new Error(event.message);
      }
    }
    if (!final) throw new Error("The connection closed before the answer was complete.");
    return final;
  } catch (err) {
    if ((err as Error).name === "AbortError") throw new Error("The server took too long to answer.");
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/** The "login": checks that the customer ID exists. Rejects with a readable message if not. */
export const getCustomer = (customerId: string) =>
  request<CustomerProfile>(`/customers/${encodeURIComponent(customerId)}`);
