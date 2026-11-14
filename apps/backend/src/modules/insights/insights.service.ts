import type { Insight, InsightsResponse } from "@sbank/shared";
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

const eur = (n: number) => `${Math.round(n).toLocaleString("en-IE")} €`;
const list = (xs: string[]) => new Intl.ListFormat("en", { style: "long", type: "conjunction" }).format(xs);
const human = (category: string) => category.replace("&", "and").toLowerCase();

interface Candidate extends Insight {
  priority: number;
}

export const insightsService = {
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
          title: `${d.category} is ${eur(diff)} above usual`,
          body:
            d.usual < 10
              ? `You spent ${eur(d.now)} on ${human(d.category)} this month, and almost nothing in a typical month.`
              : `You spent ${eur(d.now)} on ${human(d.category)} this month. A typical month is ${eur(d.usual)}.`,
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
        title: `${eur(drop.usual - drop.now)} less on ${human(drop.category)} than usual`,
        body: `${eur(drop.now)} this month against a typical ${eur(drop.usual)}. A lighter month than usual.`,
        ask: `How has my ${human(drop.category)} spending changed over the last months?`,
        priority: 50,
      });
    }

    // 2. Chạy được đến kỳ lương không
    const guess = safe.paydayIsEstimate ? " The payday date is an estimate because your pay days vary." : "";
    if (safe.shortfall > 0) {
      out.push({
        id: "runway-short",
        tone: "alert",
        title: "Money may run short before payday",
        body: `After about ${eur(safe.reservedEssentials)} for essentials, you may be ${eur(safe.shortfall)} short before ${shortDate(safe.nextPayday.date)}.${guess}`,
        ask: "What can I safely spend this week?",
        priority: 100,
      });
    } else {
      out.push({
        id: "runway-ok",
        tone: "info",
        title: `${eur(safe.perDay)} a day is safe to spend`,
        body: `Until payday on ${shortDate(safe.nextPayday.date)} (${safe.daysLeft} days), after keeping ${eur(safe.reservedEssentials)} for essentials.${guess}`,
        ask: "What can I safely spend this week?",
        priority: 60,
      });
    }

    // 3. Thu nhập thất thường
    if (income.stability === "variable") {
      out.push({
        id: "income-variable",
        tone: "tip",
        title: "Your income changes a lot",
        body: `Over six months it ranged from ${eur(income.minMonthlyIncome)} to ${eur(income.maxMonthlyIncome)}. In a high month, set some aside for the lean ones.`,
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
        body: "Saving regularly matters more than saving a lot. Keep it going.",
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
      const gap = !above ? `${Math.abs(peer.diffPct!)}% below` : times >= 3 ? `${Math.round(times)} times` : `${peer.diffPct}% above`;
      out.push({
        id: `peer-${peer.key}`,
        tone: "info",
        title: `${peer.label}: ${gap}${above && times >= 3 ? " more than" : ""} people your age`,
        body: `About ${eur(peer.you)} a month, against ${eur(peer.peers)} for ${peers.peerGroup} (${peers.source}).`,
        ask: "How do I compare with other people my age?",
        priority: 45,
      });
    }

    // 6. Phần chi cố định
    if (recurring.monthlyTotal > 0) {
      out.push({
        id: "fixed-costs",
        tone: "info",
        title: `${Math.round(recurring.shareOfSpendingPct)}% of your spending is fixed`,
        body: `${list(recurring.items.slice(0, 3).map((i) => i.name))} come to about ${eur(recurring.monthlyTotal)} a month. Knowing this helps you plan the rest.`,
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
