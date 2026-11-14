import type { Recommendation } from "@sbank/shared";
import { isStandout } from "./usual.js";

const FIXED = new Set(["Housing", "Utilities"]); // bills you cannot change: never "unusual"
export const MAX_CARDS = 5;

const eur = (n: number) => `€${Math.round(n).toLocaleString("en-IE")}`;
const human = (category: string) => category.replace("&", "and").toLowerCase();

export interface RecInputs {
  safe: { safeToSpend: number; perDay: number; shortfall: number; reservedEssentials: number; nextPayday: { date: string }; paydayIsEstimate: boolean };
  /** First day the balance would go below zero at the usual pace, if any. */
  runsOutOn: string | null;
  /** Whole days between that day and payday. */
  daysShort: number;
  shortDate: (iso: string) => string;
  categories: { category: string; now: number; usual: number; flexible: boolean }[];
  monthsWithData: number;
  weekday: { name: string; spent: number; sharePct: number; total: number } | null;
  /** Average amount set aside per month. */
  invested: number;
  peer: { id: string; headline: string; body: string } | null;
  lastMonth: { total: number; topCategory: string | null; topAmount: number };
}

const card = (c: Omit<Recommendation, "target"> & { target: Recommendation["target"] }): Recommendation => c;

/**
 * Chooses the Overview cards. Every rule is plain code: one card per type, at least one positive card when there is
 * something to be positive about, urgent first, then by money impact. Words stay neutral about the person.
 */
export function pickRecommendations(x: RecInputs): Recommendation[] {
  const guess = x.safe.paydayIsEstimate ? " Your payday date is a guess because your pay days change." : "";
  const payday = x.shortDate(x.safe.nextPayday.date);

  // 1. Heads-up: money may not last until payday
  let headsUp: Recommendation | null = null;
  const short = x.safe.shortfall > 0;
  if (short || (x.runsOutOn !== null && x.daysShort >= 1)) {
    const days = x.daysShort;
    headsUp = card({
      id: "this-week",
      type: "heads_up",
      eyebrow: "Heads up",
      tone: "alert",
      headline: short ? "You may run short before payday" : `Your money may run out ${days} day${days === 1 ? "" : "s"} before payday`,
      body: short
        ? `Your bills and basics until ${payday} come to about ${eur(x.safe.reservedEssentials)}, so you could be ${eur(x.safe.shortfall)} short. A small plan can help.${guess}`
        : `At your usual pace the balance could reach zero around ${x.shortDate(x.runsOutOn!)}, ${days} day${days === 1 ? "" : "s"} before payday on ${payday}. A small plan can keep you above zero.${guess}`,
      cta: "Make a plan",
      target: { kind: "insight", id: "runway-short" },
    });
  }

  // 2. This week: what is safe to spend (skipped when the heads-up already says there is no room)
  const week: Recommendation | null = short
    ? null
    : card({
        id: "this-week-safe",
        type: "week",
        eyebrow: "This week",
        tone: "info",
        headline: `You can safely spend ${eur(Math.min(x.safe.safeToSpend, x.safe.perDay * 7))}`,
        body: `That is about ${eur(x.safe.perDay)} a day after your bills and basics, until payday on ${payday}.${guess}`,
        cta: "See how I worked this out",
        target: { kind: "forecast" },
      });

  // Not enough history to know what is "usual": keep it simple and honest
  if (x.monthsWithData < 3) {
    const out: Recommendation[] = [headsUp, week].filter((c): c is Recommendation => c !== null);
    if (x.lastMonth.total > 0 && x.lastMonth.topCategory) {
      out.push(card({
        id: "last-month",
        type: "start",
        eyebrow: "Last month",
        tone: "info",
        headline: `You spent ${eur(x.lastMonth.total)} last month`,
        body: `Most of it went to ${human(x.lastMonth.topCategory)} (${eur(x.lastMonth.topAmount)}). Once there are three full months, I can tell you what is normal for you.`,
        cta: "Show me where it went",
        target: { kind: "insight", id: "last-month" },
      }));
    }
    return out.slice(0, MAX_CARDS);
  }

  const flexible = x.categories.filter((c) => c.flexible);
  const rest: { impact: number; rec: Recommendation }[] = [];

  // 3. Pattern: a weekday or a category that stands out
  const spike = x.categories
    .filter((c) => !FIXED.has(c.category) && c.now > c.usual && isStandout(c.now - c.usual, c.usual) && (c.usual >= 10 || c.now >= 50))
    .sort((a, b) => b.now - b.usual - (a.now - a.usual))[0];
  const spikeDiff = spike ? spike.now - spike.usual : 0;
  const weekdayOk = x.weekday !== null && x.weekday.sharePct >= 25 && x.weekday.spent >= 90;
  let patternCategory: string | null = null;
  if (weekdayOk && spikeDiff < 100) {
    const w = x.weekday!;
    rest.push({
      impact: w.spent / 3,
      rec: card({
        id: `weekday-${w.name}`,
        type: "pattern",
        eyebrow: "A pattern",
        tone: "tip",
        headline: `${w.name}s cost you the most: ${Math.round(w.sharePct)}% of everyday spending`,
        body: `Over the last 3 months, ${eur(w.spent)} of your ${eur(w.total)} everyday spending happened on ${w.name}s.`,
        cta: "Show me why",
        target: { kind: "insight", id: `weekday-${w.name}` },
      }),
    });
  } else if (spike) {
    patternCategory = spike.category;
    rest.push({
      impact: spikeDiff,
      rec: card({
        id: `spike-${spike.category}`,
        type: "pattern",
        eyebrow: "Stands out",
        tone: "tip",
        headline: `You spent ${eur(spikeDiff)} more than usual on ${human(spike.category)}`,
        body: spike.usual < 10
          ? `${eur(spike.now)} this month. In a normal month you spend almost nothing on it.`
          : `${eur(spike.now)} this month. A normal month is about ${eur(spike.usual)}.`,
        cta: "Show me why",
        target: { kind: "insight", id: `spike-${spike.category}` },
      }),
    });
  }

  // 5. Good news: clearly below usual (never praise skipping health care: the wording stays "a lighter month")
  const drop = x.categories
    .filter((c) => !FIXED.has(c.category) && c.usual > c.now && isStandout(c.usual - c.now, c.usual))
    .sort((a, b) => b.usual - b.now - (a.usual - a.now))[0];

  // 4. Opportunity: the biggest flexible category, 20% trim (not one already used by another card)
  const opp = flexible.filter((c) => c.category !== patternCategory && c.category !== drop?.category && c.usual >= 50).sort((a, b) => b.usual - a.usual)[0];
  if (opp) {
    const monthly = opp.usual * 0.2;
    rest.push({
      impact: monthly,
      rec: card({
        id: `trim-${opp.category}`,
        type: "opportunity",
        eyebrow: "An idea",
        tone: "info",
        headline: `Trimming ${human(opp.category)} by 20% could free about ${eur(monthly * 12)} a year`,
        body: `You usually spend about ${eur(opp.usual)} a month on ${human(opp.category)}. 20% of that is ${eur(monthly)} a month.`,
        cta: "Try it",
        target: { kind: "insight", id: `trim-${opp.category}` },
      }),
    });
  }

  if (drop) {
    rest.push({
      impact: drop.usual - drop.now,
      rec: card({
        id: `drop-${drop.category}`,
        type: "good",
        eyebrow: "A lighter month",
        tone: "good",
        headline: `You spent ${eur(drop.usual - drop.now)} less than usual on ${human(drop.category)}`,
        body: `${eur(drop.now)} this month, compared with about ${eur(drop.usual)} in a normal month.`,
        cta: "Show me why",
        target: { kind: "insight", id: `drop-${drop.category}` },
      }),
    });
  } else if (x.invested >= 50) {
    rest.push({
      impact: x.invested / 2,
      rec: card({
        id: "saving-habit",
        type: "good",
        eyebrow: "Nice work",
        tone: "good",
        headline: `You put aside about ${eur(x.invested)} a month`,
        body: "Saving a little every month works better than saving a lot once in a while.",
        cta: "Show me why",
        target: { kind: "insight", id: "saving-habit" },
      }),
    });
  }

  rest.sort((a, b) => b.impact - a.impact);
  const out = [headsUp, week, ...rest.map((r) => r.rec)].filter((c): c is Recommendation => c !== null);

  // Compared with others (Statistics Finland): last, and only if there is room
  if (x.peer && out.length < MAX_CARDS) {
    out.push(card({ id: x.peer.id, type: "peer", eyebrow: "Compared with others", tone: "info", headline: x.peer.headline, body: x.peer.body, cta: "Show me why", target: { kind: "insight", id: x.peer.id } }));
  }
  return out.slice(0, MAX_CARDS);
}
