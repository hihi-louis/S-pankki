import type { ForecastPoint, ForecastResponse } from "@sbank/shared";
import { HttpError } from "../../lib/errors.js";
import { daysBetween, lastNMonths, monthStart, nextPayday, TODAY } from "../../lib/dates.js";
import { exploreService } from "../explore/explore.service.js";
import { planRepository } from "../plan/plan.repository.js";
import { basketsService } from "../baskets/baskets.service.js";
import { customersRepository } from "../customers/customers.repository.js";
import { coachRepository } from "./coach.repository.js";
import type { WhatIfQuery } from "./coach.schema.js";

const round2 = (n: number) => Math.round(n * 100) / 100;
const AVG_MONTHS = 6;
const DAYS_PER_MONTH = 30;

/** Nhãn theo vị trí của tỉ lệ giỏ 3 so với tất cả khách (percentile 0-100). */
function profileLabel(percentile: number) {
  if (percentile <= 25) return "Careful";
  if (percentile <= 75) return "Balanced";
  if (percentile <= 90) return "Spontaneous";
  return "Big spender on extras";
}

const ESSENTIAL_CATEGORIES = new Set(["Housing", "Utilities", "Groceries", "Transportation"]);

/**
 * Chi phí thiết yếu cần giữ lại đến kỳ lương: các hóa đơn thường lệ đến hạn TRƯỚC kỳ lương được tính đủ (đúng ngày hay trả),
 * phần thiết yếu còn lại (ăn uống, đi lại...) chia đều theo ngày. Dùng chung cho safe-to-spend, safe-to-save và forecast để các con số không mâu thuẫn nhau.
 */
function essentialsUntilPayday(essentialsMonthly: number, recurring: { items: { name: string; category: string; avgMonthly: number; typicalDay: number }[] }, daysLeft: number, payday: string) {
  const bills = recurring.items
    .filter((i) => ESSENTIAL_CATEGORIES.has(i.category))
    .map((i) => ({ date: nextPayday(i.typicalDay), label: i.name, amount: i.avgMonthly }))
    .sort((a, b) => a.date.localeCompare(b.date));
  const billsMonthly = bills.reduce((s, b) => s + b.amount, 0);
  const due = bills.filter((b) => b.date <= payday);
  const smoothPerDay = Math.max(0, essentialsMonthly - billsMonthly) / DAYS_PER_MONTH;
  const total = due.reduce((s, b) => s + b.amount, 0) + smoothPerDay * daysLeft;
  return { total: round2(total), due, smoothPerDay };
}

export const coachService = {
  /**
   * Số tiền có thể tiêu đến kỳ lương kế tiếp:
   * số dư − chi phí thiết yếu (giỏ 1) còn lại, ước tính = trung bình 6 tháng × số ngày còn lại / 30.
   */
  async safeToSpend(customerId: string) {
    const [s, rec] = await Promise.all([basketsService.getSummary(customerId), exploreService.recurring(customerId)]);
    const essentials = s.baskets.find((b) => b.id === 1)!;
    const daysLeft = Math.max(1, daysBetween(TODAY, s.nextPayday.date));
    const reservedEssentials = essentialsUntilPayday(essentials.avg6m, rec, daysLeft, s.nextPayday.date).total;
    const raw = s.balance - reservedEssentials;
    return {
      balance: s.balance,
      nextPayday: s.nextPayday,
      paydayIsEstimate: s.nextPayday.estimated ?? false,
      daysLeft,
      reservedEssentials,
      safeToSpend: round2(Math.max(0, raw)),
      perDay: round2(Math.max(0, raw) / daysLeft),
      shortfall: raw < 0 ? round2(-raw) : 0,
    };
  },

  /**
   * Số tiền có thể chuyển sang tiết kiệm NGAY mà vẫn đủ tiền đến kỳ lương kế tiếp:
   * số dư − (thiết yếu + chi bất ngờ + chi hằng ngày thường lệ) cho số ngày còn lại; mỗi khoản = trung bình 6 tháng × ngày còn lại / 30.
   * Kèm bối cảnh: số tháng chi phí thiết yếu mà số dư trang trải được và khoảng cách tới quỹ dự phòng 3 tháng.
   */
  async safeToSave(customerId: string) {
    const [s, income, rec] = await Promise.all([basketsService.getSummary(customerId), exploreService.incomeSummary(customerId), exploreService.recurring(customerId)]);
    const avg = (id: 1 | 2 | 3) => s.baskets.find((b) => b.id === id)!.avg6m;
    const daysLeft = Math.max(1, daysBetween(TODAY, s.nextPayday.date));
    const prorate = (monthly: number) => round2((monthly * daysLeft) / DAYS_PER_MONTH);
    const expected = { essentials: essentialsUntilPayday(avg(1), rec, daysLeft, s.nextPayday.date).total, unexpected: prorate(avg(2)), everyday: prorate(avg(3)) };
    const raw = s.balance - expected.essentials - expected.unexpected - expected.everyday;
    const essentialsMonthly = round2(avg(1) + avg(2));
    const emergencyTarget = round2(essentialsMonthly * 3);
    const avgSpending = round2(avg(1) + avg(2) + avg(3));
    return {
      balance: s.balance,
      nextPayday: s.nextPayday,
      daysLeft,
      expectedUntilPayday: expected,
      safeToSave: round2(Math.max(0, raw)),
      shortfall: raw < 0 ? round2(-raw) : 0,
      avgMonthlyIncome: income.avgMonthlyIncome,
      incomeStability: income.stability,
      avgMonthlySpending: avgSpending,
      avgMonthlySurplus: round2(income.avgMonthlyIncome - avgSpending),
      alreadyInvestedPerMonth: income.avgInvestedPerMonth,
      essentialsMonthly,
      monthsOfEssentialsCovered: essentialsMonthly > 0 ? Math.round((s.balance / essentialsMonthly) * 10) / 10 : null,
      emergencyFundTarget: emergencyTarget,
      emergencyFundGap: round2(Math.max(0, emergencyTarget - s.balance)),
    };
  },

  /**
   * Ước tính số dư từng ngày đến kỳ lương theo ba kịch bản: chi như thường lệ, theo kế hoạch đã lưu, và đúng mức an toàn mỗi ngày.
   * Hóa đơn thường lệ (tiền nhà, tiền điện...) rơi vào đúng ngày hay trả; phần còn lại rải đều. Đây là ước lượng từ trung bình, không phải giao dịch tương lai thật.
   */
  async forecast(customerId: string): Promise<ForecastResponse> {
    const [s, rec, safe, plan] = await Promise.all([
      basketsService.getSummary(customerId),
      exploreService.recurring(customerId),
      this.safeToSpend(customerId),
      planRepository.get(customerId),
    ]);
    const avg = (id: 1 | 2 | 3) => s.baskets.find((b) => b.id === id)!.avg6m;
    const days = Math.max(1, safe.daysLeft);
    const addDays = (n: number) => {
      const d = new Date(`${TODAY}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() + n);
      return d.toISOString().slice(0, 10);
    };
    // Hóa đơn thiết yếu thường lệ đến hạn trong khoảng (hôm nay, kỳ lương]; phần thiết yếu còn lại chia đều (cùng cách tính với safe-to-spend)
    const { due: bills, smoothPerDay: smoothEssentials } = essentialsUntilPayday(avg(1), rec, days, safe.nextPayday.date);
    const billsMonthly = rec.items.filter((i) => ESSENTIAL_CATEGORIES.has(i.category)).reduce((a, i) => a + i.avgMonthly, 0);
    const usualPerDay = smoothEssentials + (avg(2) + avg(3)) / 30;
    const planPerDay = plan ? Math.max(0, plan.capEssentials - billsMonthly) / 30 + (plan.capUnexpected + plan.capEveryday) / 30 : null;
    const safeSmooth = smoothEssentials + safe.perDay; // chi thiết yếu rải đều cộng mức an toàn mỗi ngày
    const billsUpTo = (date: string) => bills.filter((b) => b.date <= date).reduce((a, b) => a + b.amount, 0);
    const r2 = (n: number) => Math.round(n * 100) / 100;

    const points: ForecastPoint[] = Array.from({ length: days + 1 }, (_, d) => {
      const date = addDays(d);
      const paid = billsUpTo(date);
      return {
        date,
        usual: r2(s.balance - paid - usualPerDay * d),
        plan: planPerDay === null ? null : r2(s.balance - paid - planPerDay * d),
        safe: r2(s.balance - paid - safeSmooth * d),
      };
    });
    const last = points[points.length - 1];
    const runsOut = points.find((p) => p.usual < 0)?.date ?? null;
    return {
      asOf: TODAY,
      balance: s.balance,
      nextPayday: { date: safe.nextPayday.date, expected: safe.nextPayday.expected, estimated: safe.paydayIsEstimate },
      daysLeft: days,
      points,
      bills,
      safePerDay: safe.perDay,
      shortfall: safe.shortfall,
      usualPerDay: r2(avg(2) / 30 + avg(3) / 30),
      planPerDay: plan ? r2(plan.capEveryday / 30) : null,
      endUsual: last.usual,
      endPlan: last.plan,
      runsOutOn: runsOut,
      note: "An estimate from your 6-month averages and your regular bills. It does not know about purchases you have not made yet.",
    };
  },

  /** Cắt X% hoặc X€/tháng của một giỏ/danh mục thì tiết kiệm được bao nhiêu (theo trung bình 6 tháng). */
  async whatIf(q: WhatIfQuery) {
    const customer = await customersRepository.findWithStats(q.customerId);
    if (!customer) throw new HttpError(404, `Customer ${q.customerId} not found`);

    const target = q.basket ? { basket: q.basket } : { category: q.category };
    const months = lastNMonths(AVG_MONTHS);
    const total = await coachRepository.spentInRange(q.customerId, target, months[0], monthStart(0));
    const baselineMonthly = round2(total / AVG_MONTHS);
    const cut = q.percent !== undefined ? (baselineMonthly * q.percent) / 100 : Math.min(q.amountEur!, baselineMonthly);
    const monthlySaving = round2(cut);
    return {
      target: q.basket ? { basket: q.basket } : { category: q.category },
      baselineMonthly,
      newMonthly: round2(baselineMonthly - monthlySaving),
      monthlySaving,
      yearlySaving: round2(monthlySaving * 12),
    };
  },

  /** Hồ sơ người chi tiêu: tỉ lệ giỏ 3 so với mọi khách, và giỏ 3 tháng này so với chính họ. */
  async spenderProfile(customerId: string) {
    const customer = await customersRepository.findWithStats(customerId);
    if (!customer) throw new HttpError(404, `Customer ${customerId} not found`);
    const share = customer.basket3Share ?? 0;
    const [percentile, summary] = await Promise.all([
      coachRepository.basket3Percentile(share),
      basketsService.getSummary(customerId),
    ]);
    const b3 = summary.baskets.find((b) => b.id === 3)!;
    return {
      label: profileLabel(percentile),
      basket3Share: share,
      percentile: Math.round(percentile),
      basket3ThisMonth: b3.spent,
      basket3Avg6m: b3.avg6m,
      vsOwnAveragePct: b3.avg6m > 0 ? Math.round(((b3.spent - b3.avg6m) / b3.avg6m) * 100) : null,
    };
  },
};
