import type { ChatRequest, ChatResponse, Persona, SummaryResponse } from "@sbank/shared";
import chatMock from "./mock/chat.json";
import summaryMock from "./mock/summary.json";

const BASE = import.meta.env.VITE_API_URL ?? "http://localhost:3001";
const USE_MOCK = import.meta.env.VITE_USE_MOCK === "true";

const mockPersonas: Persona[] = [
  { customerId: "demo-1", name: "Aino", age: 29, description: "Young professional, renting in Helsinki." },
  { customerId: "demo-2", name: "Mikko", age: 41, description: "Family of four with a mortgage." },
];

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
  return (await res.json()) as T;
}

export async function getPersonas(): Promise<Persona[]> {
  if (USE_MOCK) return mockPersonas;
  return request<Persona[]>("/personas");
}

export async function chat(req: ChatRequest): Promise<ChatResponse> {
  if (USE_MOCK) return chatMock as ChatResponse;
  return request<ChatResponse>("/chat", { method: "POST", body: JSON.stringify(req) });
}

export async function getSummary(customerId: string): Promise<SummaryResponse> {
  if (USE_MOCK) return summaryMock as SummaryResponse;
  return request<SummaryResponse>(`/summary?customerId=${encodeURIComponent(customerId)}`);
}
