import OpenAI from "openai";
import type { Card, Chart, ChatResponse, SourceTx } from "@sbank/shared";
import { config } from "../../config.js";
import { mccLabel } from "../../lib/mcc.js";
import { periodLabel } from "../../lib/dates.js";
import { HttpError } from "../../lib/errors.js";
import { SYSTEM_PROMPT } from "./prompt.js";
import { runTool, toolDefinitions } from "./tools.js";
import type { ChatRequestBody } from "./chat.schema.js";

const MAX_TURNS = 5;
const MAX_CARDS = 3;

const DEFAULT_SUGGESTIONS = ["What can I safely spend until payday?", "Show my spending by basket"];
const SUGGESTIONS: Record<string, string[]> = {
  compare_with_peers: ["How could I save more?", "Where does my money go?"],
  spending_breakdown: ["How does that compare with last month?", "What are my regular monthly payments?"],
  compare_periods: ["Where does my money go?", "What if I cut everyday spending by 20%?"],
  recurring_payments: ["How much can I safely save right now?", "How steady is my income?"],
  income_summary: ["How much can I safely save right now?", "Where does my money go?"],
  safe_to_save: ["What can I safely spend until payday?", "What are my regular monthly payments?"],
  query_spending: ["How does my spending compare to my 6-month average?", "What can I safely spend until payday?"],
  get_baskets: ["What if I cut everyday spending by 20%?", "What can I safely spend until payday?"],
  safe_to_spend: ["Show my spending by basket", "What if I cut restaurants by 25%?"],
  simulate_whatif: ["What can I safely spend until payday?", "What is my spender profile?"],
  spender_profile: ["Show my spending by basket", "What can I safely spend until payday?"],
};

let client: OpenAI | null = null;
function getClient() {
  if (!config.llmApiKey) throw new HttpError(503, "LLM is not configured (set LLM_API_KEY)");
  client ??= new OpenAI({ baseURL: config.llmBaseUrl, apiKey: config.llmApiKey, timeout: 30_000, maxRetries: 0 });
  return client;
}

const BASKET_LABELS: Record<number, string> = { 1: "Regular essentials", 2: "Unexpected necessities", 3: "Everyday spending" };
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** Gom thẻ, biểu đồ và nguồn từ kết quả tool vào response (đúng hợp đồng docs/api-contract.md); LLM chỉ viết câu trả lời. */
class Collector {
  cards: Card[] = [];
  chart: Chart | null = null;
  sources: SourceTx[] = [];
  sourcesTotal = 0;
  lastTool: string | null = null;

  add(name: string, r: any, args: any = {}) {
    if (!r || r.error) return;
    this.lastTool = name;
    const push = (c: Card) => {
      const dup = this.cards.some((x) => x.type === c.type && "label" in x && "label" in c && x.label === c.label);
      if (!dup && this.cards.length < MAX_CARDS) this.cards.push(c);
    };
    if (name === "query_spending") {
      if (r.count === 0) return; // không có giao dịch: để LLM tự nói, không hiện card 0 €
      const what = args.category ?? mccLabel(args.mcc) ?? (args.basket ? BASKET_LABELS[args.basket] : null);
      push({ type: "amount", label: `${what ?? "Spent"} · ${periodLabel(r.period.from, r.period.to)}`, value: r.total, currency: "EUR" });
      this.sources = r.sources;
      this.sourcesTotal = r.sourcesTotal;
    } else if (name === "spending_breakdown") {
      const label = periodLabel(r.period.from, r.period.to);
      push({ type: "amount", label: `Total ${label}`, value: r.total, currency: "EUR" });
      const monthLike = r.groupBy === "month" || r.groupBy === "weekday" || r.groupBy === "merchant";
      const data = r.rows.map((x: { label: string; key: string; spent: number }) => ({
        label: r.groupBy === "month" ? MONTH_NAMES[Number(x.key.slice(5, 7)) - 1].slice(0, 3) : x.label,
        value: x.spent,
      }));
      if (!monthLike && r.otherSpent > 0) data.push({ label: "Other", value: r.otherSpent });
      if (data.length > 1) this.chart = { type: monthLike ? "bar" : "donut", title: `Spending by ${r.groupBy}, ${label}`, data };
    } else if (name === "compare_periods") {
      this.chart = {
        type: "bar",
        title: "Spending compared",
        data: [
          { label: periodLabel(r.periodA.from, r.periodA.to), value: r.periodA.total },
          { label: periodLabel(r.periodB.from, r.periodB.to), value: r.periodB.total },
        ],
      };
    } else if (name === "recurring_payments") {
      push({ type: "amount", label: "Recurring each month", value: r.monthlyTotal, currency: "EUR" });
      if (r.items.length > 1)
        this.chart = {
          type: "donut",
          title: "Regular monthly payments",
          data: r.items.slice(0, 6).map((i: { name: string; avgMonthly: number }) => ({ label: i.name, value: i.avgMonthly })),
        };
    } else if (name === "income_summary") {
      push({ type: "amount", label: "Average monthly income", value: r.avgMonthlyIncome, currency: "EUR" });
      this.chart = {
        type: "bar",
        title: "Income by month",
        data: r.months.map((m: { month: string; income: number }) => ({
          label: MONTH_NAMES[Number(m.month.slice(5, 7)) - 1].slice(0, 3),
          value: m.income,
        })),
      };
    } else if (name === "safe_to_save") {
      push({ type: "safe_to_save", amount: r.safeToSave, until: r.nextPayday.date, monthsCovered: r.monthsOfEssentialsCovered, currency: "EUR" });
    } else if (name === "compare_with_peers") {
      const rows: { key: string; label: string; you: number; peers: number }[] = r.rows;
      const chosen = args.topic
        ? rows
        : rows.filter((x) => x.key !== "total").sort((a, b) => Math.abs(b.you - b.peers) - Math.abs(a.you - a.peers));
      for (const x of chosen.slice(0, MAX_CARDS)) {
        push({ type: "benchmark", label: `${x.label} per month`, you: x.you, peers: x.peers, peerGroup: r.peerGroup, source: r.source, currency: "EUR" });
      }
    } else if (name === "get_baskets") {
      this.chart = {
        type: "donut",
        title: `${MONTH_NAMES[Number(r.month.slice(5, 7)) - 1]} by basket`,
        data: r.baskets.map((b: { name: string; spent: number }) => ({ label: b.name, value: b.spent })),
      };
    } else if (name === "safe_to_spend") {
      push({ type: "safe_to_spend", perDay: r.perDay, total: r.safeToSpend, until: r.nextPayday.date, currency: "EUR" });
    } else if (name === "simulate_whatif") {
      const pct = r.baselineMonthly > 0 ? Math.round(((r.monthlySaving / r.baselineMonthly) * 100) / 5) * 5 : 20;
      push({
        type: "what_if",
        category: r.target.category ?? BASKET_LABELS[r.target.basket],
        monthlySpend: r.baselineMonthly,
        defaultCutPct: Math.min(100, Math.max(5, pct)),
        currency: "EUR",
      });
    }
  }
}

function safeJson(s: string) {
  try {
    return s ? JSON.parse(s) : {};
  } catch {
    return {};
  }
}

/** Bỏ danh sách giao dịch khỏi dữ liệu gửi cho LLM (đã lưu riêng trong Collector) để tiết kiệm token. */
const forLlm = (r: any) =>
  r && Array.isArray(r.sources)
    ? { ...r, sources: undefined, note: "The matching transactions are listed in the app. Tell the customer they can open the list; do not state how many are shown." }
    : r;

export async function runAgent(req: ChatRequestBody): Promise<ChatResponse> {
  const llm = getClient();
  const collector = new Collector();
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...(req.history ?? []),
    { role: "user", content: req.message },
  ];

  let answer = "";
  let usedTool = false;
  let forceTool = false;
  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const resp = await llm.chat.completions
      .create({
      model: config.llmModel,
      messages,
      tools: toolDefinitions,
      // Mặc định để model tự quyết; nếu nó định trả lời có số mà chưa gọi tool thì ép gọi (chống bịa số)
      tool_choice: forceTool ? "required" : "auto",
      max_tokens: 4096,
      reasoning_effort: "low",
    })
      .catch((e: unknown) => {
        console.error("[chat] LLM call failed:", e instanceof Error ? e.message : e);
        throw new HttpError(503, "The assistant is busy right now. Please try again in a moment.");
      });
    forceTool = false;
    const msg = resp.choices[0]?.message;
    if (!msg) break;

    const calls = (msg.tool_calls ?? []).filter((c) => c.type === "function");
    if (calls.length === 0) {
      answer = msg.content ?? "";
      if (!usedTool && /\d/.test(answer)) {
        // Trả lời có số mà chưa dùng tool: bỏ câu này và ép model lấy số từ tool
        answer = "";
        forceTool = true;
        continue;
      }
      break;
    }
    usedTool = true;
    messages.push(msg);
    const results = await Promise.all(calls.map((c) => runTool(c.function.name, c.function.arguments, req.customerId)));
    calls.forEach((c, i) => {
      collector.add(c.function.name, results[i], safeJson(c.function.arguments));
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
