import type {
  BasketTransactions,
  CategoryDive,
  CategoryRow,
  InsightStory,
  Snapshot,
  StoryAction,
} from "@sbank/shared";
import { HttpError } from "../../lib/errors.js";
import {
  daysBetween,
  lastNMonths,
  monthStart,
  shortDate,
  TODAY,
} from "../../lib/dates.js";
import { eur0 } from "../../lib/finance.js";
import { mccLabel } from "../../lib/mcc.js";
import { basketsService } from "../baskets/baskets.service.js";
import { benchmarkRepository } from "../benchmark/benchmark.repository.js";
import { benchmarkService } from "../benchmark/benchmark.service.js";
import { categoryHistory } from "../insights/usual.js";
import { coachService } from "../coach/coach.service.js";
import { customersRepository } from "../customers/customers.repository.js";
import {
  exploreExtras,
  exploreRepository,
} from "../explore/explore.repository.js";
import { spendingRepository } from "../spending/spending.repository.js";
import { exploreService } from "../explore/explore.service.js";

const MONTHS = 6;
const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const BASKET_NAMES: Record<1 | 2 | 3, string> = {
  1: "Regular essentials",
  2: "Unexpected necessities",
  3: "Everyday spending",
};
/** Danh mục S-Pankki tương ứng với nhóm so sánh của Statistics Finland (những nhóm khớp rõ ràng). */
const PEER_KEY: Record<string, string> = {
  Groceries: "groceries",
  Restaurants: "restaurants",
  Transportation: "transport",
  Entertainment: "recreation",
  Health: "health",
};

/** What "Apply to my plans" does for a basket: everyday spending lowers the weekly limit; the freed amount always goes to a goal. */
const applyDetail = (basket: 1 | 2 | 3, perMonth: number) =>
  basket === 3
    ? `Lowers your weekly limit for everyday spending by about ${eur0(
        perMonth / 4.33
      )} and adds ${eur0(perMonth)} a month to your savings goal.`
    : `Adds ${eur0(perMonth)} a month to your savings goal.`;

const human = (category: string) => category.replace("&", "and").toLowerCase();
const monthName = (yyyyMm: string) =>
  MONTH_NAMES[Number(yyyyMm.slice(5, 7)) - 1];
const pct = (diff: number, base: number) =>
  base > 0 ? Math.round((diff / base) * 100) : null;
const signed = (n: number) => `${n >= 0 ? "+" : "-"}${eur0(Math.abs(n))}`;

async function ensureCustomer(customerId: string) {
  const c = await customersRepository.findWithStats(customerId);
  if (!c) throw new HttpError(404, `Customer ${customerId} not found`);
  return c;
}

/** Chi tiêu từng danh mục: tháng này, mức thường lệ (trung vị 3 tháng đầy đủ gần nhất), và giỏ của nó. */
async function categoryRows(customerId: string): Promise<CategoryRow[]> {
  const months = lastNMonths(MONTHS);
  const [hist, baskets] = await Promise.all([
    categoryHistory(customerId),
    exploreExtras.basketByCategory(customerId, months[0], monthStart(1)),
  ]);
  return [...new Set([...hist.now.keys(), ...hist.usual.keys()])]
    .map((category) => {
      const n = hist.now.get(category) ?? 0;
      const usual = hist.usual.get(category) ?? 0;
      return {
        category,
        basket: baskets.get(category) ?? 3,
        now: Math.round(n * 100) / 100,
        usual: Math.round(usual * 100) / 100,
        diffPct: pct(n - usual, usual),
      } satisfies CategoryRow;
    })
    .sort((a, b) => b.now - a.now);
}

/** Dòng "tháng này" theo từng tháng của một danh mục (bảy cột: sáu tháng trước và tháng này). */
async function trendOf(customerId: string, category: string) {
  const months = [...lastNMonths(MONTHS), monthStart(0)];
  const r = await exploreService.breakdown({
    customerId,
    from: months[0],
    to: monthStart(1),
    groupBy: "month",
    category,
    basket: undefined,
    mcc: undefined,
    limit: 8,
  });
  const by = new Map(r.rows.map((x) => [x.key, x.spent]));
  return months.map((m) => ({
    label: MONTH_NAMES[Number(m.slice(5, 7)) - 1].slice(0, 3),
    value: by.get(m.slice(0, 7)) ?? 0,
  }));
}

/** "MRC-RES-0049" becomes "Fast food & café #49": the real merchant names are not in the data. */
const shopNo = (merchantId: string) =>
  `#${Number(merchantId.split("-").pop()) || merchantId}`;
const shopLabel = (
  mcc: number | null,
  merchantId: string | null,
  category: string
) =>
  merchantId
    ? `${mccLabel(mcc) ?? category} ${shopNo(merchantId)}`
    : `${category} payment`;

export const storyService = {
  /** Tháng ở một cái nhìn: tổng chi so với thường lệ, thu nhập, và các danh mục. */
  async snapshot(customerId: string): Promise<Snapshot> {
    await ensureCustomer(customerId);
    const [summary, categories, incomeRows] = await Promise.all([
      basketsService.getSummary(customerId),
      categoryRows(customerId),
      exploreRepository.monthlyIncome(customerId, monthStart(0), monthStart(1)),
    ]);
    const spent = summary.baskets.reduce((s, b) => s + b.spent, 0);
    const usual = summary.baskets.reduce((s, b) => s + b.avg6m, 0);
    const income =
      (incomeRows[0]?.salary ?? 0) + (incomeRows[0]?.otherIncome ?? 0);
    const vs = pct(spent - usual, usual);
    const month = monthName(summary.month);
    const message =
      vs === null
        ? `You spent ${eur0(spent)} in ${month}.`
        : `You spent ${eur0(spent)} in ${month}, ${Math.abs(vs)}% ${
            vs >= 0 ? "more" : "less"
          } than a normal month.`;
    return {
      month: summary.month,
      asOf: TODAY,
      income: Math.round(income),
      spent: Math.round(spent),
      net: Math.round(income - spent),
      usualSpent: Math.round(usual),
      vsUsualPct: vs,
      message,
      categories,
    };
  },

  /** Một danh mục chi tiết: xu hướng, nơi tiền đi, các khoản mua lớn nhất, và so với người cùng tuổi nếu so sánh được. */
  async categoryDive(
    customerId: string,
    categoryInput: string
  ): Promise<CategoryDive> {
    await ensureCustomer(customerId);
    const rows = await categoryRows(customerId);
    const row = rows.find(
      (r) => r.category.toLowerCase() === categoryInput.toLowerCase()
    );
    if (!row)
      throw new HttpError(404, `No spending in category ${categoryInput}`);
    const category = row.category;
    const [trend, shops, biggest, peers] = await Promise.all([
      trendOf(customerId, category),
      exploreService.breakdown({
        customerId,
        from: monthStart(0),
        to: monthStart(1),
        groupBy: "merchant",
        category,
        basket: undefined,
        mcc: undefined,
        limit: 6,
      }),
      exploreExtras.biggest(
        customerId,
        monthStart(0),
        monthStart(1),
        category,
        5
      ),
      PEER_KEY[category]
        ? benchmarkService.compare({
            customerId,
            topic: PEER_KEY[category] as never,
          })
        : null,
    ]);
    const peer = peers?.rows[0];
    return {
      category,
      basket: row.basket,
      basketName: BASKET_NAMES[row.basket],
      now: row.now,
      usual: row.usual,
      diffPct: row.diffPct,
      trend,
      merchants: shops.rows.map((s) => ({
        label: s.label,
        spent: s.spent,
        sharePct: s.sharePct,
        count: s.count,
      })),
      biggest: biggest.map((b) => ({
        date: b.date,
        amount: Math.abs(b.amount),
        label: shopLabel(b.mcc, b.merchantId, category),
      })),
      peers:
        peer && peers
          ? {
              you: peer.you,
              peers: peer.peers,
              peerGroup: peers.peerGroup,
              source: peers.source,
            }
          : null,
    };
  },

  /** The purchases behind one basket this month, grouped by category (biggest first). */
  async basketTransactions(
    customerId: string,
    basket: 1 | 2 | 3
  ): Promise<BasketTransactions> {
    await ensureCustomer(customerId);
    const f = {
      customerId,
      from: monthStart(0),
      to: monthStart(1),
      basket,
      category: undefined,
      mcc: undefined,
    };
    const LIMIT = 500;
    const [sum, rows] = await Promise.all([
      spendingRepository.total(f),
      spendingRepository.sources(f, LIMIT),
    ]);
    const by = new Map<
      string,
      {
        category: string;
        total: number;
        count: number;
        items: { date: string; amount: number; label: string }[];
      }
    >();
    for (const r of rows) {
      const g = by.get(r.category) ?? {
        category: r.category,
        total: 0,
        count: 0,
        items: [],
      };
      const amount = Math.abs(Number(r.amount));
      g.total += amount;
      g.count += 1;
      g.items.push({
        date: String(r.date).slice(0, 10),
        amount,
        label: shopLabel(
          r.mcc ? Number(r.mcc) : null,
          r.merchantId,
          r.category
        ),
      });
      by.set(r.category, g);
    }
    return {
      basket,
      basketName: BASKET_NAMES[basket],
      month: monthStart(0).slice(0, 7),
      total: Math.round(sum.total * 100) / 100,
      count: sum.count,
      truncated: sum.count > rows.length,
      categories: [...by.values()]
        .map((g) => ({ ...g, total: Math.round(g.total * 100) / 100 }))
        .sort((a, b) => b.total - a.total),
    };
  },

  /** Câu chuyện bốn bước đằng sau một thẻ insight: chuyện gì xảy ra, vì sao, nghĩa là gì, làm gì tiếp. */
  async insightStory(customerId: string, id: string): Promise<InsightStory> {
    await ensureCustomer(customerId);
    if (id.startsWith("spike-"))
      return this.spikeStory(customerId, id.slice(6));
    if (id.startsWith("drop-")) return this.dropStory(customerId, id.slice(5));
    if (id === "runway-short" || id === "runway-ok")
      return this.runwayStory(customerId, id);
    if (id === "income-variable") return this.incomeStory(customerId);
    if (id === "saving-habit") return this.savingStory(customerId);
    if (id.startsWith("peer-")) return this.peerStory(customerId, id.slice(5));
    if (id === "fixed-costs") return this.fixedStory(customerId);
    if (id.startsWith("trim-")) return this.trimStory(customerId, id.slice(5));
    if (id.startsWith("weekday-"))
      return this.weekdayStory(customerId, id.slice(8));
    if (id === "last-month") return this.lastMonthStory(customerId);
    throw new HttpError(404, `Unknown insight ${id}`);
  },

  async spikeStory(
    customerId: string,
    category: string
  ): Promise<InsightStory> {
    const dive = await this.categoryDive(customerId, category);
    const [income, plan] = await Promise.all([
      exploreService.incomeSummary(customerId),
      coachService.safeToSave(customerId),
    ]);
    const diff = dive.now - dive.usual;
    const name = human(dive.category);
    const topShop = dive.merchants[0];
    const share =
      income.avgMonthlyIncome > 0
        ? Math.round((dive.now / income.avgMonthlyIncome) * 100)
        : null;
    const trim = (p: number): StoryAction => {
      const cut = Math.round(dive.usual * (p / 100));
      return {
        id: `trim-${p}`,
        label: `Spend ${p}% less than usual`,
        detail: applyDetail(dive.basket, cut),
        savingPerMonth: cut,
        apply: { basket: dive.basket, reduceBy: cut },
      };
    };
    const actions: StoryAction[] = [
      {
        id: "back-to-usual",
        label: "Go back to your normal",
        detail: `A normal month is ${eur0(
          dive.usual
        )}, so this month cost ${eur0(
          diff
        )} more. That is a one-off difference, not a monthly saving.`,
      },
    ];
    if (dive.usual >= 40) actions.push(trim(10), trim(20));
    return {
      id: `spike-${dive.category}`,
      tone: "alert",
      title: `You spent ${eur0(diff)} more than usual on ${name}`,
      happened: {
        title: "What happened",
        text: `You spent ${eur0(dive.now)} on ${name} in ${monthName(
          monthStart(0).slice(0, 7)
        )}. ${
          dive.usual < 10
            ? "In an average month you spend almost nothing on it."
            : `In a normal month it is about ${eur0(dive.usual)}.`
        }`,
        rows: [
          { label: "This month", value: eur0(dive.now) },
          {
            label: "A normal month (typical of the last 3)",
            value: eur0(dive.usual),
          },
          {
            label: "Difference",
            value: `${signed(diff)}${
              dive.diffPct !== null
                ? ` (${dive.diffPct >= 0 ? "+" : ""}${dive.diffPct}%)`
                : ""
            }`,
            tone: "warn",
          },
        ],
        chart: {
          type: "bar",
          title: `${dive.category} by month (€)`,
          data: dive.trend,
        },
      },
      why: {
        title: "Why it happened",
        text: topShop
          ? `Most of it went to ${topShop.label} (${eur0(
              topShop.spent
            )}). These are the biggest items. They show where the money went, not why.`
          : "Here are the biggest purchases. They show where the money went, not why.",
        rows: [
          ...dive.merchants.slice(0, 3).map((m) => ({
            label: m.label,
            value: `${eur0(m.spent)} (${m.sharePct}%)`,
          })),
          ...dive.biggest.slice(0, 3).map((b) => ({
            label: `Largest purchase, ${shortDate(b.date)}`,
            value: eur0(b.amount),
          })),
        ],
      },
      means: {
        title: "What it means",
        text: `If every month looked like this, you would spend about ${eur0(
          diff * 12
        )} more a year. One month like this is often a one-off, so see if it happens again next month.`,
        rows: [
          ...(share !== null
            ? [
                {
                  label: "How much of your monthly pay this is",
                  value: `${share}%`,
                },
              ]
            : []),
          { label: "Group", value: BASKET_NAMES[dive.basket] },
          ...(dive.peers
            ? [
                {
                  label: `${dive.peers.peerGroup} spend about`,
                  value: `${eur0(dive.peers.peers)} a month`,
                },
              ]
            : []),
          {
            label: "You could set aside right now",
            value: eur0(plan.safeToSave),
          },
        ],
      },
      next: {
        text:
          actions.length > 1
            ? "Pick one and I will add it to your plans."
            : "A one-off like this is usually not worth a limit: watch whether it repeats next month.",
        actions,
      },
      askAI: `What did I spend on ${name} this month?`,
    };
  },

  async dropStory(customerId: string, category: string): Promise<InsightStory> {
    const dive = await this.categoryDive(customerId, category);
    const saved = dive.usual - dive.now;
    const name = human(dive.category);
    return {
      id: `drop-${dive.category}`,
      tone: "good",
      title: `You spent ${eur0(saved)} less than usual on ${name}`,
      happened: {
        title: "What happened",
        text: `You spent ${eur0(
          dive.now
        )} on ${name} this month. In a normal month it is about ${eur0(
          dive.usual
        )}.`,
        rows: [
          { label: "This month", value: eur0(dive.now) },
          { label: "A normal month", value: eur0(dive.usual) },
          {
            label: "Difference",
            value: signed(dive.now - dive.usual),
            tone: "good",
          },
        ],
        chart: {
          type: "bar",
          title: `${dive.category} by month (€)`,
          data: dive.trend,
        },
      },
      why: {
        title: "Why it happened",
        text:
          dive.biggest.length === 0
            ? "There were very few purchases in this category this month."
            : dive.biggest[0].amount < Math.max(50, dive.usual * 0.35)
            ? "No big one-off costs this month. The largest purchases are below."
            : "The largest purchases this month are below. They show how the month was made up, not why.",
        rows: dive.biggest.slice(0, 3).map((b) => ({
          label: `${b.label}, ${shortDate(b.date)}`,
          value: eur0(b.amount),
        })),
      },
      means: {
        title: "What it means",
        text: `If every month were like this, you would keep about ${eur0(
          saved * 12
        )} a year. One light month can also just be timing, so look at the chart before changing habits.`,
      },
      next: {
        text: "Good months are the best time to save.",
        actions: [
          {
            id: "plan",
            label: "Move it to savings",
            detail: "See how much you can safely set aside now.",
            link: "plan",
          },
        ],
      },
      askAI: "How much can I safely save right now?",
    };
  },

  /** "Try it": what a 10, 20 or 30% trim of one flexible category is worth, with buttons that add the limit to the plan. */
  async trimStory(
    customerId: string,
    categoryInput: string
  ): Promise<InsightStory> {
    const dive = await this.categoryDive(customerId, categoryInput);
    const name = human(dive.category);
    const cutOf = (p: number) => Math.round(dive.usual * (p / 100));
    const actions: StoryAction[] = [10, 20, 30].map((p) => ({
      id: `trim-${p}`,
      label: `Spend ${p}% less on ${name}`,
      detail: `${eur0(cutOf(p))} a month, about ${eur0(
        cutOf(p) * 12
      )} a year. ${applyDetail(dive.basket, cutOf(p))}`,
      savingPerMonth: cutOf(p),
      apply: { basket: dive.basket, reduceBy: cutOf(p) },
    }));
    return {
      id: `trim-${dive.category}`,
      tone: "info",
      title: `Trimming ${name} by 20% could free about ${eur0(
        cutOf(20) * 12
      )} a year`,
      happened: {
        title: "What happened",
        text: `${
          dive.category
        } is your biggest flexible cost. In a normal month you spend about ${eur0(
          dive.usual
        )} on it.`,
        rows: [
          { label: "A normal month", value: eur0(dive.usual) },
          { label: "This month", value: eur0(dive.now) },
        ],
        chart: {
          type: "bar",
          title: `${dive.category} by month (€)`,
          data: dive.trend,
        },
      },
      why: {
        title: "Why this one",
        text: "It is the largest spending you can change without touching bills or health costs. These are the places the money goes.",
        rows: dive.merchants.slice(0, 3).map((m) => ({
          label: m.label,
          value: `${eur0(m.spent)} (${m.sharePct}%)`,
        })),
      },
      means: {
        title: "What it means",
        text: `Spending 20% less is ${eur0(cutOf(20))} a month, or about ${eur0(
          cutOf(20) * 12
        )} a year. It is a small change, not a promise: your own months will vary.`,
        rows: [10, 20, 30].map((p) => ({
          label: `${p}% less`,
          value: `${eur0(cutOf(p))} a month`,
        })),
      },
      next: { text: "Pick one and I will add it to your plans.", actions },
      askAI: `What if I cut ${name} by 20%?`,
    };
  },

  /** "Show me why" for a weekday pattern: spending by day of the week in everyday spending, last 3 full months. */
  async weekdayStory(customerId: string, day: string): Promise<InsightStory> {
    const r = await exploreService.breakdown({
      customerId,
      from: lastNMonths(3)[0],
      to: monthStart(0),
      groupBy: "weekday",
      basket: 3,
      category: undefined,
      mcc: undefined,
      limit: 7,
    });
    const row = r.rows.find((x) => x.key.toLowerCase() === day.toLowerCase());
    if (!row) throw new HttpError(404, `No spending on ${day}`);
    const perMonth = row.spent / 3;
    const cut = Math.round(perMonth * 0.2);
    const each = row.count > 0 ? row.spent / row.count : 0;
    const actions: StoryAction[] =
      cut >= 5
        ? [
            {
              id: "trim-weekday",
              label: `Spend 20% less on ${row.key}s`,
              detail: `About ${eur0(cut)} a month. ${applyDetail(3, cut)}`,
              savingPerMonth: cut,
              apply: { basket: 3, reduceBy: cut },
            },
          ]
        : [];
    return {
      id: `weekday-${row.key}`,
      tone: "tip",
      title: `${row.key}s cost you the most: ${Math.round(
        row.sharePct
      )}% of everyday spending`,
      happened: {
        title: "What happened",
        text: `Over the last 3 months, ${eur0(row.spent)} of your ${eur0(
          r.total
        )} everyday spending (restaurants, fun, shopping, taxis) happened on ${
          row.key
        }s.`,
        rows: r.rows.map((x) => ({
          label: x.key,
          value: `${eur0(x.spent)} (${Math.round(x.sharePct)}%)`,
          tone: x.key === row.key ? ("warn" as const) : undefined,
        })),
        chart: {
          type: "bar",
          title: "Everyday spending by day, last 3 months (€)",
          data: r.rows.map((x) => ({
            label: x.key.slice(0, 3),
            value: x.spent,
          })),
        },
      },
      why: {
        title: "Why it happened",
        text: `You made ${row.count} purchases on ${row.key}s, about ${eur0(
          each
        )} each. The data shows when you spend, not why: plans with friends or payday habits are common reasons.`,
      },
      means: {
        title: "What it means",
        text: `${row.key}s are about ${eur0(
          perMonth
        )} of your month. A day with a plan (a limit or a free ${
          row.key
        }) is easier than watching every purchase.`,
        rows:
          cut >= 5
            ? [
                {
                  label: `Spending 20% less on ${row.key}s`,
                  value: `${eur0(cut)} a month`,
                  tone: "good",
                },
              ]
            : undefined,
      },
      next: {
        text:
          cut >= 5
            ? "Try a small limit for that day."
            : "Nothing to change right now: watch how it looks next month.",
        actions,
      },
      askAI: `Where do I spend money on ${row.key}s?`,
    };
  },

  /** For customers with under 3 full months of history: where last month's money went, without inventing a "usual". */
  async lastMonthStory(customerId: string): Promise<InsightStory> {
    const from = lastNMonths(1)[0];
    const by = await benchmarkRepository.spentByCategory(
      customerId,
      from,
      monthStart(0)
    );
    const rows = [...by.entries()].sort((a, b) => b[1] - a[1]);
    const total = rows.reduce((s, [, v]) => s + v, 0);
    return {
      id: "last-month",
      tone: "info",
      title: `You spent ${eur0(total)} last month`,
      happened: {
        title: "What happened",
        text: `Here is where your money went in ${monthName(
          from.slice(0, 7)
        )}.`,
        rows: rows.slice(0, 6).map(([c, v]) => ({
          label: c,
          value: `${eur0(v)} (${
            total > 0 ? Math.round((v / total) * 100) : 0
          }%)`,
        })),
      },
      why: {
        title: "Why it happened",
        text: "The list shows where the money went, not why.",
      },
      means: {
        title: "What it means",
        text: "There are not three full months of history yet, so I cannot say what is normal for you. Come back next month for comparisons.",
      },
      next: { text: "Ask me anything about your spending.", actions: [] },
      askAI: "Where did my money go last month?",
    };
  },

  async runwayStory(customerId: string, id: string): Promise<InsightStory> {
    const [safe, rec, summary, fc] = await Promise.all([
      coachService.safeToSpend(customerId),
      exploreService.recurring(customerId),
      basketsService.getSummary(customerId),
      coachService.forecast(customerId),
    ]);
    const short = safe.shortfall > 0;
    // Not short on bills alone, but the usual pace would still empty the account before payday
    const paceDays =
      !short && fc.runsOutOn
        ? daysBetween(fc.runsOutOn, safe.nextPayday.date)
        : 0;
    const usualPerDay =
      ((summary.baskets.find((b) => b.id === 2)?.avg6m ?? 0) +
        (summary.baskets.find((b) => b.id === 3)?.avg6m ?? 0)) /
      30;
    const guess = safe.paydayIsEstimate
      ? " Your payday date is a guess because your pay days change."
      : "";
    return {
      id,
      tone: short || paceDays > 0 ? "alert" : "info",
      title: short
        ? "You may run short before payday"
        : paceDays > 0
        ? `Your money may run out ${paceDays} day${
            paceDays === 1 ? "" : "s"
          } before payday`
        : `You can spend about ${eur0(safe.perDay)} a day`,
      happened: {
        title: "What happened",
        text: `You have ${eur0(safe.balance)} and payday is ${shortDate(
          safe.nextPayday.date
        )}, ${safe.daysLeft} days away.${guess}`,
        rows: [
          { label: "Balance", value: eur0(safe.balance) },
          {
            label: "Next payday",
            value: `${shortDate(safe.nextPayday.date)} (about ${eur0(
              safe.nextPayday.expected
            )})`,
          },
          { label: "Days left", value: `${safe.daysLeft}` },
        ],
      },
      why: {
        title: "Why it happened",
        text: `About ${eur0(
          safe.reservedEssentials
        )} of your balance is already spoken for: bills and basics you usually pay before payday.`,
        rows: rec.items.slice(0, 4).map((i) => ({
          label: `${i.name} (usually around day ${i.typicalDay})`,
          value: eur0(i.avgMonthly),
        })),
      },
      means: {
        title: "What it means",
        text: short
          ? `After your bills and basics you could be ${eur0(
              safe.shortfall
            )} short, so extras should wait until payday.`
          : paceDays > 0
          ? `At your usual pace the balance could reach zero around ${shortDate(
              fc.runsOutOn!
            )}. Staying under ${eur0(
              safe.perDay
            )} a day keeps you above zero until payday.`
          : `You can spend about ${eur0(
              safe.perDay
            )} a day. Most days you spend about ${eur0(
              usualPerDay
            )} on extras and surprises.`,
        rows: [
          {
            label: "Safe to spend until payday",
            value: eur0(safe.safeToSpend),
            tone: short ? "warn" : "good",
          },
          {
            label: "What you usually spend a day on extras",
            value: eur0(usualPerDay),
            tone: usualPerDay > safe.perDay ? "warn" : undefined,
          },
        ],
      },
      next: {
        text: "See how your balance moves day by day, or set limits so you stay inside the safe amount.",
        actions: [
          {
            id: "forecast",
            label: "See the forecast",
            detail: "Your balance day by day until payday.",
            link: "forecast",
          },
          {
            id: "plan",
            label: "Make a spending plan",
            detail: "Limits that keep you above your bills and basics.",
            link: "plan",
          },
        ],
      },
      askAI: "What can I safely spend this week?",
    };
  },

  async incomeStory(customerId: string): Promise<InsightStory> {
    const inc = await exploreService.incomeSummary(customerId);
    const gap = inc.avgMonthlyIncome - inc.minMonthlyIncome;
    return {
      id: "income-variable",
      tone: "tip",
      title: "Your pay changes a lot from month to month",
      happened: {
        title: "What happened",
        text: `Over six months your income ranged from ${eur0(
          inc.minMonthlyIncome
        )} to ${eur0(inc.maxMonthlyIncome)} a month.`,
        rows: [
          { label: "Average", value: `${eur0(inc.avgMonthlyIncome)} / month` },
          {
            label: "Lowest month",
            value: eur0(inc.minMonthlyIncome),
            tone: "warn",
          },
          { label: "Highest month", value: eur0(inc.maxMonthlyIncome) },
        ],
        chart: {
          type: "bar",
          title: "Income by month (€)",
          data: inc.months.map((m) => ({
            label: MONTH_NAMES[Number(m.month.slice(5, 7)) - 1].slice(0, 3),
            value: m.income,
          })),
        },
      },
      why: {
        title: "Why it happened",
        text: "Your pay comes from salary plus other income, and the other income is irregular.",
        rows: [
          {
            label: "Average salary",
            value: inc.avgSalary ? `${eur0(inc.avgSalary)} / month` : "n/a",
          },
          {
            label: "Invested per month on average",
            value: eur0(inc.avgInvestedPerMonth),
          },
        ],
      },
      means: {
        title: "What it means",
        text: `In a low month you get about ${eur0(
          gap
        )} less than your average, while bills stay the same.`,
      },
      next: {
        text: `Setting aside about ${eur0(
          gap
        )} in good months would cover a low one.`,
        actions: [
          {
            id: "plan",
            label: "Build a plan with a buffer",
            detail: "A plan based on your averages, with room for lean months.",
            link: "plan",
          },
        ],
      },
      askAI: "How steady is my income?",
    };
  },

  async savingStory(customerId: string): Promise<InsightStory> {
    const [inc, save] = await Promise.all([
      exploreService.incomeSummary(customerId),
      coachService.safeToSave(customerId),
    ]);
    return {
      id: "saving-habit",
      tone: "good",
      title: `You put aside about ${eur0(inc.avgInvestedPerMonth)} a month`,
      happened: {
        title: "What happened",
        text: `You moved money into investments in most of the last six months, about ${eur0(
          inc.avgInvestedPerMonth
        )} a month.`,
        chart: {
          type: "bar",
          title: "Put aside by month (€)",
          data: inc.months.map((m) => ({
            label: MONTH_NAMES[Number(m.month.slice(5, 7)) - 1].slice(0, 3),
            value: Math.max(0, m.invested),
          })),
        },
      },
      why: {
        title: "Why it matters",
        text: "Saving the same amount regularly works better than saving a lot once in a while.",
      },
      means: {
        title: "What it means",
        text:
          save.monthsOfEssentialsCovered !== null
            ? `Your balance would cover your bills and basics for about ${save.monthsOfEssentialsCovered} months.`
            : "Your balance is your cushion.",
        rows: [
          {
            label: "Safety cushion target (3 months of bills and basics)",
            value: eur0(save.emergencyFundTarget),
          },
          {
            label: "Gap to the target",
            value: eur0(save.emergencyFundGap),
            tone: save.emergencyFundGap > 0 ? "warn" : "good",
          },
        ],
      },
      next: {
        text: `You could safely move ${eur0(save.safeToSave)} right now.`,
        actions: [
          {
            id: "plan",
            label: "Turn it into a plan",
            detail: "Pick a goal and see how long it takes.",
            link: "plan",
          },
        ],
      },
      askAI: "How much can I safely save right now?",
    };
  },

  async peerStory(customerId: string, key: string): Promise<InsightStory> {
    const r = await benchmarkService.compare({ customerId });
    const row = r.rows.find((x) => x.key === key);
    if (!row) throw new HttpError(404, `No peer comparison for ${key}`);
    const above = row.you > row.peers;
    const diffYear = Math.abs(row.you - row.peers) * 12;
    const others = r.rows
      .filter((x) => x.key !== "total" && x.key !== key)
      .sort((a, b) => Math.abs(b.you - b.peers) - Math.abs(a.you - a.peers))
      .slice(0, 3);
    return {
      id: `peer-${key}`,
      tone: "info",
      title: `You spend ${
        above ? "more" : "less"
      } on ${row.label.toLowerCase()} than most people your age`,
      happened: {
        title: "What happened",
        text: `You spend about ${eur0(
          row.you
        )} a month on ${row.label.toLowerCase()}. ${
          r.peerGroup
        } spend about ${eur0(row.peers)} (${r.source}).`,
        chart: {
          type: "bar",
          title: `${row.label} per month (€)`,
          data: [
            { label: "You", value: row.you },
            { label: "Peers", value: row.peers },
          ],
        },
      },
      why: {
        title: "Why it happened",
        text: "Other categories compared with people your age, for context. A difference is not good or bad by itself.",
        rows: others.map((o) => ({
          label: o.label,
          value: `${eur0(o.you)} vs ${eur0(o.peers)}`,
        })),
      },
      means: {
        title: "What it means",
        text: `The gap is about ${eur0(diffYear)} a year. ${r.note}`,
      },
      next: {
        text: "Use this as a rough guide, then decide whether it matches what matters to you.",
        actions: [
          {
            id: "plan",
            label: "Make a spending plan",
            detail: "Set limits that fit your own priorities.",
            link: "plan",
          },
        ],
      },
      askAI: "How do I compare with other people my age?",
    };
  },

  async fixedStory(customerId: string): Promise<InsightStory> {
    const [rec, inc] = await Promise.all([
      exploreService.recurring(customerId),
      exploreService.incomeSummary(customerId),
    ]);
    const left = inc.avgMonthlyIncome - rec.monthlyTotal;
    return {
      id: "fixed-costs",
      tone: "info",
      title: `About ${Math.round(
        rec.shareOfSpendingPct
      )}% of your spending is fixed bills`,
      happened: {
        title: "What happened",
        text: `Payments that repeat every month come to about ${eur0(
          rec.monthlyTotal
        )}.`,
        rows: rec.items.slice(0, 5).map((i) => ({
          label: `${i.name} (around day ${i.typicalDay})`,
          value: eur0(i.avgMonthly),
        })),
      },
      why: {
        title: "Why it happened",
        text: "These are payments that showed up in at least 4 of the last 6 months with a steady amount.",
      },
      means: {
        title: "What it means",
        text: `After fixed costs you have about ${eur0(
          left
        )} a month of your average income to plan the rest.`,
      },
      next: {
        text: "Knowing your fixed costs makes the rest of the month easier to plan.",
        actions: [
          {
            id: "forecast",
            label: "See the forecast",
            detail: "When these bills leave your account.",
            link: "forecast",
          },
        ],
      },
      askAI: "What are my regular monthly payments?",
    };
  },
};
