import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { pickRecommendations, type RecInputs } from "./recommendations.js";

const base = (over: Partial<RecInputs> = {}): RecInputs => ({
  safe: { safeToSpend: 400, perDay: 40, shortfall: 0, reservedEssentials: 900, nextPayday: { date: "2026-10-15" }, paydayIsEstimate: false, loanReserve: 0, safeAfterLoan: 400, safeAfterLoanPerDay: 40 },
  runsOutOn: null,
  daysShort: 0,
  shortDate: (d) => d,
  categories: [
    { category: "Restaurants", now: 300, usual: 200, flexible: true },
    { category: "Entertainment", now: 40, usual: 120, flexible: true },
    { category: "Lifestyle", now: 150, usual: 140, flexible: true },
    { category: "Housing", now: 1200, usual: 1200, flexible: false },
  ],
  monthsWithData: 3,
  weekday: { name: "Friday", spent: 420, sharePct: 38, total: 1100 },
  invested: 0,
  peer: null,
  loan: null,
  lastMonth: { total: 2000, topCategory: "Housing", topAmount: 1200 },
  ...over,
});

describe("pickRecommendations", () => {
  it("puts the heads-up first and says 'may'", () => {
    const r = pickRecommendations(base({ runsOutOn: "2026-10-11", daysShort: 4 }));
    assert.equal(r[0].type, "heads_up");
    assert.match(r[0].headline, /may run out 4 days before payday/);
    assert.equal(r[1].type, "week");
  });

  it("replaces the week card by the heads-up when the bills alone do not fit", () => {
    const r = pickRecommendations(base({ safe: { ...base().safe, shortfall: 120 }, runsOutOn: "2026-10-10", daysShort: 5 }));
    assert.equal(r.filter((c) => c.type === "week").length, 0);
    assert.equal(r[0].type, "heads_up");
  });

  it("has at most one card of each type and at most 5 cards", () => {
    const r = pickRecommendations(base({ peer: { id: "peer-transport", headline: "h", body: "b" }, runsOutOn: "2026-10-11", daysShort: 4 }));
    const types = r.map((c) => c.type);
    assert.equal(new Set(types).size, types.length);
    assert.ok(r.length <= 5);
  });

  it("includes a positive card when spending is clearly below usual", () => {
    const r = pickRecommendations(base());
    const good = r.find((c) => c.type === "good");
    assert.ok(good);
    assert.match(good.headline, /€80 less than usual on entertainment/);
    assert.doesNotMatch(good.body, /overspent|great job/i);
  });

  it("ignores changes under €30 or 25%", () => {
    const r = pickRecommendations(base({ weekday: null, categories: [{ category: "Restaurants", now: 215, usual: 200, flexible: true }, { category: "Lifestyle", now: 100, usual: 118, flexible: true }] }));
    assert.equal(r.find((c) => c.type === "pattern"), undefined);
    assert.equal(r.find((c) => c.type === "good"), undefined);
  });

  it("shows a weekday pattern when no category stands out strongly", () => {
    const r = pickRecommendations(base({ categories: [{ category: "Restaurants", now: 240, usual: 200, flexible: true }] }));
    const p = r.find((c) => c.type === "pattern");
    assert.ok(p);
    assert.match(p.headline, /Fridays cost you the most: 38% of everyday spending/);
  });

  it("does not use the same category for the idea and the good news", () => {
    const r = pickRecommendations(base({ categories: [{ category: "Entertainment", now: 40, usual: 300, flexible: true }, { category: "Restaurants", now: 200, usual: 200, flexible: true }] }));
    const idea = r.find((c) => c.type === "opportunity");
    assert.match(idea?.headline ?? "", /restaurants/);
  });

  it("with under 3 months of history it shows simple cards and no 'usual'", () => {
    const r = pickRecommendations(base({ monthsWithData: 1 }));
    assert.deepEqual(r.map((c) => c.type), ["week", "start"]);
    assert.doesNotMatch(r[1].body + r[1].headline, /than usual|than normal/);
  });

  it("falls back to the saving habit as good news", () => {
    const r = pickRecommendations(base({ invested: 230, categories: [{ category: "Restaurants", now: 200, usual: 200, flexible: true }], weekday: null }));
    assert.equal(r.find((c) => c.type === "good")?.id, "saving-habit");
  });

  it("warns about an open home loan application right after any heads-up and softens the safe amount", () => {
    const loan = { state: "in_progress" as const, decision: null, reason: null, daysSinceDecision: null, estimatedMonthlyPayment: 900, typicalBuyingCosts: 8000 };
    const r = pickRecommendations(base({ loan, safe: { ...base().safe, safeToSpend: 5000, perDay: 500, loanReserve: 900, safeAfterLoan: 4100, safeAfterLoanPerDay: 410 } }));
    assert.deepEqual(r.slice(0, 2).map((c) => c.type), ["loan", "week"]);
    assert.match(r[0].headline, /still open/);
    assert.match(r[1].body, /home loan is still open, so you may want to spend less/);
    assert.deepEqual(r[0].target, { kind: "ask", text: "What is the status of my mortgage application?" });
  });

  it("shows payments and costs for a loan approved recently, after the week card", () => {
    const loan = { state: "recent" as const, decision: "approved" as const, reason: null, daysSinceDecision: 12, estimatedMonthlyPayment: 920, typicalBuyingCosts: 7800 };
    const r = pickRecommendations(base({ loan }));
    assert.deepEqual(r.slice(0, 2).map((c) => c.type), ["week", "loan"]);
    assert.match(r[1].headline, /approved 12 days ago/);
    assert.match(r[1].body, /€920 a month \(an estimate\)/);
  });

  it("is neutral about a rejected application and still at most 5 cards", () => {
    const loan = { state: "recent" as const, decision: "rejected" as const, reason: "The property used as security was worth too little for the loan.", daysSinceDecision: 5, estimatedMonthlyPayment: 900, typicalBuyingCosts: 8000 };
    const r = pickRecommendations(base({ loan, peer: { id: "peer-x", headline: "h", body: "b" } }));
    assert.ok(r.length <= 5);
    assert.match(r.find((c) => c.type === "loan")!.headline, /was not approved 5 days ago/);
  });

  it("holds back the loan costs from the safe amount and says so", () => {
    const loan = { state: "recent" as const, decision: "approved" as const, reason: null, daysSinceDecision: 3, estimatedMonthlyPayment: 900, typicalBuyingCosts: 6000 };
    const r = pickRecommendations(base({ loan, safe: { ...base().safe, safeToSpend: 3000, perDay: 300, loanReserve: 6900, safeAfterLoan: 0, safeAfterLoanPerDay: 0 } }));
    assert.equal(r[0].headline, "Best to hold off on extras");
    assert.match(r[0].body, /€3,000/);
    assert.match(r[0].body, /€6,900/);
    const r2 = pickRecommendations(base({ loan, safe: { ...base().safe, safeToSpend: 9000, perDay: 900, loanReserve: 6900, safeAfterLoan: 2100, safeAfterLoanPerDay: 210 } }));
    assert.match(r2[0].headline, /safely spend €1,470/);
    assert.match(r2[0].body, /kept back €6,900 for your home loan/);
  });
});
