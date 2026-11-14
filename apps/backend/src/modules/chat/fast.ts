import type { ChatResponse } from "@sbank/shared";
import { monthStart, shortDate } from "../../lib/dates.js";
import { basketsService } from "../baskets/baskets.service.js";
import { benchmarkService } from "../benchmark/benchmark.service.js";
import { coachService } from "../coach/coach.service.js";
import { exploreService } from "../explore/explore.service.js";
import { mortgageService } from "../mortgage/mortgage.service.js";
import { planService } from "../plan/plan.service.js";
import { spendingService } from "../spending/spending.service.js";
import { Collector, DEFAULT_SUGGESTIONS, MONTH_NAMES, SUGGESTIONS } from "./agent.js";
import type { ChatRequestBody } from "./chat.schema.js";

/**
 * Đường nhanh không dùng LLM: các câu hỏi trên nút gợi ý và thẻ insight lặp lại rất nhiều, nên trả lời thẳng từ dịch vụ bằng câu mẫu.
 * 0 token, vài chục mili-giây, kết quả luôn giống nhau, và mọi con số đều đến từ code. Câu tự do vẫn đi qua LLM.
 */

const m2 = (n: number) => `€${n.toLocaleString("en-IE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const m0 = (n: number) => `€${Math.round(n).toLocaleString("en-IE")}`;
const lower = (s: string) => s.toLowerCase();
const monthLabel = (yyyyMm: string) => MONTH_NAMES[Number(yyyyMm.slice(5, 7)) - 1];

function normalize(text: string) {
  return text.toLowerCase().replace(/[’‘]/g, "'").trim().replace(/[?!.\s]+$/g, "").replace(/\s+/g, " ").trim();
}

/** Mỗi quy tắc: khớp câu đã chuẩn hóa, gọi dịch vụ, ghi vào Collector (thẻ, biểu đồ, nguồn gốc) và trả về câu trả lời. */
type Run = (customerId: string, c: Collector, m: RegExpExecArray) => Promise<string | null>;
const RULES: { re: RegExp; run: Run }[] = [
  {
    // Chốt chặn xác định: xin lời khuyên đầu tư thì từ chối cố định, không phụ thuộc vào việc model có tuân thủ prompt hay không
    re: /^(?=.*\b(?:bitcoin|btc|crypto|cryptocurrency|ethereum|dogecoin|nft|forex|stocks?|shares|etfs?|index funds?|day trading|options)\b)(?=.*\b(?:should|worth|good idea|recommend|advice|advise|best|safe to|invest in|buy|sell)\b).*$/,
    run: async () =>
      "I cannot advise on investments or products such as crypto, shares or funds. I can help you see how much you could safely set aside each month, or how your own spending looks.",
  },
  {
    re: /^what can i (?:safely )?spend (?:this week|until payday|until my next payday)$/,
    run: async (id, c) => {
      const r = await coachService.safeToSpend(id);
      c.add("safe_to_spend", r);
      const guess = r.paydayIsEstimate ? " Your payday date is a guess because your pay days change." : "";
      if (r.shortfall > 0)
        return `Your bills and basics until payday on ${shortDate(r.nextPayday.date)} come to about ${m2(r.reservedEssentials)}, so you could be ${m2(r.shortfall)} short.${guess} Try to hold off on extras until then.`;
      return `You can safely spend ${m2(r.safeToSpend)} until payday on ${shortDate(r.nextPayday.date)}. That is about ${m2(r.perDay)} a day. About ${m2(r.reservedEssentials)} is set aside for your bills and basics.${guess} Stay under that each day and your bills are covered.`;
    },
  },
  {
    re: /^how much can i (?:safely )?save(?: right now| now)?$/,
    run: async (id, c) => {
      const r = await coachService.safeToSave(id);
      c.add("safe_to_save", r);
      const cover = r.monthsOfEssentialsCovered !== null ? ` Your balance would cover your bills and basics for about ${r.monthsOfEssentialsCovered} months.` : "";
      if (r.shortfall > 0) return `Right now there is nothing safe to put aside. You could be ${m2(r.shortfall)} short before payday on ${shortDate(r.nextPayday.date)}.${cover}`;
      return `You could put ${m2(r.safeToSave)} aside now and still have enough until payday on ${shortDate(r.nextPayday.date)}.${cover} A good first goal is a safety cushion that covers about three months of bills and basics.`;
    },
  },
  {
    re: /^(?:where did my money go(?: this month| in ([a-z]+))?|show my spending by basket)$/,
    run: async (id, c, m) => {
      const s = await basketsService.getSummary(id);
      if (m[1] && m[1] !== lower(monthLabel(s.month))) return null; // tháng khác: để LLM xử lý
      c.add("get_baskets", s);
      const total = s.baskets.reduce((a, b) => a + b.spent, 0);
      const top = s.baskets.flatMap((b) => b.top).sort((a, b) => b.spent - a.spent)[0];
      const parts = s.baskets.map((b) => `${lower(b.name)} ${m2(b.spent)}`).join(", ");
      return `You spent ${m2(total)} in ${monthLabel(s.month)}: ${parts}.${top ? ` Your biggest category was ${lower(top.category)} at ${m2(top.spent)}.` : ""} Regular essentials are bills you cannot skip, so everyday spending is where you have the most room to change things.`;
    },
  },
  {
    re: /^(?:what kind of spender am i|what is my spender profile)$/,
    run: async (id, c) => {
      const r = await coachService.spenderProfile(id);
      c.add("spender_profile", r);
      const vs = r.vsOwnAveragePct === null ? "" : ` This month it is ${Math.abs(r.vsOwnAveragePct)}% ${r.vsOwnAveragePct >= 0 ? "above" : "below"} your own usual.`;
      return `You are a ${lower(r.label)} spender. About ${Math.round(r.basket3Share * 100)}% of your money goes on everyday things like eating out and fun, which is more than ${r.percentile}% of other customers.${vs} This is the part that slips through your fingers, so it is the easiest to change.`;
    },
  },
  {
    re: /^how steady is my income$/,
    run: async (id, c) => {
      const r = await exploreService.incomeSummary(id);
      c.add("income_summary", r);
      const advice = r.stability === "steady" ? "That makes planning simple." : "Because it goes up and down, keep a little aside in the good months for the lean ones.";
      return `Your income averaged ${m2(r.avgMonthlyIncome)} a month over six months, from ${m2(r.minMonthlyIncome)} to ${m2(r.maxMonthlyIncome)}, so it is ${r.stability === "steady" ? "fairly steady" : "up and down"}. ${advice}`;
    },
  },
  {
    re: /^(?:what are my regular monthly payments|show my recurring payments)$/,
    run: async (id, c) => {
      const r = await exploreService.recurring(id);
      c.add("recurring_payments", r);
      if (r.items.length === 0) return "I did not find payments that repeat every month with a steady amount.";
      const list = r.items.slice(0, 3).map((i) => `${lower(i.name)} ${m2(i.avgMonthly)}`).join(", ");
      return `Your regular payments come to about ${m2(r.monthlyTotal)} a month, ${Math.round(r.shareOfSpendingPct)}% of your spending: ${list}. These come every month, so keep that money ready early in the month.`;
    },
  },
  {
    re: /^how do i compare with other people my age$/,
    run: async (id, c) => {
      const r = await benchmarkService.compare({ customerId: id });
      c.add("compare_with_peers", r);
      const rows = r.rows.filter((x) => x.key !== "total" && x.key !== "housing").sort((a, b) => Math.abs(b.you - b.peers) - Math.abs(a.you - a.peers)).slice(0, 2);
      const total = r.rows.find((x) => x.key === "total");
      const head = total ? `You spend about ${m0(total.you)} a month. ${r.peerGroup} spend about ${m0(total.peers)}. ` : "";
      const detail = rows.map((x) => `${lower(x.label)} (you ${m0(x.you)}, others ${m0(x.peers)})`).join("; ");
      return `${head}The biggest differences are ${detail} (${r.source}). Use this as a rough guide, not a judgment.`;
    },
  },
  {
    re: /^how long does a mortgage application (?:usually )?take$/,
    run: async (_id, c) => {
      const r = await mortgageService.process();
      c.add("mortgage_process", r);
      return `A mortgage application usually takes about ${r.daysToDecision.typical} days to get a decision (as quick as ${r.daysToDecision.fastest10} days, as slow as ${r.daysToDecision.slowest10}). People had about ${r.contactsPerApplication} contacts with the bank, and the bank asked for extra collateral (more property or assets to back the loan) in ${r.extraCollateralRequestedPct}% of cases. ${r.caveat}`;
    },
  },
  {
    re: /^how much could i borrow(?: for a home)?$/,
    run: async (id, c) => {
      const r = await mortgageService.affordability({ customerId: id });
      c.add("mortgage_affordability", r);
      return `Based on your average salary of ${m0(r.incomeUsed)} a month, you could borrow up to about ${m0(r.maxLoan)}. The monthly payment would be about ${m0(r.monthlyPayment)} at today's rates (${r.assumptions.avgRatePct}%), and ${m0(r.stressPayment)} if rates rise to ${r.assumptions.stressRatePct}%. ${r.caveat}`;
    },
  },
  {
    re: /^make me a spending plan$/,
    run: async (id, c) => {
      const r = await planService.propose({ customerId: id, goalType: "savings" });
      c.add("propose_plan", r);
      if (!r.feasible) return `${r.note} Tell me a goal and a time and I will look for something that works.`;
      return `Here is a starting plan: save ${m2(r.draft.monthlySaving)} a month and keep everyday spending near ${m2(r.draft.capEveryday)}. Press Save plan on the card to keep it. Give me a goal and a time for a stronger plan.`;
    },
  },
  {
    re: /^how am i doing against my plan$/,
    run: async (id, c) => {
      const r = await planService.progress(id);
      if (!r.plan) return "You do not have a saved plan yet. Ask me for a spending plan and press Save plan to keep it.";
      c.add("plan_progress", r);
      return r.message;
    },
  },
  {
    re: /^what did i spend on (.+) this month$/,
    run: async (id, c, m) => {
      const category = m[1].replace(/\band\b/g, "&");
      const r = await spendingService.getSpending({ customerId: id, from: monthStart(0), to: monthStart(1), category, basket: undefined });
      if (r.count === 0) return null;
      c.add("query_spending", r, { category });
      return `You spent ${m2(r.total)} on ${m[1]} this month across ${r.count} transactions. You can open the list to see each one.`;
    },
  },
  {
    re: /^tell me about my (regular essentials|unexpected necessities|everyday spending) in ([a-z]+)$/,
    run: async (id, c, m) => {
      const s = await basketsService.getSummary(id);
      if (m[2] !== lower(monthLabel(s.month))) return null;
      const b = s.baskets.find((x) => lower(x.name) === m[1]);
      if (!b) return null;
      c.add("get_baskets", s);
      const top = b.top.map((t) => `${lower(t.category)} ${m2(t.spent)}`).join(", ");
      const diff = b.avg6m > 0 ? Math.round(((b.spent - b.avg6m) / b.avg6m) * 100) : null;
      return `${b.name} came to ${m2(b.spent)} in ${monthLabel(s.month)}${diff === null ? "" : `, ${Math.abs(diff)}% ${diff >= 0 ? "above" : "below"} your usual ${m2(b.avg6m)}`}.${top ? ` The biggest parts were ${top}.` : ""}`;
    },
  },
];

/** Trả về câu trả lời đầy đủ nếu câu hỏi khớp một đường nhanh; ngược lại null (để LLM xử lý). */
export async function tryFast(req: ChatRequestBody): Promise<ChatResponse | null> {
  const text = normalize(req.message);
  for (const rule of RULES) {
    const m = rule.re.exec(text);
    if (!m) continue;
    const c = new Collector();
    const answer = await rule.run(req.customerId, c, m);
    if (!answer) return null;
    return {
      answer,
      cards: c.cards,
      chart: c.chart,
      sources: c.sources,
      sourcesTotal: c.sourcesTotal,
      suggestions: SUGGESTIONS[c.lastTool ?? ""] ?? DEFAULT_SUGGESTIONS,
      provenance: c.provenance,
      verified: true, // mọi con số trong câu mẫu đến thẳng từ dịch vụ, không qua LLM
    };
  }
  return null;
}
