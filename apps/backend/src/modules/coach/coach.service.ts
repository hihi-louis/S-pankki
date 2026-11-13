import { HttpError } from "../../lib/errors.js";
import { daysBetween, lastNMonths, monthStart, TODAY } from "../../lib/dates.js";
import { basketsService } from "../baskets/baskets.service.js";
import { customersRepository } from "../customers/customers.repository.js";
import { coachRepository } from "./coach.repository.js";
import type { WhatIfQuery } from "./coach.schema.js";

const round2 = (n: number) => Math.round(n * 100) / 100;
const AVG_MONTHS = 6;
const DAYS_PER_MONTH = 30;

/** Nhãn theo vị trí của tỉ lệ giỏ 3 so với tất cả khách (percentile 0-100). */
function profileLabel(percentile: number) {
  if (percentile <= 25) return "Disciplined";
  if (percentile <= 75) return "Balanced";
  if (percentile <= 90) return "Impulsive";
  return "Heavy leaker";
}

export const coachService = {
  /**
   * Số tiền có thể tiêu đến kỳ lương kế tiếp:
   * số dư − chi phí thiết yếu (giỏ 1) còn lại, ước tính = trung bình 6 tháng × số ngày còn lại / 30.
   */
  async safeToSpend(customerId: string) {
    const s = await basketsService.getSummary(customerId);
    const essentials = s.baskets.find((b) => b.id === 1)!;
    const daysLeft = Math.max(1, daysBetween(TODAY, s.nextPayday.date));
    const reservedEssentials = round2((essentials.avg6m * daysLeft) / DAYS_PER_MONTH);
    const raw = s.balance - reservedEssentials;
    return {
      balance: s.balance,
      nextPayday: s.nextPayday,
      daysLeft,
      reservedEssentials,
      safeToSpend: round2(Math.max(0, raw)),
      perDay: round2(Math.max(0, raw) / daysLeft),
      shortfall: raw < 0 ? round2(-raw) : 0,
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
