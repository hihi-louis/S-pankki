import type { Basket, SummaryResponse } from "@sbank/shared";
import { HttpError } from "../../lib/errors.js";
import { lastNMonths, monthStart, nextPayday, TODAY } from "../../lib/dates.js";
import { customersRepository } from "../customers/customers.repository.js";
import { basketsRepository } from "./baskets.repository.js";

const BASKET_NAMES: Record<1 | 2 | 3, string> = {
  1: "Regular essentials",
  2: "Unexpected necessities",
  3: "Everyday spending",
};
const BASKET_IDS = [1, 2, 3] as const;
const TOP_CATEGORIES = 3;
const AVG_MONTHS = 6;

const round2 = (n: number) => Math.round(n * 100) / 100;

export const basketsService = {
  async getSummary(customerId: string): Promise<SummaryResponse> {
    const customer = await customersRepository.findWithStats(customerId);
    if (!customer) throw new HttpError(404, `Customer ${customerId} not found`);

    const thisMonth = monthStart(0);
    const history = lastNMonths(AVG_MONTHS); // 6 tháng đầy đủ trước tháng này
    const [current, past, categories] = await Promise.all([
      basketsRepository.spentByBasket(customerId, thisMonth, monthStart(1)),
      basketsRepository.spentByBasket(customerId, history[0], thisMonth),
      basketsRepository.categoriesInMonth(customerId, thisMonth),
    ]);

    const baskets: Basket[] = BASKET_IDS.map((id) => ({
      id,
      name: BASKET_NAMES[id],
      spent: round2(current.find((r) => r.basket === id)?.spent ?? 0),
      avg6m: round2((past.find((r) => r.basket === id)?.spent ?? 0) / AVG_MONTHS),
      top: categories
        .filter((c) => c.basket === id)
        .slice(0, TOP_CATEGORIES)
        .map((c) => ({ category: c.category, spent: round2(c.spent) })),
    }));

    return {
      month: thisMonth.slice(0, 7),
      asOf: TODAY,
      balance: customer.balance ?? 0,
      nextPayday: {
        date: nextPayday(customer.paydayDom ?? 1),
        expected: customer.avgSalary ?? 0,
      },
      baskets,
    };
  },
};
