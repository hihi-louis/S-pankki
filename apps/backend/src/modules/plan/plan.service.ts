import type { FactsCard, Goal, PlanChangeResult, PlanDraft, PlansOverview } from "@sbank/shared";
import { HttpError } from "../../lib/errors.js";
import { monthStart, TODAY } from "../../lib/dates.js";
import { eur0 } from "../../lib/finance.js";
import { basketsService } from "../baskets/baskets.service.js";
import { coachService } from "../coach/coach.service.js";
import { customersRepository } from "../customers/customers.repository.js";
import { exploreRepository } from "../explore/explore.repository.js";
import { exploreService } from "../explore/explore.service.js";
import { spendingRepository } from "../spending/spending.repository.js";
import { MAX_GOALS, planRepository, type GoalRow } from "./plan.repository.js";
import type { ProposeQuery } from "./plan.schema.js";

const MIN_START_SAVING_RATE = 0.05; // kế hoạch khởi điểm: giữ chi tiêu như cũ và để dành phần còn lại (tối thiểu 5% thu nhập)
const MAX_EVERYDAY_CUT = 0.5; // cắt chi tiêu hằng ngày quá 50% thì coi là kế hoạch không thực tế
const WEEKS_PER_MONTH = 4.33;
const round = (n: number) => Math.round(n);

const NAMES: Record<1 | 2 | 3, string> = { 1: "Regular essentials", 2: "Unexpected necessities", 3: "Everyday spending" };
const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const asGoal = (g: GoalRow): Goal => ({
  ...g,
  monthsAtThisPace: g.targetAmount !== null && g.monthlyAmount > 0 ? Math.ceil(g.targetAmount / g.monthlyAmount) : null,
});

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
      ? `${goalAmount === null ? "A starting plan: keep spending the way you do now and save what is left. Tell me a goal and a time for a stronger plan. " : "A plan from your last six months, not a promise. "}Press Add to my plans to keep it; you can change or delete it later.${lean}`
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

  /** Goals, the weekly limit and how this month is going: one place for the Overview, the plans screen and the chat. */
  async overview(customerId: string): Promise<PlansOverview> {
    await ensureCustomer(customerId);
    const from = addDays(TODAY, -6);
    const [goals, limit, summary, incomeRows, week] = await Promise.all([
      planRepository.goals(customerId),
      planRepository.weeklyLimit(customerId),
      basketsService.getSummary(customerId),
      exploreRepository.monthlyIncome(customerId, monthStart(0), monthStart(1)),
      spendingRepository.total({ customerId, from, to: addDays(TODAY, 1), basket: 3, category: undefined, mcc: undefined }),
    ]);
    const everydayAvg = summary.baskets.find((b) => b.id === 3)?.avg6m ?? 0;
    const spent = round(week.total);
    const weeklyLimit = limit === null ? null : { amount: round(limit), spent, remaining: round(Math.max(0, limit - spent)), pct: limit > 0 ? round((spent / limit) * 100) : 0, from, to: TODAY };
    const target = round(goals.reduce((s, g) => s + g.monthlyAmount, 0));
    const setAside = { thisMonth: round(Math.max(0, incomeRows[0]?.invested ?? 0)), target };
    const status: PlansOverview["status"] = !weeklyLimit && goals.length === 0 ? "none" : !weeklyLimit ? "on_track" : weeklyLimit.pct > 100 ? "over" : weeklyLimit.pct >= 85 ? "watch" : "on_track";
    const message =
      status === "none"
        ? "No plans yet. Add a goal, or ask the coach for a plan."
        : !weeklyLimit
          ? "You have no weekly limit yet."
          : status === "over"
            ? `Over this week's limit: ${eur0(weeklyLimit.spent)} of ${eur0(weeklyLimit.amount)} spent in the last 7 days.`
            : status === "watch"
              ? `Close to this week's limit: ${eur0(weeklyLimit.remaining)} left.`
              : `On track: ${eur0(weeklyLimit.remaining)} left of this week's ${eur0(weeklyLimit.amount)}.`;
    return { asOf: TODAY, goals: goals.map(asGoal), weeklyLimit, suggestedWeeklyLimit: round(everydayAvg / WEEKS_PER_MONTH), setAside, status, message };
  },

  async addGoal(customerId: string, g: Omit<GoalRow, "id" | "createdAt">) {
    await ensureCustomer(customerId);
    if ((await planRepository.goals(customerId)).length >= MAX_GOALS) throw new HttpError(400, `You can have up to ${MAX_GOALS} goals. Delete one first.`);
    return asGoal(await planRepository.addGoal(customerId, g));
  },

  async updateGoal(customerId: string, id: number, g: Partial<Omit<GoalRow, "id" | "createdAt">>) {
    const r = await planRepository.updateGoal(customerId, id, g);
    if (!r) throw new HttpError(404, "Goal not found");
    return asGoal(r);
  },

  async removeGoal(customerId: string, id: number) {
    if (!(await planRepository.removeGoal(customerId, id))) throw new HttpError(404, "Goal not found");
  },

  async setWeeklyLimit(customerId: string, amount: number) {
    await ensureCustomer(customerId);
    await planRepository.setWeeklyLimit(customerId, round(amount));
  },

  async removeWeeklyLimit(customerId: string) {
    await planRepository.removeWeeklyLimit(customerId);
  },

  /**
   * "Add to my plans" on a coach plan: a goal (added, or updated when a goal with the same name exists) and the weekly limit.
   * Always says what changed, so nothing is overwritten silently.
   */
  async saveDraft(customerId: string, draft: PlanDraft): Promise<PlanChangeResult> {
    await ensureCustomer(customerId);
    const existing = (await planRepository.goals(customerId)).find((g) => g.name.toLowerCase() === draft.goalLabel.toLowerCase());
    const fields = { name: draft.goalLabel, kind: draft.goalType, targetAmount: draft.goalAmount, months: draft.months, monthlyAmount: round(draft.monthlySaving) };
    const parts: string[] = [];
    if (existing) {
      await planRepository.updateGoal(customerId, existing.id, fields);
      parts.push(`Updated your goal "${draft.goalLabel}" to ${eur0(fields.monthlyAmount)} a month (it was ${eur0(existing.monthlyAmount)}).`);
    } else {
      await this.addGoal(customerId, fields);
      parts.push(`Added the goal "${draft.goalLabel}": ${eur0(fields.monthlyAmount)} a month.`);
    }
    const weekly = round(draft.capEveryday / WEEKS_PER_MONTH);
    const before = await planRepository.weeklyLimit(customerId);
    if (weekly > 0 && before !== weekly) {
      await planRepository.setWeeklyLimit(customerId, weekly);
      parts.push(before === null ? `Set your weekly limit to ${eur0(weekly)}.` : `Changed your weekly limit from ${eur0(before)} to ${eur0(weekly)}.`);
    }
    return { message: parts.join(" "), overview: await this.overview(customerId) };
  },

  /**
   * "Apply to my plan" on a suggestion (spend X less per month in a basket). Everyday spending lowers the weekly limit;
   * for bills and surprises the amount goes into a goal. Only runs when the customer taps the button.
   */
  async applyCap(customerId: string, basket: 1 | 2 | 3, reduceBy: number): Promise<PlanChangeResult> {
    const ov = await this.overview(customerId);
    const parts: string[] = [];
    if (basket === 3) {
      const current = ov.weeklyLimit?.amount ?? ov.suggestedWeeklyLimit;
      const next = Math.max(20, current - round(reduceBy / WEEKS_PER_MONTH));
      await planRepository.setWeeklyLimit(customerId, next);
      parts.push(`Your weekly limit for everyday spending is now ${eur0(next)} (it was ${eur0(current)}).`);
    }
    const first = ov.goals[0];
    if (first) {
      await planRepository.updateGoal(customerId, first.id, { monthlyAmount: first.monthlyAmount + round(reduceBy) });
      parts.push(`The ${eur0(reduceBy)} a month you free up goes to "${first.name}": now ${eur0(first.monthlyAmount + round(reduceBy))} a month.`);
    } else {
      await this.addGoal(customerId, { name: "Savings goal", kind: "savings", targetAmount: null, months: null, monthlyAmount: round(reduceBy) });
      parts.push(`Started a goal "Savings goal" with ${eur0(reduceBy)} a month.`);
    }
    return { message: parts.join(" "), overview: await this.overview(customerId) };
  },

  /** For the chat: how the customer is doing against their plans, as a card. */
  async progress(customerId: string) {
    const ov = await this.overview(customerId);
    if (ov.goals.length === 0 && !ov.weeklyLimit) return { hasPlan: false as const, message: ov.message };
    const rows: FactsCard["rows"] = [
      ...ov.goals.map((g) => ({ label: `Goal: ${g.name}`, value: `${eur0(g.monthlyAmount)} a month${g.targetAmount ? ` toward ${eur0(g.targetAmount)}` : ""}` })),
      ...(ov.weeklyLimit
        ? [{ label: "Everyday spending, last 7 days", value: `${eur0(ov.weeklyLimit.spent)} of ${eur0(ov.weeklyLimit.amount)}`, tone: ov.weeklyLimit.pct > 100 ? ("warn" as const) : undefined }]
        : []),
      ...(ov.setAside.target > 0 ? [{ label: "Set aside this month", value: `${eur0(ov.setAside.thisMonth)} of ${eur0(ov.setAside.target)}`, tone: ov.setAside.thisMonth >= ov.setAside.target ? ("good" as const) : undefined }] : []),
    ];
    const card: FactsCard = { type: "facts", title: "How you are doing against your plans", headline: { label: ov.message, value: ov.weeklyLimit ? `${ov.weeklyLimit.pct}%` : `${ov.goals.length}` }, rows };
    return { hasPlan: true as const, overview: ov, message: ov.message, card };
  },
};

async function ensureCustomer(customerId: string) {
  const c = await customersRepository.findWithStats(customerId);
  if (!c) throw new HttpError(404, `Customer ${customerId} not found`);
}
