import { daysBetween } from "../../lib/dates.js";
import { HttpError } from "../../lib/errors.js";
import { spendingRepository } from "./spending.repository.js";
import type { SpendingQuery } from "./spending.schema.js";

export const spendingService = {
  async getSpending(q: SpendingQuery) {
    if (q.to <= q.from) throw new HttpError(400, `Invalid range: 'to' (${q.to}) must be after 'from' (${q.from}); 'to' is exclusive.`);
    const [summary, sources] = await Promise.all([
      spendingRepository.total(q),
      spendingRepository.sources(q, 20),
    ]);
    const total = Math.round(summary.total * 100) / 100;
    const days = Math.max(1, daysBetween(q.from, q.to));
    const r2 = (n: number) => Math.round(n * 100) / 100;
    return {
      total,
      count: summary.count,
      period: { from: q.from, to: q.to },
      // Sẵn các con số "đời thường" để model trích dẫn thay vì tự chia (số tự tính sẽ bị bộ kiểm chứng loại)
      perDay: r2(total / days),
      perWeek: r2((total / days) * 7),
      averagePerTransaction: summary.count > 0 ? r2(total / summary.count) : 0,
      sources,
      sourcesTotal: summary.count,
    };
  },
};
