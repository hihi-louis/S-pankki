import type { CategoryDive, CategoryRow, InsightStory, Snapshot, StoryAction } from "@sbank/shared";
import { HttpError } from "../../lib/errors.js";
import { lastNMonths, monthStart, shortDate, TODAY } from "../../lib/dates.js";
import { eur0 } from "../../lib/finance.js";
import { mccLabel } from "../../lib/mcc.js";
import { basketsService } from "../baskets/baskets.service.js";
import { benchmarkRepository } from "../benchmark/benchmark.repository.js";
import { benchmarkService } from "../benchmark/benchmark.service.js";
import { coachService } from "../coach/coach.service.js";
import { customersRepository } from "../customers/customers.repository.js";
import { exploreExtras, exploreRepository } from "../explore/explore.repository.js";
import { exploreService } from "../explore/explore.service.js";

const MONTHS = 6;
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const BASKET_NAMES: Record<1 | 2 | 3, string> = { 1: "Regular essentials", 2: "Unexpected necessities", 3: "Everyday spending" };
/** Danh mục S-Pankki tương ứng với nhóm so sánh của Statistics Finland (những nhóm khớp rõ ràng). */
const PEER_KEY: Record<string, string> = { Groceries: "groceries", Restaurants: "restaurants", Transportation: "transport", Entertainment: "recreation", Health: "health" };

const human = (category: string) => category.replace("&", "and").toLowerCase();
const monthName = (yyyyMm: string) => MONTH_NAMES[Number(yyyyMm.slice(5, 7)) - 1];
const pct = (diff: number, base: number) => (base > 0 ? Math.round((diff / base) * 100) : null);
const signed = (n: number) => `${n >= 0 ? "+" : "-"}${eur0(Math.abs(n))}`;

async function ensureCustomer(customerId: string) {
  const c = await customersRepository.findWithStats(customerId);
  if (!c) throw new HttpError(404, `Customer ${customerId} not found`);
  return c;
}

/** Chi tiêu từng danh mục: tháng này, trung bình 6 tháng, và giỏ của nó. */
async function categoryRows(customerId: string): Promise<CategoryRow[]> {
  const months = lastNMonths(MONTHS);
  const [now, past, baskets] = await Promise.all([
    benchmarkRepository.spentByCategory(customerId, monthStart(0), monthStart(1)),
    benchmarkRepository.spentByCategory(customerId, months[0], monthStart(0)),
    exploreExtras.basketByCategory(customerId, months[0], monthStart(1)),
  ]);
  return [...new Set([...now.keys(), ...past.keys()])]
    .map((category) => {
      const n = now.get(category) ?? 0;
      const usual = (past.get(category) ?? 0) / MONTHS;
      return { category, basket: baskets.get(category) ?? 3, now: Math.round(n * 100) / 100, usual: Math.round(usual * 100) / 100, diffPct: pct(n - usual, usual) } satisfies CategoryRow;
    })
    .sort((a, b) => b.now - a.now);
}

/** Dòng "tháng này" theo từng tháng của một danh mục (bảy cột: sáu tháng trước và tháng này). */
async function trendOf(customerId: string, category: string) {
  const months = [...lastNMonths(MONTHS), monthStart(0)];
  const r = await exploreService.breakdown({ customerId, from: months[0], to: monthStart(1), groupBy: "month", category, basket: undefined, mcc: undefined, limit: 8 });
  const by = new Map(r.rows.map((x) => [x.key, x.spent]));
  return months.map((m) => ({ label: MONTH_NAMES[Number(m.slice(5, 7)) - 1].slice(0, 3), value: by.get(m.slice(0, 7)) ?? 0 }));
}

/** "MRC-RES-0049" becomes "Fast food & café #49": the real merchant names are not in the data. */
const shopNo = (merchantId: string) => `#${Number(merchantId.split("-").pop()) || merchantId}`;
const shopLabel = (mcc: number | null, merchantId: string | null, category: string) =>
  merchantId ? `${mccLabel(mcc) ?? category} ${shopNo(merchantId)}` : `${category} (rent, bills or other)`;

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
    const income = (incomeRows[0]?.salary ?? 0) + (incomeRows[0]?.otherIncome ?? 0);
    const vs = pct(spent - usual, usual);
    const month = monthName(summary.month);
    const message =
      vs === null
        ? `You spent ${eur0(spent)} in ${month}.`
        : `You spent ${eur0(spent)} in ${month}, ${Math.abs(vs)}% ${vs >= 0 ? "more" : "less"} than a normal month.`;
    return { month: summary.month, asOf: TODAY, income: Math.round(income), spent: Math.round(spent), net: Math.round(income - spent), usualSpent: Math.round(usual), vsUsualPct: vs, message, categories };
  },

  /** Một danh mục chi tiết: xu hướng, nơi tiền đi, các khoản mua lớn nhất, và so với người cùng tuổi nếu so sánh được. */
  async categoryDive(customerId: string, categoryInput: string): Promise<CategoryDive> {
    await ensureCustomer(customerId);
    const rows = await categoryRows(customerId);
    const row = rows.find((r) => r.category.toLowerCase() === categoryInput.toLowerCase());
    if (!row) throw new HttpError(404, `No spending in category ${categoryInput}`);
    const category = row.category;
    const [trend, shops, biggest, peers] = await Promise.all([
      trendOf(customerId, category),
      exploreService.breakdown({ customerId, from: monthStart(0), to: monthStart(1), groupBy: "merchant", category, basket: undefined, mcc: undefined, limit: 6 }),
      exploreExtras.biggest(customerId, monthStart(0), monthStart(1), category, 5),
      PEER_KEY[category] ? benchmarkService.compare({ customerId, topic: PEER_KEY[category] as never }) : null,
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
      merchants: shops.rows.map((s) => ({ label: s.label, spent: s.spent, sharePct: s.sharePct, count: s.count })),
      biggest: biggest.map((b) => ({ date: b.date, amount: Math.abs(b.amount), label: shopLabel(b.mcc, b.merchantId, category) })),
      peers: peer && peers ? { you: peer.you, peers: peer.peers, peerGroup: peers.peerGroup, source: peers.source } : null,
    };
  },

  /** Câu chuyện bốn bước đằng sau một thẻ insight: chuyện gì xảy ra, vì sao, nghĩa là gì, làm gì tiếp. */
  async insightStory(customerId: string, id: string): Promise<InsightStory> {
    await ensureCustomer(customerId);
    if (id.startsWith("spike-")) return this.spikeStory(customerId, id.slice(6));
    if (id.startsWith("drop-")) return this.dropStory(customerId, id.slice(5));
    if (id === "runway-short" || id === "runway-ok") return this.runwayStory(customerId, id);
    if (id === "income-variable") return this.incomeStory(customerId);
    if (id === "saving-habit") return this.savingStory(customerId);
    if (id.startsWith("peer-")) return this.peerStory(customerId, id.slice(5));
    if (id === "fixed-costs") return this.fixedStory(customerId);
    throw new HttpError(404, `Unknown insight ${id}`);
  },

  async spikeStory(customerId: string, category: string): Promise<InsightStory> {
    const dive = await this.categoryDive(customerId, category);
    const [income, plan] = await Promise.all([exploreService.incomeSummary(customerId), coachService.safeToSave(customerId)]);
    const diff = dive.now - dive.usual;
    const name = human(dive.category);
    const topShop = dive.merchants[0];
    const share = income.avgMonthlyIncome > 0 ? Math.round((dive.now / income.avgMonthlyIncome) * 100) : null;
    const trim = (p: number): StoryAction => {
      const cut = Math.round(dive.usual * (p / 100));
      return { id: `trim-${p}`, label: `Spend ${p}% less than usual`, detail: `Lowers your monthly limit for ${BASKET_NAMES[dive.basket].toLowerCase()} by ${eur0(cut)} and adds it to what you save.`, savingPerMonth: cut, apply: { basket: dive.basket, reduceBy: cut } };
    };
    const actions: StoryAction[] = [{ id: "back-to-usual", label: "Go back to your normal", detail: `A normal month is ${eur0(dive.usual)}, so this month cost ${eur0(diff)} more. That is a one-off difference, not a monthly saving.` }];
    if (dive.usual >= 40) actions.push(trim(10), trim(20));
    return {
      id: `spike-${dive.category}`,
      tone: "alert",
      title: `You spent ${eur0(diff)} more than usual on ${name}`,
      happened: {
        title: "What happened",
        text: `You spent ${eur0(dive.now)} on ${name} in ${monthName(monthStart(0).slice(0, 7))}. In a normal month it is about ${eur0(dive.usual)}.`,
        rows: [
          { label: "This month", value: eur0(dive.now) },
          { label: "A normal month (average of the last 6)", value: eur0(dive.usual) },
          { label: "Difference", value: `${signed(diff)}${dive.diffPct !== null ? ` (${dive.diffPct >= 0 ? "+" : ""}${dive.diffPct}%)` : ""}`, tone: "warn" },
        ],
        chart: { type: "bar", title: `${dive.category} by month (€)`, data: dive.trend },
      },
      why: {
        title: "Why it happened",
        text: topShop
          ? `Most of it went to ${topShop.label} (${eur0(topShop.spent)}). These are the biggest items. They show where the money went, not why.`
          : "Here are the biggest purchases. They show where the money went, not why.",
        rows: [
          ...dive.merchants.slice(0, 3).map((m) => ({ label: m.label, value: `${eur0(m.spent)} (${m.sharePct}%)` })),
          ...dive.biggest.slice(0, 3).map((b) => ({ label: `Largest purchase, ${shortDate(b.date)}`, value: eur0(b.amount) })),
        ],
      },
      means: {
        title: "What it means",
        text: `If every month looked like this, you would spend about ${eur0(diff * 12)} more a year. One month like this is often a one-off, so see if it happens again next month.`,
        rows: [
          ...(share !== null ? [{ label: "How much of your monthly pay this is", value: `${share}%` }] : []),
          { label: "Group", value: BASKET_NAMES[dive.basket] },
          ...(dive.peers ? [{ label: `${dive.peers.peerGroup} spend about`, value: `${eur0(dive.peers.peers)} a month` }] : []),
          { label: "You could set aside right now", value: eur0(plan.safeToSave) },
        ],
      },
      next: {
        text: actions.length > 1 ? "Pick a limit and I will add it to your plan." : "A one-off like this is usually not worth a limit: watch whether it repeats next month.",
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
        text: `You spent ${eur0(dive.now)} on ${name} this month. In a normal month it is about ${eur0(dive.usual)}.`,
        rows: [
          { label: "This month", value: eur0(dive.now) },
          { label: "A normal month", value: eur0(dive.usual) },
          { label: "Difference", value: signed(dive.now - dive.usual), tone: "good" },
        ],
        chart: { type: "bar", title: `${dive.category} by month (€)`, data: dive.trend },
      },
      why: {
        title: "Why it happened",
        text: dive.biggest.length ? "The largest purchases this month are below. They show how the month was made up, not why." : "There were very few purchases in this category this month.",
        rows: dive.biggest.slice(0, 3).map((b) => ({ label: `${b.label}, ${shortDate(b.date)}`, value: eur0(b.amount) })),
      },
      means: { title: "What it means", text: `If every month were like this, you would keep about ${eur0(saved * 12)} a year. One light month can also just be timing, so look at the chart before changing habits.` },
      next: { text: "Good months are the best time to save.", actions: [{ id: "plan", label: "Move it to savings", detail: "See how much you can safely set aside now.", link: "plan" }] },
      askAI: "How much can I safely save right now?",
    };
  },

  async runwayStory(customerId: string, id: string): Promise<InsightStory> {
    const [safe, rec, summary] = await Promise.all([coachService.safeToSpend(customerId), exploreService.recurring(customerId), basketsService.getSummary(customerId)]);
    const short = safe.shortfall > 0;
    const usualPerDay = ((summary.baskets.find((b) => b.id === 2)?.avg6m ?? 0) + (summary.baskets.find((b) => b.id === 3)?.avg6m ?? 0)) / 30;
    const guess = safe.paydayIsEstimate ? " Your payday date is a guess because your pay days change." : "";
    return {
      id,
      tone: short ? "alert" : "info",
      title: short ? "You may run short before payday" : `You can spend about ${eur0(safe.perDay)} a day`,
      happened: {
        title: "What happened",
        text: `You have ${eur0(safe.balance)} and payday is ${shortDate(safe.nextPayday.date)}, ${safe.daysLeft} days away.${guess}`,
        rows: [
          { label: "Balance", value: eur0(safe.balance) },
          { label: "Next payday", value: `${shortDate(safe.nextPayday.date)} (about ${eur0(safe.nextPayday.expected)})` },
          { label: "Days left", value: `${safe.daysLeft}` },
        ],
      },
      why: {
        title: "Why it happened",
        text: `About ${eur0(safe.reservedEssentials)} of your balance is already spoken for: bills and basics you usually pay before payday.`,
        rows: rec.items.slice(0, 4).map((i) => ({ label: `${i.name} (usually around day ${i.typicalDay})`, value: eur0(i.avgMonthly) })),
      },
      means: {
        title: "What it means",
        text: short
          ? `After your bills and basics you could be ${eur0(safe.shortfall)} short, so extras should wait until payday.`
          : `You can spend about ${eur0(safe.perDay)} a day. Most days you spend about ${eur0(usualPerDay)} on extras and surprises.`,
        rows: [
          { label: "Safe to spend until payday", value: eur0(safe.safeToSpend), tone: short ? "warn" : "good" },
          { label: "What you usually spend a day on extras", value: eur0(usualPerDay), tone: usualPerDay > safe.perDay ? "warn" : undefined },
        ],
      },
      next: {
        text: "See how your balance moves day by day, or set limits so you stay inside the safe amount.",
        actions: [
          { id: "forecast", label: "See the forecast", detail: "Your balance day by day until payday.", link: "forecast" },
          { id: "plan", label: "Make a spending plan", detail: "Limits that keep you above your bills and basics.", link: "plan" },
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
        text: `Over six months your income ranged from ${eur0(inc.minMonthlyIncome)} to ${eur0(inc.maxMonthlyIncome)} a month.`,
        rows: [
          { label: "Average", value: `${eur0(inc.avgMonthlyIncome)} / month` },
          { label: "Lowest month", value: eur0(inc.minMonthlyIncome), tone: "warn" },
          { label: "Highest month", value: eur0(inc.maxMonthlyIncome) },
        ],
        chart: { type: "bar", title: "Income by month (€)", data: inc.months.map((m) => ({ label: MONTH_NAMES[Number(m.month.slice(5, 7)) - 1].slice(0, 3), value: m.income })) },
      },
      why: {
        title: "Why it happened",
        text: "Your pay comes from salary plus other income, and the other income is irregular.",
        rows: [
          { label: "Average salary", value: inc.avgSalary ? `${eur0(inc.avgSalary)} / month` : "n/a" },
          { label: "Invested per month on average", value: eur0(inc.avgInvestedPerMonth) },
        ],
      },
      means: { title: "What it means", text: `In a low month you get about ${eur0(gap)} less than your average, while bills stay the same.` },
      next: { text: `Setting aside about ${eur0(gap)} in good months would cover a low one.`, actions: [{ id: "plan", label: "Build a plan with a buffer", detail: "A plan based on your averages, with room for lean months.", link: "plan" }] },
      askAI: "How steady is my income?",
    };
  },

  async savingStory(customerId: string): Promise<InsightStory> {
    const [inc, save] = await Promise.all([exploreService.incomeSummary(customerId), coachService.safeToSave(customerId)]);
    return {
      id: "saving-habit",
      tone: "good",
      title: `You put aside about ${eur0(inc.avgInvestedPerMonth)} a month`,
      happened: {
        title: "What happened",
        text: `You moved money into investments in most of the last six months, about ${eur0(inc.avgInvestedPerMonth)} a month.`,
        chart: { type: "bar", title: "Put aside by month (€)", data: inc.months.map((m) => ({ label: MONTH_NAMES[Number(m.month.slice(5, 7)) - 1].slice(0, 3), value: Math.max(0, m.invested) })) },
      },
      why: { title: "Why it matters", text: "Saving the same amount regularly works better than saving a lot once in a while." },
      means: {
        title: "What it means",
        text: save.monthsOfEssentialsCovered !== null ? `Your balance would cover your bills and basics for about ${save.monthsOfEssentialsCovered} months.` : "Your balance is your cushion.",
        rows: [{ label: "Safety cushion target (3 months of bills and basics)", value: eur0(save.emergencyFundTarget) }, { label: "Gap to the target", value: eur0(save.emergencyFundGap), tone: save.emergencyFundGap > 0 ? "warn" : "good" }],
      },
      next: { text: `You could safely move ${eur0(save.safeToSave)} right now.`, actions: [{ id: "plan", label: "Turn it into a plan", detail: "Pick a goal and see how long it takes.", link: "plan" }] },
      askAI: "How much can I safely save right now?",
    };
  },

  async peerStory(customerId: string, key: string): Promise<InsightStory> {
    const r = await benchmarkService.compare({ customerId });
    const row = r.rows.find((x) => x.key === key);
    if (!row) throw new HttpError(404, `No peer comparison for ${key}`);
    const above = row.you > row.peers;
    const diffYear = Math.abs(row.you - row.peers) * 12;
    const others = r.rows.filter((x) => x.key !== "total" && x.key !== key).sort((a, b) => Math.abs(b.you - b.peers) - Math.abs(a.you - a.peers)).slice(0, 3);
    return {
      id: `peer-${key}`,
      tone: "info",
      title: `You spend ${above ? "more" : "less"} on ${row.label.toLowerCase()} than most people your age`,
      happened: {
        title: "What happened",
        text: `You spend about ${eur0(row.you)} a month on ${row.label.toLowerCase()}. ${r.peerGroup} spend about ${eur0(row.peers)} (${r.source}).`,
        chart: { type: "bar", title: `${row.label} per month (€)`, data: [{ label: "You", value: row.you }, { label: "Peers", value: row.peers }] },
      },
      why: { title: "Why it happened", text: "Other categories compared with people your age, for context. A difference is not good or bad by itself.", rows: others.map((o) => ({ label: o.label, value: `${eur0(o.you)} vs ${eur0(o.peers)}` })) },
      means: { title: "What it means", text: `The gap is about ${eur0(diffYear)} a year. ${r.note}` },
      next: { text: "Use this as a rough guide, then decide whether it matches what matters to you.", actions: [{ id: "plan", label: "Make a spending plan", detail: "Set limits that fit your own priorities.", link: "plan" }] },
      askAI: "How do I compare with other people my age?",
    };
  },

  async fixedStory(customerId: string): Promise<InsightStory> {
    const [rec, inc] = await Promise.all([exploreService.recurring(customerId), exploreService.incomeSummary(customerId)]);
    const left = inc.avgMonthlyIncome - rec.monthlyTotal;
    return {
      id: "fixed-costs",
      tone: "info",
      title: `About ${Math.round(rec.shareOfSpendingPct)}% of your spending is fixed bills`,
      happened: {
        title: "What happened",
        text: `Payments that repeat every month come to about ${eur0(rec.monthlyTotal)}.`,
        rows: rec.items.slice(0, 5).map((i) => ({ label: `${i.name} (around day ${i.typicalDay})`, value: eur0(i.avgMonthly) })),
      },
      why: { title: "Why it happened", text: "These are payments that showed up in at least 4 of the last 6 months with a steady amount." },
      means: { title: "What it means", text: `After fixed costs you have about ${eur0(left)} a month of your average income to plan the rest.` },
      next: { text: "Knowing your fixed costs makes the rest of the month easier to plan.", actions: [{ id: "forecast", label: "See the forecast", detail: "When these bills leave your account.", link: "forecast" }] },
      askAI: "What are my regular monthly payments?",
    };
  },
};
