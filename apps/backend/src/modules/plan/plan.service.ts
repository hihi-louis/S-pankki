import type { FactsCard, PlanDraft, PlanProgressResponse, SavedPlan } from "@sbank/shared";
import { HttpError } from "../../lib/errors.js";
import { monthStart, TODAY } from "../../lib/dates.js";
import { eur0 } from "../../lib/finance.js";
import { basketsService } from "../baskets/baskets.service.js";
import { coachService } from "../coach/coach.service.js";
import { customersRepository } from "../customers/customers.repository.js";
import { exploreRepository } from "../explore/explore.repository.js";
import { exploreService } from "../explore/explore.service.js";
import { planRepository } from "./plan.repository.js";
import type { ProposeQuery } from "./plan.schema.js";

const MIN_START_SAVING_RATE = 0.05; // kế hoạch khởi điểm: giữ chi tiêu như cũ và để dành phần còn lại (tối thiểu 5% thu nhập)
const MAX_EVERYDAY_CUT = 0.5; // cắt chi tiêu hằng ngày quá 50% thì coi là kế hoạch không thực tế
const WEEKS_PER_MONTH = 4.33;
const round = (n: number) => Math.round(n);

const NAMES: Record<1 | 2 | 3, string> = { 1: "Regular essentials", 2: "Unexpected necessities", 3: "Everyday spending" };

export const planService = {
  /** Dựng kế hoạch từ 6 tháng gần nhất. Chỉ đề xuất; người dùng bấm Save plan thì mới ghi (LLM không ghi vào database). */
  async propose(q: ProposeQuery) {
    const [summary, income, save] = await Promise.all([
      basketsService.getSummary(q.customerId),
      exploreService.incomeSummary(q.customerId),
      coachService.safeToSave(q.customerId),
    ]);
    const avg = (id: 1 | 2 | 3) => summary.baskets.find((b) => b.id === id)!.avg6m;
    const variable = income.stability === "variable";
    const base = income.avgMonthlyIncome; // trung bình 6 tháng khớp với thực tế chi tiêu và tiết kiệm; nếu dao động mạnh thì nhắc giữ quỹ đệm
    const essentials = avg(1);
    const unexpected = avg(2);
    const everydayUsual = avg(3);
    const free = base - essentials - unexpected;
    const haveNow = save.safeToSave;

    const goalAmount = q.goalAmount ?? null;
    const months = q.months ?? null;
    const needed = goalAmount !== null ? Math.max(0, goalAmount - haveNow) : null;
    const surplus = free - everydayUsual; // phần còn lại nếu giữ nguyên chi tiêu như thường lệ
    const saving = round(needed !== null && months ? Math.ceil(needed / months) : Math.max(surplus, base * MIN_START_SAVING_RATE));
    const everydayCap = Math.max(0, free - saving);
    const cutNeeded = everydayUsual > 0 ? Math.max(0, (everydayUsual - everydayCap) / everydayUsual) : 0;
    const cutPct = round(cutNeeded * 100);
    const feasible = free - saving >= 0 && cutNeeded <= MAX_EVERYDAY_CUT;
    const monthsToGoal = needed !== null && saving > 0 ? Math.ceil(needed / saving) : needed === 0 ? 0 : null;
    // Nếu không khả thi: mức để dành tối đa thực tế nếu cắt chi tiêu hằng ngày tới giới hạn
    const maxSaving = round(Math.max(0, free - (1 - MAX_EVERYDAY_CUT) * everydayUsual));
    const monthsAtMax = needed !== null && maxSaving > 0 ? Math.ceil(needed / maxSaving) : needed === 0 ? 0 : null;

    const label = q.goalLabel ?? (q.goalType === "home" ? "Home down payment" : "Savings goal");
    const draft: PlanDraft = {
      goalType: q.goalType,
      goalLabel: label,
      goalAmount,
      months,
      monthlySaving: saving,
      capEssentials: round(essentials),
      capUnexpected: round(unexpected),
      capEveryday: round(everydayCap),
    };

    const rows: FactsCard["rows"] = [
      { label: "Pay we plan with (6-month average)", value: `${eur0(base)} / month` },
      { label: "Bills and basics (what you usually spend)", value: eur0(essentials) },
      { label: "Buffer for surprises (what you usually spend)", value: eur0(unexpected) },
      {
        label: "Limit for everyday spending",
        value: `${eur0(everydayCap)} (usually ${eur0(everydayUsual)}${cutPct > 0 ? `, ${cutPct}% less` : ""})`,
        tone: cutPct > 0 ? "warn" : undefined,
      },
      { label: "Everyday allowance per week", value: eur0(everydayCap / WEEKS_PER_MONTH) },
      { label: "Save each month", value: eur0(saving) },
    ];
    if (goalAmount !== null) {
      rows.push({ label: `Goal: ${label}`, value: eur0(goalAmount) }, { label: "You could set aside now", value: eur0(haveNow) });
      rows.push({
        label: "You reach the goal in",
        value: monthsToGoal === null ? "never at this saving" : monthsToGoal === 0 ? "now" : `${monthsToGoal} months${months && monthsToGoal > months ? ` (deadline ${months})` : ""}`,
        tone: !feasible || (months && monthsToGoal !== null && monthsToGoal > months) ? "warn" : "good",
      });
      if (!feasible)
        rows.push({
          label: `Most you could save (everyday spending cut by ${round(MAX_EVERYDAY_CUT * 100)}%)`,
          value: maxSaving > 0 ? `${eur0(maxSaving)} / month, goal in ${monthsAtMax} months` : "nothing is left to save",
        });
    }
    rows.push({ label: "Fits your income", value: feasible ? "Yes" : "No", tone: feasible ? "good" : "warn" });

    const lean = variable ? ` Your income varies from ${eur0(income.minMonthlyIncome)} to ${eur0(income.maxMonthlyIncome)} a month, so keep a little aside in the good months.` : "";
    const note = feasible
      ? `${goalAmount === null ? "A starting plan: keep spending the way you do now and save what is left. Tell me a goal and a time for a stronger plan. " : "A plan from your last six months, not a promise. "}Press Save plan to keep it and follow it on the Overview.${lean}`
      : free - saving < 0
        ? "Your usual bills, surprises and this saving add up to more than your pay, so a spending limit cannot be set."
        : `The everyday limit would be ${round(cutNeeded * 100)}% below what you usually spend, which is a big change. Try a longer time or a smaller goal.`;

    const card: FactsCard = {
      type: "facts",
      title: "Your spending plan",
      headline: { label: "Save each month", value: eur0(saving) },
      rows,
      note,
      action: free - saving >= 0 ? { kind: "save_plan", draft } : undefined,
    };
    return {
      draft,
      feasible,
      incomeBasis: round(base),
      incomeIsVariable: variable,
      mostSavablePerMonth: maxSaving,
      monthsAtMostSavable: monthsAtMax,
      everydayUsual: round(everydayUsual),
      everydayCutNeededPct: round(cutNeeded * 100),
      monthsToGoal,
      note,
      card,
    };
  },

  async save(customerId: string, draft: PlanDraft): Promise<SavedPlan> {
    const customer = await customersRepository.findWithStats(customerId);
    if (!customer) throw new HttpError(404, `Customer ${customerId} not found`);
    return planRepository.upsert(customerId, draft);
  },

  /**
   * Hạ trần của một giỏ trong kế hoạch đã lưu (chưa có thì dùng kế hoạch khởi điểm) và cộng phần bớt đó vào khoản để dành mỗi tháng.
   * Chỉ chạy khi khách bấm nút trên một thẻ gợi ý.
   */
  async applyCap(customerId: string, basket: 1 | 2 | 3, reduceBy: number) {
    const existing = await planRepository.get(customerId);
    const base: PlanDraft = existing ?? (await this.propose({ customerId, goalType: "savings" })).draft;
    const key = basket === 1 ? "capEssentials" : basket === 2 ? "capUnexpected" : "capEveryday";
    const newCap = Math.max(0, base[key] - reduceBy);
    const delta = base[key] - newCap;
    const saved = await planRepository.upsert(customerId, { ...base, [key]: newCap, monthlySaving: base.monthlySaving + delta });
    return { plan: saved, appliedReduceBy: delta, createdNewPlan: !existing, basketName: NAMES[basket] };
  },

  async get(customerId: string) {
    return planRepository.get(customerId);
  },

  /** Tháng này so với kế hoạch đã lưu. */
  async progress(customerId: string): Promise<PlanProgressResponse & { card?: FactsCard }> {
    const [plan, summary, incomeRows] = await Promise.all([
      planRepository.get(customerId),
      basketsService.getSummary(customerId),
      exploreRepository.monthlyIncome(customerId, monthStart(0), monthStart(1)),
    ]);
    const month = summary.month;
    if (!plan) {
      return {
        asOf: TODAY,
        month,
        plan: null,
        baskets: [],
        saving: { target: 0, actual: 0, pct: 0 },
        weeklyEverydayAllowance: 0,
        status: "on_track",
        message: "No saved plan yet. Ask for a spending plan and press Save plan.",
      };
    }
    const caps: Record<1 | 2 | 3, number> = { 1: plan.capEssentials, 2: plan.capUnexpected, 3: plan.capEveryday };
    const baskets = summary.baskets.map((b) => ({
      id: b.id,
      name: NAMES[b.id],
      cap: caps[b.id],
      spent: round(b.spent),
      pct: caps[b.id] > 0 ? round((b.spent / caps[b.id]) * 100) : b.spent > 0 ? 999 : 0,
    }));
    const invested = Math.max(0, incomeRows[0]?.invested ?? 0);
    const saving = { target: plan.monthlySaving, actual: round(invested), pct: plan.monthlySaving > 0 ? round((invested / plan.monthlySaving) * 100) : 0 };
    const everyday = baskets.find((b) => b.id === 3)!;
    const worst = Math.max(...baskets.map((b) => b.pct));
    const status = everyday.pct > 100 || baskets[0].pct > 105 ? "over" : worst >= 85 ? "watch" : "on_track";
    const message =
      status === "over"
        ? `Everyday spending is at ${everyday.pct}% of your cap (${eur0(everyday.spent)} of ${eur0(everyday.cap)}).`
        : status === "watch"
          ? `Close to the limit: everyday spending is at ${everyday.pct}% of your cap.`
          : `On track: everyday spending is at ${everyday.pct}% of your cap.`;
    const card: FactsCard = {
      type: "facts",
      title: "How you are doing against your plan",
      headline: { label: message, value: `${everyday.pct}%` },
      rows: [
        ...baskets.map((b) => ({ label: b.name, value: `${eur0(b.spent)} of ${eur0(b.cap)} (${b.pct}%)`, tone: b.pct > 100 ? ("warn" as const) : undefined })),
        { label: "Saved this month", value: `${eur0(saving.actual)} of ${eur0(saving.target)}`, tone: saving.pct >= 100 ? ("good" as const) : undefined },
        { label: "Everyday allowance per week", value: eur0(plan.capEveryday / WEEKS_PER_MONTH) },
      ],
    };
    return { asOf: TODAY, month, plan, baskets, saving, weeklyEverydayAllowance: round(plan.capEveryday / WEEKS_PER_MONTH), status, message, card };
  },
};
