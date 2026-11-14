import type {
  Insight,
  InsightsResponse,
  Recommendation,
  RecommendationsResponse,
} from "@sbank/shared";
import { HttpError } from "../../lib/errors.js";
import {
  daysBetween,
  lastNMonths,
  monthStart,
  shortDate,
  TODAY,
} from "../../lib/dates.js";
import { benchmarkRepository } from "../benchmark/benchmark.repository.js";
import { benchmarkService } from "../benchmark/benchmark.service.js";
import { coachService } from "../coach/coach.service.js";
import { customersRepository } from "../customers/customers.repository.js";
import { moneyContext } from "../context/context.service.js";
import { exploreExtras } from "../explore/explore.repository.js";
import { exploreService } from "../explore/explore.service.js";
import { pickRecommendations } from "./recommendations.js";
import { categoryHistory, isStandout } from "./usual.js";

const MAX_INSIGHTS = 4;
const FIXED = new Set(["Housing", "Utilities"]); // khoản cố định, không coi là "tăng bất thường"

const eur = (n: number) => `€${Math.round(n).toLocaleString("en-IE")}`;
const list = (xs: string[]) =>
  new Intl.ListFormat("en", { style: "long", type: "conjunction" }).format(xs);
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
   * Thẻ trong carousel "Recommendations" của màn Overview. Quy tắc chọn thẻ nằm ở recommendations.ts (hàm thuần, có test);
   * ở đây chỉ gom dữ liệu. Chữ viết bằng tiếng Anh đơn giản; con số đều từ code.
   */
  async recommendations(customerId: string): Promise<RecommendationsResponse> {
    const lastFull = lastNMonths(1)[0];
    const [safe, forecast, hist, baskets, income, all, prev, weekday] =
      await Promise.all([
        moneyContext.safeToSpend(customerId),
        coachService.forecast(customerId),
        categoryHistory(customerId),
        exploreExtras.basketByCategory(
          customerId,
          lastNMonths(6)[0],
          monthStart(1)
        ),
        exploreService.incomeSummary(customerId),
        this.forCustomer(customerId),
        benchmarkRepository.spentByCategory(
          customerId,
          lastFull,
          monthStart(0)
        ),
        exploreService.breakdown({
          customerId,
          from: lastNMonths(3)[0],
          to: monthStart(0),
          groupBy: "weekday",
          basket: 3,
          category: undefined,
          mcc: undefined,
          limit: 7,
        }),
      ]);
    const topDay = [...weekday.rows].sort((a, b) => b.spent - a.spent)[0];
    const prevTop = [...prev.entries()].sort((a, b) => b[1] - a[1])[0];
    const peer = all.insights.find((i) => i.id.startsWith("peer-"));
    const items = pickRecommendations({
      safe,
      runsOutOn: forecast.runsOutOn,
      daysShort: forecast.runsOutOn
        ? daysBetween(forecast.runsOutOn, safe.nextPayday.date)
        : 0,
      shortDate,
      categories: [...new Set([...hist.now.keys(), ...hist.usual.keys()])].map(
        (category) => ({
          category,
          now: hist.now.get(category) ?? 0,
          usual: hist.usual.get(category) ?? 0,
          flexible: (baskets.get(category) ?? 3) === 3,
        })
      ),
      monthsWithData: hist.monthsWithData,
      weekday: topDay
        ? {
            name: topDay.key,
            spent: topDay.spent,
            sharePct: topDay.sharePct,
            total: weekday.total,
          }
        : null,
      invested: income.avgInvestedPerMonth,
      loan: safe.loanContext,
      peer: peer
        ? { id: peer.id, headline: peer.title, body: peer.body }
        : null,
      lastMonth: {
        total: [...prev.values()].reduce((a, v) => a + v, 0),
        topCategory: prevTop?.[0] ?? null,
        topAmount: prevTop?.[1] ?? 0,
      },
    });
    return { asOf: TODAY, items };
  },

  /** Vài nhận xét chủ động, tính hoàn toàn từ dữ liệu (không dùng LLM): nhanh và không thể bịa số. */
  async forCustomer(customerId: string): Promise<InsightsResponse> {
    const customer = await customersRepository.findWithStats(customerId);
    if (!customer) throw new HttpError(404, `Customer ${customerId} not found`);

    const [hist, safe, recurring, income, peers] = await Promise.all([
      categoryHistory(customerId),
      coachService.safeToSpend(customerId),
      exploreService.recurring(customerId),
      exploreService.incomeSummary(customerId),
      benchmarkService.compare({ customerId }),
    ]);

    const out: Candidate[] = [];

    // 1. Danh mục tăng/giảm mạnh so với mức thường lệ của chính khách
    const diffs = [...new Set([...hist.now.keys(), ...hist.usual.keys()])]
      .filter((c) => !FIXED.has(c))
      .map((c) => ({
        category: c,
        now: hist.now.get(c) ?? 0,
        usual: hist.usual.get(c) ?? 0,
      }));

    diffs
      .filter(
        (d) =>
          d.now > d.usual &&
          isStandout(d.now - d.usual, d.usual) &&
          (d.usual >= 10 || d.now >= 50)
      )
      .sort((a, b) => b.now - b.usual - (a.now - a.usual))
      .slice(0, 2)
      .forEach((d) => {
        const diff = d.now - d.usual;
        out.push({
          id: `spike-${d.category}`,
          tone: "alert",
          title: `You spent ${eur(diff)} more than usual on ${human(
            d.category
          )}`,
          body:
            d.usual < 10
              ? `You spent ${eur(d.now)} on ${human(
                  d.category
                )} this month. In an average month you spend almost nothing on it.`
              : `You spent ${eur(d.now)} on ${human(
                  d.category
                )} this month. In a  it is about ${eur(d.usual)}.`,
          ask: `What did I spend on ${human(d.category)} this month?`,
          priority: 80 + Math.min(diff / 100, 15),
        });
      });

    const drop = diffs
      .filter((d) => d.usual > d.now && isStandout(d.usual - d.now, d.usual))
      .sort((a, b) => b.usual - b.now - (a.usual - a.now))[0];
    if (drop) {
      out.push({
        id: `drop-${drop.category}`,
        tone: "good",
        title: `You spent ${eur(
          drop.usual - drop.now
        )} less than usual on ${human(drop.category)}`,
        body: `${eur(drop.now)} this month, compared with about ${eur(
          drop.usual
        )} in a . A lighter month.`,
        ask: `How has my ${human(
          drop.category
        )} spending changed over the last months?`,
        priority: 50,
      });
    }

    // 2. Chạy được đến kỳ lương không
    const guess = safe.paydayIsEstimate
      ? " Your payday date is a guess because your pay days change."
      : "";
    if (safe.shortfall > 0) {
      out.push({
        id: "runway-short",
        tone: "alert",
        title: "You may run short before payday",
        body: `Your bills and basics until ${shortDate(
          safe.nextPayday.date
        )} come to about ${eur(safe.reservedEssentials)}, so you could be ${eur(
          safe.shortfall
        )} short.${guess}`,
        ask: "What can I safely spend this week?",
        priority: 100,
      });
    } else {
      out.push({
        id: "runway-ok",
        tone: "info",
        title: `You can spend about ${eur(safe.perDay)} a day`,
        body: `Until payday on ${shortDate(safe.nextPayday.date)} (${
          safe.daysLeft
        } days), after setting aside ${eur(
          safe.reservedEssentials
        )} for your bills and basics.${guess}`,
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
        body: `Some months you get as little as ${eur(
          income.minMonthlyIncome
        )}, others as much as ${eur(
          income.maxMonthlyIncome
        )}. Put a little aside in the good months.`,
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
      .filter(
        (r) => r.key !== "total" && r.key !== "housing" && r.diffPct !== null
      )
      .filter(
        (r) => Math.abs(r.you - r.peers) >= 60 && Math.abs(r.diffPct!) >= 60
      )
      .sort((a, b) => Math.abs(b.you - b.peers) - Math.abs(a.you - a.peers))[0];
    if (peer) {
      const above = peer.you > peer.peers;
      const times = peer.you / peer.peers;
      const how = !above
        ? "less"
        : times >= 3
        ? `about ${Math.round(times)} times as much`
        : "more";
      out.push({
        id: `peer-${peer.key}`,
        tone: "info",
        title: how.includes("times")
          ? `You spend ${how} on ${peer.label.toLowerCase()} as most people your age`
          : `You spend ${how} on ${peer.label.toLowerCase()} than most people your age`,
        body: `About ${eur(peer.you)} a month. ${
          peers.peerGroup
        } spend about ${eur(peer.peers)} (${peers.source}).`,
        ask: "How do I compare with other people my age?",
        priority: 45,
      });
    }

    // 6. Phần chi cố định
    if (recurring.monthlyTotal > 0) {
      out.push({
        id: "fixed-costs",
        tone: "info",
        title: `About ${Math.round(
          recurring.shareOfSpendingPct
        )}% of your spending is fixed bills`,
        body: `${list(
          recurring.items.slice(0, 3).map((i) => i.name.toLowerCase())
        )} add up to about ${eur(
          recurring.monthlyTotal
        )} a month. Plan the rest of your money around that.`,
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
