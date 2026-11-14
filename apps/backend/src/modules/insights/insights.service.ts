import type { Insight, InsightsResponse, Recommendation, RecommendationsResponse } from "@sbank/shared";
import { HttpError } from "../../lib/errors.js";
import { lastNMonths, monthStart, shortDate, TODAY } from "../../lib/dates.js";
import { benchmarkRepository } from "../benchmark/benchmark.repository.js";
import { benchmarkService } from "../benchmark/benchmark.service.js";
import { coachService } from "../coach/coach.service.js";
import { customersRepository } from "../customers/customers.repository.js";
import { exploreService } from "../explore/explore.service.js";

const MONTHS = 6;
const MAX_INSIGHTS = 4;
const FIXED = new Set(["Housing", "Utilities"]); // khoản cố định, không coi là "tăng bất thường"

const eur = (n: number) => `€${Math.round(n).toLocaleString("en-IE")}`;
const list = (xs: string[]) => new Intl.ListFormat("en", { style: "long", type: "conjunction" }).format(xs);
const human = (category: string) => category.replace("&", "and").toLowerCase();

interface Candidate extends Insight {
  priority: number;
}

const EYEBROW: Record<string, string> = {
  spike: "Stands out",
  drop: "Good news",
  "income-variable": "Worth knowing",
  "saving-habit": "Nice work",
  peer: "Compared with others",
  "fixed-costs": "Your bills",
};

export const insightsService = {
  /**
   * Thẻ trong carousel "Recommendations" của màn Overview: thẻ đầu là "tuần này tôi tiêu được bao nhiêu",
   * sau đó tối đa 3 nhận xét nổi bật nhất. Chữ viết bằng tiếng Anh đơn giản; con số đều từ code.
   */
  async recommendations(customerId: string): Promise<RecommendationsResponse> {
    const [safe, all] = await Promise.all([coachService.safeToSpend(customerId), this.forCustomer(customerId)]);
    const guess = safe.paydayIsEstimate ? " Your payday date is a guess because your pay days change." : "";
    const week = Math.min(safe.safeToSpend, safe.perDay * 7);
    const first: Recommendation =
      safe.shortfall > 0
        ? {
            id: "this-week",
            eyebrow: "Heads up",
            tone: "alert",
            headline: "You may run short before payday",
            body: `Your bills and basics until ${shortDate(safe.nextPayday.date)} come to about ${eur(safe.reservedEssentials)}, so you could be ${eur(safe.shortfall)} short. Hold off on extras if you can.${guess}`,
            cta: "See how I worked this out",
            target: { kind: "forecast" },
          }
        : {
            id: "this-week",
            eyebrow: "This week",
            tone: "info",
            headline: `You can safely spend ${eur(week)}`,
            body: `That is about ${eur(safe.perDay)} a day after your bills and basics, until payday on ${shortDate(safe.nextPayday.date)}.${guess}`,
            cta: "See how I worked this out",
            target: { kind: "forecast" },
          };
    const rest: Recommendation[] = all.insights
      .filter((i) => !i.id.startsWith("runway"))
      .slice(0, 3)
      .map((i) => {
        const kind = i.id.startsWith("spike") ? "spike" : i.id.startsWith("drop") ? "drop" : i.id.startsWith("peer") ? "peer" : i.id;
        return { id: i.id, eyebrow: EYEBROW[kind] ?? "For you", tone: i.tone, headline: i.title, body: i.body, cta: "Show me why", target: { kind: "insight" as const, id: i.id } };
      });
    return { asOf: TODAY, items: [first, ...rest] };
  },

  /** Vài nhận xét chủ động, tính hoàn toàn từ dữ liệu (không dùng LLM): nhanh và không thể bịa số. */
  async forCustomer(customerId: string): Promise<InsightsResponse> {
    const customer = await customersRepository.findWithStats(customerId);
    if (!customer) throw new HttpError(404, `Customer ${customerId} not found`);

    const months = lastNMonths(MONTHS);
    const [now, past, safe, recurring, income, peers] = await Promise.all([
      benchmarkRepository.spentByCategory(customerId, monthStart(0), monthStart(1)),
      benchmarkRepository.spentByCategory(customerId, months[0], monthStart(0)),
      coachService.safeToSpend(customerId),
      exploreService.recurring(customerId),
      exploreService.incomeSummary(customerId),
      benchmarkService.compare({ customerId }),
    ]);

    const out: Candidate[] = [];

    // 1. Danh mục tăng/giảm mạnh so với mức thường lệ của chính khách
    const diffs = [...new Set([...now.keys(), ...past.keys()])]
      .filter((c) => !FIXED.has(c))
      .map((c) => ({ category: c, now: now.get(c) ?? 0, usual: (past.get(c) ?? 0) / MONTHS }));

    diffs
      .filter((d) => d.now - d.usual >= 100 && d.now >= 1.5 * d.usual)
      .sort((a, b) => b.now - b.usual - (a.now - a.usual))
      .slice(0, 2)
      .forEach((d) => {
        const diff = d.now - d.usual;
        out.push({
          id: `spike-${d.category}`,
          tone: "alert",
          title: `You spent ${eur(diff)} more than usual on ${human(d.category)}`,
          body:
            d.usual < 10
              ? `You spent ${eur(d.now)} on ${human(d.category)} this month. In a normal month you spend almost nothing on it.`
              : `You spent ${eur(d.now)} on ${human(d.category)} this month. In a normal month it is about ${eur(d.usual)}.`,
          ask: `What did I spend on ${human(d.category)} this month?`,
          priority: 80 + Math.min(diff / 100, 15),
        });
      });

    const drop = diffs
      .filter((d) => d.usual - d.now >= 100 && d.now <= 0.6 * d.usual)
      .sort((a, b) => b.usual - b.now - (a.usual - a.now))[0];
    if (drop) {
      out.push({
        id: `drop-${drop.category}`,
        tone: "good",
        title: `You spent ${eur(drop.usual - drop.now)} less than usual on ${human(drop.category)}`,
        body: `${eur(drop.now)} this month, compared with about ${eur(drop.usual)} in a normal month. A lighter month.`,
        ask: `How has my ${human(drop.category)} spending changed over the last months?`,
        priority: 50,
      });
    }

    // 2. Chạy được đến kỳ lương không
    const guess = safe.paydayIsEstimate ? " Your payday date is a guess because your pay days change." : "";
    if (safe.shortfall > 0) {
      out.push({
        id: "runway-short",
        tone: "alert",
        title: "You may run short before payday",
        body: `Your bills and basics until ${shortDate(safe.nextPayday.date)} come to about ${eur(safe.reservedEssentials)}, so you could be ${eur(safe.shortfall)} short.${guess}`,
        ask: "What can I safely spend this week?",
        priority: 100,
      });
    } else {
      out.push({
        id: "runway-ok",
        tone: "info",
        title: `You can spend about ${eur(safe.perDay)} a day`,
        body: `Until payday on ${shortDate(safe.nextPayday.date)} (${safe.daysLeft} days), after setting aside ${eur(safe.reservedEssentials)} for your bills and basics.${guess}`,
        ask: "What can I safely spend this week?",
        priority: 60,
      });
    }

    // 3. Thu nhập thất thường
    if (income.stability === "variable") {
      out.push({
        id: "income-variable",
        tone: "tip",
        title: "Your pay changes a lot from month to month",
        body: `Some months you get as little as ${eur(income.minMonthlyIncome)}, others as much as ${eur(income.maxMonthlyIncome)}. Put a little aside in the good months.`,
        ask: "How steady is my income?",
        priority: 55,
      });
    }

    // 4. Thói quen tiết kiệm
    if (income.avgInvestedPerMonth >= 50) {
      out.push({
        id: "saving-habit",
        tone: "good",
        title: `You put aside about ${eur(income.avgInvestedPerMonth)} a month`,
        body: "Saving a little every month works better than saving a lot once in a while. Keep it up.",
        ask: "How much can I safely save right now?",
        priority: 52,
      });
    }

    // 5. Khác biệt lớn nhất so với người cùng tuổi (bỏ nhà ở vì chủ sở hữu và người thuê không so sánh được)
    const peer = peers.rows
      .filter((r) => r.key !== "total" && r.key !== "housing" && r.diffPct !== null)
      .filter((r) => Math.abs(r.you - r.peers) >= 60 && Math.abs(r.diffPct!) >= 60)
      .sort((a, b) => Math.abs(b.you - b.peers) - Math.abs(a.you - a.peers))[0];
    if (peer) {
      const above = peer.you > peer.peers;
      const times = peer.you / peer.peers;
      const how = !above ? "less" : times >= 3 ? `about ${Math.round(times)} times as much` : "more";
      out.push({
        id: `peer-${peer.key}`,
        tone: "info",
        title: how.includes("times") ? `You spend ${how} on ${peer.label.toLowerCase()} as most people your age` : `You spend ${how} on ${peer.label.toLowerCase()} than most people your age`,
        body: `About ${eur(peer.you)} a month. ${peers.peerGroup} spend about ${eur(peer.peers)} (${peers.source}).`,
        ask: "How do I compare with other people my age?",
        priority: 45,
      });
    }

    // 6. Phần chi cố định
    if (recurring.monthlyTotal > 0) {
      out.push({
        id: "fixed-costs",
        tone: "info",
        title: `About ${Math.round(recurring.shareOfSpendingPct)}% of your spending is fixed bills`,
        body: `${list(recurring.items.slice(0, 3).map((i) => i.name.toLowerCase()))} add up to about ${eur(recurring.monthlyTotal)} a month. Plan the rest of your money around that.`,
        ask: "What are my regular monthly payments?",
        priority: 40,
      });
    }

    const insights = out
      .sort((a, b) => b.priority - a.priority)
      .slice(0, MAX_INSIGHTS)
      .map(({ priority: _p, ...i }) => i);
    return { asOf: TODAY, insights };
  },
};
