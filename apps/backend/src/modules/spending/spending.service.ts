import { spendingRepository } from "./spending.repository.js";
import type { SpendingQuery } from "./spending.schema.js";

export const spendingService = {
  async getSpending(q: SpendingQuery) {
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
