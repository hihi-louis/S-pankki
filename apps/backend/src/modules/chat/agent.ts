import OpenAI from "openai";
import type { Card, Chart, ChatResponse, Provenance, SourceTx } from "@sbank/shared";
import { config } from "../../config.js";
import { mccLabel } from "../../lib/mcc.js";
import { periodLabel } from "../../lib/dates.js";
import { HttpError } from "../../lib/errors.js";
import { SYSTEM_PROMPT } from "./prompt.js";
import { provenanceFor } from "./provenance.js";
import { selectTools } from "./router.js";
import { runTool, toolDefinitions } from "./tools.js";
import { verifyAnswer } from "./verifier.js";
import type { ChatRequestBody } from "./chat.schema.js";

const MAX_TURNS = 5;
const MAX_CARDS = 3;

export const DEFAULT_SUGGESTIONS = ["What can I safely spend until payday?", "Show my spending by basket"];
export const SUGGESTIONS: Record<string, string[]> = {
  propose_plan: ["How am I doing against my plan?", "What if I cut everyday spending by 20%?"],
  plan_progress: ["Make me a plan to save 5000 euros in 12 months", "Where did my money go this month?"],
  housing_price: ["Could I afford it?", "How much would I need to save for it?"],
  mortgage_affordability: ["How much would I need to save for a €250,000 home?", "How long does a mortgage application take?"],
  mortgage_status: ["How long does a mortgage application usually take?", "How much could I borrow?"],
  mortgage_savings_plan: ["How much could I borrow?", "What if I cut everyday spending by 30%?"],
  mortgage_process: ["How much could I borrow?", "How much would I need to save for a €250,000 home?"],
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
export const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** Gom thẻ, biểu đồ và nguồn từ kết quả tool vào response (đúng hợp đồng docs/api-contract.md); LLM chỉ viết câu trả lời. */
export class Collector {
  cards: Card[] = [];
  chart: Chart | null = null;
  sources: SourceTx[] = [];
  sourcesTotal = 0;
  lastTool: string | null = null;
  provenance: Provenance[] = [];

  add(name: string, r: any, args: any = {}) {
    if (!r || r.error) return;
    this.lastTool = name;
    const why = provenanceFor(name, args, r);
    if (why && !this.provenance.some((p) => p.title === why.title && p.data === why.data)) this.provenance.push(why);
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
    } else if (name.startsWith("mortgage_") || name === "housing_price" || name === "propose_plan" || name === "plan_progress") {
      // Dịch vụ mortgage tự dựng sẵn thẻ và biểu đồ (giá trị đã định dạng từ code)
      if (r.card) push(r.card);
      if (r.chart) this.chart = r.chart;
    } else if (name === "get_baskets") {
      this.chart = {
        type: "donut",
        title: `${MONTH_NAMES[Number(r.month.slice(5, 7)) - 1]} by basket`,
        data: r.baskets.map((b: { name: string; spent: number }) => ({ label: b.name, value: b.spent })),
      };
    } else if (name === "safe_to_spend") {
      push({ type: "safe_to_spend", perDay: r.loanContext ? r.safeAfterLoanPerDay : r.perDay, total: r.loanContext ? r.safeAfterLoan : r.safeToSpend, until: r.nextPayday.date, currency: "EUR" });
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
const forLlm = (r: any) => {
  if (r && (r.card || r.chart)) {
    const { card: _card, chart: _chart, ...rest } = r; // thẻ và biểu đồ đã hiển thị riêng; không gửi lặp cho LLM
    return rest;
  }
  return forSources(r);
};
const forSources = (r: any) =>
  r && Array.isArray(r.sources)
    ? { ...r, sources: undefined, note: "The matching transactions are listed in the app. Tell the customer they can open the list; do not state how many are shown." }
    : r;

/** Sự kiện gửi dần về client khi chat ở chế độ streaming. */
export type ChatEvent =
  | { type: "status"; text: string }
  | { type: "delta"; text: string }
  | { type: "reset" } // bỏ phần chữ đã gửi: model vừa nói vừa gọi tool
  | { type: "final"; response: ChatResponse };

const TOOL_STATUS: Record<string, string> = {
  query_spending: "Looking up your transactions…",
  spending_breakdown: "Breaking down your spending…",
  compare_periods: "Comparing the periods…",
  recurring_payments: "Finding your regular payments…",
  income_summary: "Checking your income…",
  safe_to_spend: "Working out what is safe to spend…",
  safe_to_save: "Working out what is safe to save…",
  simulate_whatif: "Running the what-if…",
  spender_profile: "Looking at your spending style…",
  compare_with_peers: "Comparing with people your age…",
  get_baskets: "Checking your three baskets…",
};

/** Số liệu đo được của một lần chạy agent (cộng dồn qua các lượt gọi LLM). */
export interface RunStats {
  promptTokens: number;
  completionTokens: number;
  cachedTokens: number;
  turns: number;
  tools: string[];
  /** true = số liệu đã kiểm chứng; false = kiểm chứng thất bại và đã dùng câu an toàn; null = không áp dụng. */
  verified: boolean | null;
  regenerated: boolean;
}
export const newStats = (): RunStats => ({ promptTokens: 0, completionTokens: 0, cachedTokens: 0, turns: 0, tools: [], verified: null, regenerated: false });

interface PendingCall {
  id: string;
  name: string;
  args: string;
}

/**
 * Vòng lặp agent. `emit` nhận trạng thái và chữ trả lời để hiển thị dần.
 * Trước khi có tool nào chạy, câu trả lời được giữ lại cho đến khi chắc chắn không phải số tự bịa; sau đó mới phát từng chữ.
 */
export async function runAgent(
  req: ChatRequestBody,
  emit: (e: ChatEvent) => void = () => {},
  signal?: AbortSignal,
  stats: RunStats = newStats(),
  deps: { llm?: Pick<OpenAI, "chat"> } = {}, // tiêm LLM giả khi kiểm thử
): Promise<ChatResponse> {
  const llm = deps.llm ?? getClient();
  const facts: unknown[] = []; // dữ liệu mà LLM đã thấy: cơ sở để kiểm chứng số liệu
  const collector = new Collector();
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...(req.history ?? []),
    { role: "user", content: req.message },
  ];

  // Mặc định gửi đủ tool: tiền tố prompt ổn định nên nhà cung cấp cache được (token cache rẻ hơn nhiều). Xem LLM_TOOL_GATING.
  const tools = config.llmToolGating ? selectTools(req.message) : toolDefinitions;
  let answer = "";
  let usedTool = false;
  let forceTool = false;
  emit({ type: "status", text: "Thinking…" });

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    let content = "";
    let streamed = false;
    const calls = new Map<number, PendingCall>();
    try {
      const stream = await llm.chat.completions.create(
        {
          model: config.llmModel,
          messages,
          tools,
          // Mặc định để model tự quyết; nếu nó định trả lời có số mà chưa gọi tool thì ép gọi (chống bịa số)
          tool_choice: forceTool ? "required" : "auto",
          max_tokens: 1200,
          reasoning_effort: "low",
          stream: true,
          stream_options: { include_usage: true },
        },
        { signal },
      );
      forceTool = false;
      stats.turns++;
      for await (const chunk of stream) {
        if (chunk.usage) {
          stats.promptTokens += chunk.usage.prompt_tokens ?? 0;
          stats.completionTokens += chunk.usage.completion_tokens ?? 0;
          stats.cachedTokens += chunk.usage.prompt_tokens_details?.cached_tokens ?? 0;
        }
        const delta = chunk.choices[0]?.delta;
        if (!delta) continue;
        if (delta.content) {
          content += delta.content;
          if (usedTool && calls.size === 0) {
            emit({ type: "delta", text: delta.content });
            streamed = true;
          }
        }
        for (const tc of delta.tool_calls ?? []) {
          const cur = calls.get(tc.index) ?? { id: "", name: "", args: "" };
          if (tc.id) cur.id = tc.id;
          if (tc.function?.name) cur.name += tc.function.name;
          if (tc.function?.arguments) cur.args += tc.function.arguments;
          calls.set(tc.index, cur);
        }
      }
    } catch (e) {
      if (signal?.aborted) throw e; // client ngắt kết nối hoặc hết thời gian chung
      console.error("[chat] LLM call failed:", e instanceof Error ? e.message : e);
      throw new HttpError(503, "The assistant is busy right now. Please try again in a moment.");
    }

    if (calls.size === 0) {
      answer = content;
      if (!usedTool && /\d/.test(answer)) {
        // Trả lời có số mà chưa dùng tool: bỏ câu này và ép model lấy số từ tool
        answer = "";
        forceTool = true;
        continue;
      }
      if (!streamed && answer) emit({ type: "delta", text: answer }); // câu không cần tool: phát một lần
      break;
    }

    if (streamed) emit({ type: "reset" });
    usedTool = true;
    stats.tools.push(...[...calls.values()].map((c) => c.name));
    const list = [...calls.entries()].sort((a, b) => a[0] - b[0]).map(([i, c]) => ({ ...c, id: c.id || `call_${i}` }));
    messages.push({
      role: "assistant",
      content: content || null,
      tool_calls: list.map((c) => ({ id: c.id, type: "function" as const, function: { name: c.name, arguments: c.args } })),
    });
    for (const c of list) emit({ type: "status", text: TOOL_STATUS[c.name] ?? "Looking at your data…" });
    const results = await Promise.all(list.map((c) => runTool(c.name, c.args, req.customerId)));
    list.forEach((c, i) => {
      collector.add(c.name, results[i], safeJson(c.args));
      const seen = forLlm(results[i]);
      facts.push(seen);
      messages.push({ role: "tool", tool_call_id: c.id, content: JSON.stringify(seen) });
    });
    emit({ type: "status", text: "Writing your answer…" });
  }

  // Kiểm chứng: mọi khoản tiền và phần trăm trong câu trả lời phải có cơ sở trong dữ liệu tool. Sai thì viết lại một lần, vẫn sai thì dùng câu an toàn.
  if (usedTool && answer) {
    const context = [req.message, ...(req.history ?? []).map((h) => h.content)];
    let verdict = verifyAnswer(answer, facts, context);
    let safeAnswer = false;
    if (!verdict.ok) {
      stats.regenerated = true;
      console.warn(`[verify] unverified in answer: ${verdict.unverified.join(", ")} (tools: ${stats.tools.join(", ")})`);
      if (process.env.LLM_DEBUG) console.warn(`[verify] the rejected answer was: ${answer}`);
      emit({ type: "reset" });
      emit({ type: "status", text: "Double-checking the numbers…" });
      try {
        const fix = await llm.chat.completions.create(
          {
            model: config.llmModel,
            messages: [
              ...messages,
              { role: "assistant", content: answer },
              { role: "user", content: `Some numbers in your answer are not in the tool results: ${verdict.unverified.join(", ")}. Rewrite the answer using only numbers from the tool results. Keep it short.` },
            ],
            tools,
            tool_choice: "none",
            max_tokens: 600,
            reasoning_effort: "low",
          },
          { signal },
        );
        stats.turns++;
        stats.promptTokens += fix.usage?.prompt_tokens ?? 0;
        stats.completionTokens += fix.usage?.completion_tokens ?? 0;
        answer = fix.choices[0]?.message?.content ?? "";
        if (answer) verdict = verifyAnswer(answer, facts, context);
      } catch (e) {
        if (signal?.aborted) throw e;
        answer = "";
      }
      if (!answer || !verdict.ok) {
        safeAnswer = true;
        answer = collector.cards.length
          ? "I could not confirm every number in my answer, so please rely on the exact figures on the card."
          : "I could not confirm the numbers in my answer, so I will not show them. Could you rephrase the question?";
      }
      emit({ type: "delta", text: answer });
    }
    stats.verified = !safeAnswer;
  }

  return {
    answer: answer || "Sorry, I could not work that out. Could you rephrase the question?",
    cards: collector.cards,
    chart: collector.chart,
    sources: collector.sources,
    sourcesTotal: collector.sourcesTotal,
    suggestions: SUGGESTIONS[collector.lastTool ?? ""] ?? DEFAULT_SUGGESTIONS,
    provenance: collector.provenance,
    verified: stats.verified,
  };
}
