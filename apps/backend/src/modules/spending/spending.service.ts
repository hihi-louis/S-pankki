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
    return {
      total: Math.round(summary.total * 100) / 100,
      count: summary.count,
      period: { from: q.from, to: q.to },
      sources,
      sourcesTotal: summary.count,
    };
  },
};
