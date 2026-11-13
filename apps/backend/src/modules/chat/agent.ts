import OpenAI from "openai";
import type { Chart, ChatResponse, SourceTx } from "@sbank/shared";
import { config } from "../../config.js";
import { HttpError } from "../../lib/errors.js";
import { SYSTEM_PROMPT } from "./prompt.js";
import { runTool, toolDefinitions } from "./tools.js";
import type { ChatRequestBody } from "./chat.schema.js";

const MAX_TURNS = 5;
const MAX_CARDS = 3;

const DEFAULT_SUGGESTIONS = ["What can I safely spend until payday?", "Show my spending by basket"];
const SUGGESTIONS: Record<string, string[]> = {
  query_spending: ["How does my spending compare to my 6-month average?", "What can I safely spend until payday?"],
  get_baskets: ["What if I cut discretionary spending by 20%?", "What can I safely spend until payday?"],
  safe_to_spend: ["Show my spending by basket", "What if I cut restaurants by 25%?"],
  simulate_whatif: ["What can I safely spend until payday?", "What is my spender profile?"],
  spender_profile: ["Show my spending by basket", "What can I safely spend until payday?"],
};

let client: OpenAI | null = null;
function getClient() {
  if (!config.llmApiKey) throw new HttpError(503, "LLM is not configured (set LLM_API_KEY)");
  client ??= new OpenAI({ baseURL: config.llmBaseUrl, apiKey: config.llmApiKey, timeout: 55_000, maxRetries: 1 });
  return client;
}

/** Gom thẻ số, biểu đồ và nguồn từ kết quả tool vào response; LLM chỉ viết câu trả lời. */
class Collector {
  cards: ChatResponse["cards"] = [];
  chart: Chart | null = null;
  sources: SourceTx[] = [];
  sourcesTotal = 0;
  lastTool: string | null = null;

  add(name: string, r: any) {
    if (!r || r.error) return;
    this.lastTool = name;
    const card = (label: string, value: number) => {
      if (this.cards.length < MAX_CARDS) this.cards.push({ type: "amount", label, value, currency: "EUR" });
    };
    if (name === "query_spending") {
      card(`Spent ${r.period.from} to ${r.period.to}`, r.total);
      this.sources = r.sources;
      this.sourcesTotal = r.sourcesTotal;
    } else if (name === "get_baskets") {
      this.chart = {
        type: "bar",
        title: `Spending by basket, ${r.month} (€)`,
        data: r.baskets.map((b: { name: string; spent: number }) => ({ label: b.name, value: b.spent })),
      };
    } else if (name === "safe_to_spend") {
      card("Safe to spend until payday", r.safeToSpend);
    } else if (name === "simulate_whatif") {
      card("Saving per year", r.yearlySaving);
    }
  }
}

/** Bỏ danh sách giao dịch khỏi dữ liệu gửi cho LLM (đã lưu riêng trong Collector) để tiết kiệm token. */
const forLlm = (r: any) => (r && Array.isArray(r.sources) ? { ...r, sources: undefined } : r);

export async function runAgent(req: ChatRequestBody): Promise<ChatResponse> {
  const llm = getClient();
  const collector = new Collector();
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...(req.history ?? []),
    { role: "user", content: req.message },
  ];

  let answer = "";
  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const resp = await llm.chat.completions.create({
      model: config.llmModel,
      messages,
      tools: toolDefinitions,
      // Lượt đầu bắt buộc gọi tool để model không tự bịa số; các lượt sau để model tự quyết
      tool_choice: turn === 0 ? "required" : "auto",
      max_tokens: 4096,
      reasoning_effort: "low",
    });
    const msg = resp.choices[0]?.message;
    if (!msg) break;

    const calls = (msg.tool_calls ?? []).filter((c) => c.type === "function");
    if (calls.length === 0) {
      answer = msg.content ?? "";
      break;
    }
    messages.push(msg);
    const results = await Promise.all(calls.map((c) => runTool(c.function.name, c.function.arguments, req.customerId)));
    calls.forEach((c, i) => {
      collector.add(c.function.name, results[i]);
      messages.push({ role: "tool", tool_call_id: c.id, content: JSON.stringify(forLlm(results[i])) });
    });
  }

  return {
    answer: answer || "Sorry, I could not work that out. Could you rephrase the question?",
    cards: collector.cards,
    chart: collector.chart,
    sources: collector.sources,
    sourcesTotal: collector.sourcesTotal,
    suggestions: SUGGESTIONS[collector.lastTool ?? ""] ?? DEFAULT_SUGGESTIONS,
  };
}
