import { HttpError } from "../../lib/errors.js";
import { lastNMonths, monthStart } from "../../lib/dates.js";
import { mccLabel } from "../../lib/mcc.js";
import { customersRepository } from "../customers/customers.repository.js";
import { spendingRepository } from "../spending/spending.repository.js";
import { exploreRepository } from "./explore.repository.js";
import type { BreakdownQuery, CompareQuery } from "./explore.schema.js";

const round2 = (n: number) => Math.round(n * 100) / 100;
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const stdev = (xs: number[]) => {
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
};
const BASKET_NAMES: Record<string, string> = { "1": "Regular essentials", "2": "Unexpected necessities", "3": "Everyday spending" };
const MONTHS = 6;

export const exploreService = {
  async breakdown(q: BreakdownQuery) {
    if (q.to <= q.from) throw new HttpError(400, `Invalid range: 'to' (${q.to}) must be after 'from' (${q.from}); 'to' is exclusive.`);
    const [rows, summary] = await Promise.all([
      exploreRepository.breakdown(q),
      q.groupBy === "merchant" ? exploreRepository.shopsTotal(q) : spendingRepository.total(q),
    ]);
    const total = summary.total;
    const items = rows.map((r) => ({
      key: r.key,
      label: q.groupBy === "basket" ? BASKET_NAMES[r.key] : q.groupBy === "merchant" ? merchantLabel(r.key, r.mcc) : r.key,
      spent: round2(r.spent),
      count: r.count,
      sharePct: total > 0 ? Math.round((r.spent / total) * 1000) / 10 : 0,
    }));
    const shown = items.reduce((s, i) => s + i.spent, 0);
    return {
      groupBy: q.groupBy,
      period: { from: q.from, to: q.to },
      total: round2(total),
      transactionCount: summary.count,
      rows: items,
      // Phần còn lại khi danh sách bị cắt theo `limit`
      otherSpent: q.groupBy === "month" || q.groupBy === "weekday" ? 0 : round2(Math.max(0, total - shown)),
    };
  },

  /** So sánh khoảng B với khoảng A: tổng, chênh lệch và các danh mục thay đổi nhiều nhất. */
  async compare(q: CompareQuery) {
    if (q.toA <= q.fromA || q.toB <= q.fromB) throw new HttpError(400, "Invalid range: each 'to' must be after its 'from'; 'to' is exclusive.");
    const filters = { customerId: q.customerId, category: q.category, basket: q.basket, mcc: q.mcc, limit: 31 };
    const [a, b] = await Promise.all([
      this.breakdown({ ...filters, from: q.fromA, to: q.toA, groupBy: "category" }),
      this.breakdown({ ...filters, from: q.fromB, to: q.toB, groupBy: "category" }),
    ]);
    const aBy = new Map(a.rows.map((r) => [r.key, r.spent]));
    const bBy = new Map(b.rows.map((r) => [r.key, r.spent]));
    const categories = new Set([...aBy.keys(), ...bBy.keys()]);
    const movers = [...categories]
      .map((c) => ({ category: c, a: aBy.get(c) ?? 0, b: bBy.get(c) ?? 0, diff: round2((bBy.get(c) ?? 0) - (aBy.get(c) ?? 0)) }))
      .sort((x, y) => Math.abs(y.diff) - Math.abs(x.diff))
      .slice(0, 5);
    const diff = round2(b.total - a.total);
    return {
      periodA: { from: q.fromA, to: q.toA, total: a.total },
      periodB: { from: q.fromB, to: q.toB, total: b.total },
      diff,
      changePct: a.total > 0 ? Math.round((diff / a.total) * 1000) / 10 : null,
      topMovers: movers,
    };
  },

  /** Khoản chi lặp lại đều (tiền nhà, hóa đơn, đăng ký, cửa hàng quen) trong 6 tháng trọn vẹn gần nhất. */
  async recurring(customerId: string) {
    const months = lastNMonths(MONTHS);
    const [rows, monthly] = await Promise.all([
      exploreRepository.monthlyByPayee(customerId, months[0], monthStart(0)),
      spendingRepository.monthlyByBasket(customerId, months[0]),
    ]);
    const groups = new Map<string, typeof rows>();
    for (const r of rows) {
      const k = `${r.payee}|${r.category}|${r.txType}`;
      groups.set(k, [...(groups.get(k) ?? []), r]);
    }
    const items = [...groups.values()]
      .filter((g) => g.length >= 4) // xuất hiện ít nhất 4 trong 6 tháng
      .map((g) => {
        const amounts = g.map((r) => r.amount);
        const avg = mean(amounts);
        const first = g[0];
        const name =
          first.txType === "housing_payment" ? "Housing payment" :
          first.txType === "utilities_payment" ? "Utilities" :
          `${mccLabel(first.mcc) ?? first.category} (${first.payee})`;
        return {
          name,
          category: first.category,
          avgMonthly: round2(avg),
          monthsSeen: g.length,
          typicalDay: Math.round(mean(g.map((r) => r.dom))),
          cv: avg > 0 ? stdev(amounts) / avg : 1,
        };
      })
      .filter((i) => i.cv < 0.35) // số tiền ổn định
      .sort((x, y) => y.avgMonthly - x.avgMonthly)
      .map(({ cv: _cv, ...i }) => i);
    const monthlyTotal = round2(items.reduce((s, i) => s + i.avgMonthly, 0));
    const avgSpend = monthly.filter((r) => r.month < monthStart(0)).reduce((s, r) => s + r.spent, 0) / MONTHS;
    return {
      items: items.slice(0, 12),
      monthlyTotal,
      shareOfSpendingPct: avgSpend > 0 ? Math.round((monthlyTotal / avgSpend) * 1000) / 10 : 0,
    };
  },

  /** Thu nhập 6 tháng gần nhất (lương + thu nhập khác), độ ổn định và số tiền đã đầu tư. */
  async incomeSummary(customerId: string) {
    const customer = await customersRepository.findWithStats(customerId);
    if (!customer) throw new HttpError(404, `Customer ${customerId} not found`);
    const months = lastNMonths(MONTHS);
    const rows = await exploreRepository.monthlyIncome(customerId, months[0], monthStart(0));
    const byMonth = new Map(rows.map((r) => [r.month, r]));
    const series = months.map((m) => {
      const r = byMonth.get(m.slice(0, 7));
      return {
        month: m.slice(0, 7),
        salary: round2(r?.salary ?? 0),
        otherIncome: round2(r?.otherIncome ?? 0),
        income: round2((r?.salary ?? 0) + (r?.otherIncome ?? 0)),
        invested: round2(r?.invested ?? 0),
      };
    });
    const incomes = series.map((s) => s.income);
    const avg = mean(incomes);
    const cv = avg > 0 ? stdev(incomes) / avg : 0;
    return {
      months: series,
      avgMonthlyIncome: round2(avg),
      minMonthlyIncome: Math.min(...incomes),
      maxMonthlyIncome: Math.max(...incomes),
      stability: cv < 0.25 ? "steady" : "variable",
      avgSalary: customer.avgSalary,
      typicalPaydayDayOfMonth: customer.paydayDom,
      avgInvestedPerMonth: round2(mean(series.map((s) => s.invested))),
    };
  },
};

function merchantLabel(key: string, mcc: number | null) {
  return `${mccLabel(mcc) ?? "Shop"} (${key})`;
}
