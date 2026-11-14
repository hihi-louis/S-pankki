import fs from "node:fs";
import { fileURLToPath } from "node:url";
import type { FactsCard } from "@sbank/shared";
import { daysBetween, TODAY } from "../../lib/dates.js";
import { HttpError } from "../../lib/errors.js";
import { annuityPayment, eur0, pct1 } from "../../lib/finance.js";
import { basketsService } from "../baskets/baskets.service.js";
import { coachService } from "../coach/coach.service.js";
import { customersRepository } from "../customers/customers.repository.js";
import { exploreService } from "../explore/explore.service.js";
import { mortgageRepository } from "./mortgage.repository.js";
import { housingSource, lookupPrice } from "./housing-prices.js";
import type { AffordabilityQuery, HousingPriceQuery, SavingsPlanQuery } from "./mortgage.schema.js";

// Hằng số công khai có ghi nguồn và ngày (xem src/data/housing-rules.json)
const rules = JSON.parse(
  fs.readFileSync(fileURLToPath(new URL("../../data/housing-rules.json", import.meta.url)), "utf8"),
) as {
  loanCap: { generalLtv: number };
  stress: { ratePct: number };
  rates: { avgNewHousingLoanPct: number; asOf: string; label: string };
  assumptions: { termYears: number };
};

const LTV = rules.loanCap.generalLtv;
const TERM = rules.assumptions.termYears;
const AVG_RATE = rules.rates.avgNewHousingLoanPct / 100;
const STRESS_RATE = rules.stress.ratePct / 100;

const CAVEAT =
  "Estimate from historical S-Pankki applications and public rules. It is not a loan decision or financial advice.";

const REASONS: Record<string, string> = {
  insufficient_collateral: "not enough collateral",
  insufficient_income: "income too low for the loan",
  insufficient_equity: "not enough own funds (equity)",
  existing_debt: "existing debts",
};

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Chi phí mua nhà thường gặp theo trung vị của dữ liệu: thuế chuyển nhượng theo % giá, phí định giá và phí ngân hàng cố định. */
async function costsFor(price: number) {
  const c = await mortgageRepository.typicalCosts();
  const tax = (c.get("transfer_tax")?.ratio ?? 0.025) * price;
  const fees = (c.get("valuation_fee")?.amount ?? 0) + (c.get("bank_fee")?.amount ?? 0);
  return { transferTax: Math.round(tax), fees: Math.round(fees), total: Math.round(tax + fees) };
}

async function salaryOf(customerId: string) {
  const [customer, income] = await Promise.all([customersRepository.findWithStats(customerId), exploreService.incomeSummary(customerId)]);
  if (!customer) throw new HttpError(404, `Customer ${customerId} not found`);
  // Lương thường kỳ là cơ sở thận trọng; thu nhập khác dao động nhiều nên chỉ dùng làm so sánh
  return { salary: customer.avgSalary ?? income.avgMonthlyIncome, totalIncome: income.avgMonthlyIncome };
}

/** Applications decided within this many days still shape the budget (first payments, buying costs). */
const RECENT_DAYS = 45;

export interface LoanContext {
  /** open = the bank has not decided yet; recent = decided in the last 45 days. */
  state: "in_progress" | "recent";
  decision: "approved" | "rejected" | null;
  reason: string | null;
  startedOn: string;
  decidedOn: string | null;
  daysSinceDecision: number | null;
  loan: number;
  /** Estimated monthly payment of the applied loan (public average rate, 25 years): an estimate, not an offer. */
  estimatedMonthlyPayment: number;
  typicalBuyingCosts: number;
}

export const mortgageService = {
  /** The home-loan situation that changes how safe it is to spend: an open application, or one decided recently. null otherwise. */
  async loanContext(customerId: string, asOf = TODAY): Promise<LoanContext | null> {
    const st = await mortgageRepository.stageAt(customerId, asOf);
    if (!st) return null;
    const daysSince = st.decided ? daysBetween(st.decided, asOf) : null;
    if (st.decided && (daysSince ?? 0) > RECENT_DAYS) return null;
    const costs = await costsFor(st.price);
    return {
      state: st.decided ? "recent" : "in_progress",
      decision: st.decided ? (st.decision === "approved" ? "approved" : "rejected") : null,
      reason: st.decided && st.reason ? REASONS[st.reason] ?? st.reason : null,
      startedOn: st.started,
      decidedOn: st.decided,
      daysSinceDecision: daysSince,
      loan: Math.round(st.loan),
      estimatedMonthlyPayment: Math.round(annuityPayment(st.loan, AVG_RATE, TERM)),
      typicalBuyingCosts: costs.total,
    };
  },

  /** Typical price of a home of a given size in a given place, from Statistics Finland (price per m² times size). */
  async housingPrice(q: HousingPriceQuery) {
    let area = q.area;
    let usedOwnArea = false;
    if (!area) {
      const c = await customersRepository.findWithStats(q.customerId);
      if (!c) throw new HttpError(404, `Customer ${q.customerId} not found`);
      area = c.postalCode ?? "";
      usedOwnArea = true;
    }
    const r = lookupPrice(area, q.homeType, q.sqm);
    if (!r.found || r.pricePerSqm === undefined) return { found: false, message: r.message ?? "No price found." };
    const estimatedPrice = Math.round(r.pricePerSqm * q.sqm);
    const card: FactsCard = {
      type: "facts",
      title: "Home price estimate",
      headline: { label: `${q.sqm} m² in ${r.areaLabel}`, value: eur0(estimatedPrice) },
      rows: [
        { label: "Average price per m²", value: eur0(r.pricePerSqm) },
        { label: "Type of home", value: r.homeKind ?? "" },
        { label: "Year of the sales", value: housingSource.year },
      ],
      note: "Average of real sales of old homes (Statistics Finland). Not a valuation.",
      action: { kind: "ask", label: "Can I afford this? How long to save?", question: `Could I afford a €${estimatedPrice.toLocaleString("en-US")} home, and how long would it take me to save for it?` },
    };
    return {
      found: true,
      card,
      area: r.areaLabel,
      usedCustomersOwnPostalCode: usedOwnArea,
      priceLevel: r.level,
      homeKind: r.homeKind,
      pricePerSqm: r.pricePerSqm,
      sqm: q.sqm,
      estimatedPrice,
      salesBehindPrice: r.salesCount,
      year: housingSource.year,
      caveat:
        `Average price per m² of old dwellings sold in ${housingSource.year} (Statistics Finland). A real home can cost much more or less: size, condition, floor, view and new-build prices differ. ` +
        "This is not a valuation or an offer. For what the customer could afford, call mortgage_affordability or mortgage_savings_plan with estimatedPrice.",
      source: housingSource.source,
    };
  },

  /** Vay tối đa theo thu nhập: thu nhập tháng / 1,841% (công thức rút ra từ dữ liệu), kèm tiền trả hằng tháng và kiểm tra căng thẳng. */
  async affordability(q: AffordabilityQuery) {
    const [{ salary }, req] = await Promise.all([salaryOf(q.customerId), mortgageRepository.requiredIncomeRate()]);
    const maxLoan = salary / req.rate;
    const payment = annuityPayment(maxLoan, AVG_RATE, TERM);
    const stress = annuityPayment(maxLoan, STRESS_RATE, TERM);

    const rows: FactsCard["rows"] = [
      { label: "Pay used (your average salary)", value: `${eur0(salary)} / month` },
      { label: "Pay the bank looks for", value: `${(req.rate * 100).toFixed(2)}% of the loan each month` },
      { label: `Payment at ${(AVG_RATE * 100).toFixed(2)}% (${TERM} years)`, value: `${eur0(payment)} / month` },
      { label: `Payment if rates rise to ${(STRESS_RATE * 100).toFixed(0)}%`, value: `${eur0(stress)} / month` },
    ];
    let home: Record<string, unknown> | undefined;
    if (q.price) {
      const costs = await costsFor(q.price);
      const loanAtCap = q.price * LTV;
      const loan = Math.min(loanAtCap, maxLoan);
      const down = q.price - loan;
      const incomeAllows = loanAtCap <= maxLoan;
      home = { price: q.price, loan: Math.round(loan), downPayment: Math.round(down), costs, cashNeeded: Math.round(down + costs.total), incomeAllowsFullLoan: incomeAllows };
      rows.push(
        { label: "Home price checked", value: eur0(q.price) },
        { label: incomeAllows ? `Loan (up to ${pct1(LTV)} of price)` : "Loan your income supports", value: eur0(loan), tone: incomeAllows ? undefined : "warn" },
        { label: "Down payment", value: eur0(down) },
        { label: "Typical buying costs (tax and fees)", value: eur0(costs.total) },
        { label: "Cash needed", value: eur0(down + costs.total) },
      );
    }
    const card: FactsCard = {
      type: "facts",
      title: "What you could borrow",
      headline: { label: "Estimated maximum loan", value: eur0(maxLoan) },
      rows,
      note: `${CAVEAT} Payments assume ${rules.rates.label} (${rules.rates.asOf}).`,
    };
    return {
      maxLoan: Math.round(maxLoan),
      incomeUsed: Math.round(salary),
      requiredIncomeRate: round2(req.rate * 100),
      basedOnApplications: req.n,
      monthlyPayment: Math.round(payment),
      stressPayment: Math.round(stress),
      stressPaymentShareOfSalary: round2(stress / salary),
      assumptions: { termYears: TERM, avgRatePct: rules.rates.avgNewHousingLoanPct, stressRatePct: rules.stress.ratePct, loanCapPct: LTV * 100 },
      home,
      caveat: CAVEAT,
      card,
    };
  },

  /** Hồ sơ vay của chính khách (nếu có): kết quả, số liệu, mốc thời gian, và các hồ sơ tương tự. */
  async status(customerId: string) {
    const [app, { salary }] = await Promise.all([mortgageRepository.applicationFor(customerId), salaryOf(customerId)]);
    if (!app) {
      return {
        hasApplication: false,
        message: "No mortgage application is on file for this customer. Ask for an affordability estimate or a savings plan instead.",
      };
    }
    const price = app.property_price ?? 0;
    const loan = app.requested_loan ?? 0;
    const equity = app.equity_amount ?? 0;
    const collateral = app.collateral_value ?? 0;
    const required = app.required_monthly_income ?? 0;
    const equityShare = price > 0 ? equity / price : 0;
    const [timeline, similar, coverage] = await Promise.all([
      mortgageRepository.timelineOf(app.mortgage_id),
      mortgageRepository.similarCases(app.mortgage_id, loan, equityShare),
      mortgageRepository.approvedCollateralCoverage(),
    ]);
    const approved = app.final_decision === "approved";
    const reason = app.rejection_reason ? REASONS[app.rejection_reason] ?? app.rejection_reason : null;
    const collateralCover = loan > 0 ? collateral / loan : 0;

    const rows: FactsCard["rows"] = [
      { label: "Property price", value: eur0(price) },
      { label: "Loan requested", value: eur0(loan) },
      { label: "Your own money in the purchase", value: `${eur0(equity)} (${pct1(equityShare)} of the price)` },
      {
        label: "Value of what backs the loan (collateral)",
        value: `${eur0(collateral)} (covers ${pct1(collateralCover)} of the loan)`,
        tone: collateralCover < 1 && app.rejection_reason === "insufficient_collateral" ? "warn" : undefined,
      },
      {
        label: "Monthly pay the bank looks for vs your salary",
        value: `${eur0(required)} vs ${eur0(salary)} a month`,
        tone: app.rejection_reason === "insufficient_income" ? "warn" : undefined,
      },
    ];
    if (timeline.days != null) rows.push({ label: "Time to decision", value: `${timeline.days} days, ${timeline.contacts} contacts, ${timeline.docs} documents` });
    if (similar.n > 0) rows.push({ label: "Similar applications", value: `${similar.approved} of ${similar.n} were approved` });

    const card: FactsCard = {
      type: "facts",
      title: "Your mortgage application",
      headline: { label: "Decision", value: approved ? "Approved" : `Rejected: ${reason}` },
      rows,
      note: `${CAVEAT} Similar = loan within 20% and own funds within 3 points of the price.`,
    };
    return {
      hasApplication: true,
      decision: app.final_decision,
      reason,
      property: { price, loan, equity, equityShare: round2(equityShare), collateral, collateralCoversLoan: round2(collateralCover) },
      incomeCheck: { requiredMonthly: Math.round(required), averageSalary: Math.round(salary), salaryCoversRequirement: salary >= required },
      timeline,
      similarApplications: similar,
      approvedCasesCollateralCoverage: { lowest: round2(coverage.lowest), median: round2(coverage.median), applications: coverage.n },
      note:
        "There is no single cut-off: approved and rejected cases overlap on income, equity and collateral (approved applications had collateral covering as little as " +
        `${pct1(coverage.lowest)} of the loan). State the reason on file and the facts; never say a number that would make it pass or call anything a shortfall.`,
      caveat: CAVEAT,
      card,
    };
  },

  /** Cần bao nhiêu tiền mặt cho căn nhà, bao lâu để dành đủ, và cắt chi tiêu hằng ngày thì sớm hơn bao nhiêu tháng. */
  async savingsPlan(q: SavingsPlanQuery) {
    const [{ salary }, req, save, summary, costs] = await Promise.all([
      salaryOf(q.customerId),
      mortgageRepository.requiredIncomeRate(),
      coachService.safeToSave(q.customerId),
      basketsService.getSummary(q.customerId),
      costsFor(q.price),
    ]);
    const down = q.price * (1 - LTV);
    const cashNeeded = down + costs.total;
    const haveNow = save.safeToSave;
    const gap = Math.max(0, cashNeeded - haveNow);
    const capacity = Math.max(0, save.avgMonthlySurplus);
    const everyday = summary.baskets.find((b) => b.id === 3)?.avg6m ?? 0;
    const cutSaving = (everyday * q.cutPct) / 100;
    const months = (perMonth: number) => (gap === 0 ? 0 : perMonth > 0 ? Math.ceil(gap / perMonth) : null);
    const monthsBase = months(capacity);
    const monthsWithCut = months(capacity + cutSaving);
    const loan = q.price - down;
    const incomeAllows = loan <= salary / req.rate;
    const payment = annuityPayment(loan, AVG_RATE, TERM);
    const stress = annuityPayment(loan, STRESS_RATE, TERM);

    const when = (m: number | null) => (m === null ? "not reachable at today's spending" : m === 0 ? "you could do it now" : `${m} months`);
    const rows: FactsCard["rows"] = [
      { label: "Home price", value: eur0(q.price) },
      { label: `Down payment (${pct1(1 - LTV)} of the price)`, value: eur0(down) },
      { label: "Typical buying costs (tax and fees)", value: eur0(costs.total) },
      { label: "You could set aside now", value: eur0(haveNow) },
      { label: "Still to save", value: eur0(gap), tone: gap > 0 ? "warn" : "good" },
      { label: "What you can save each month", value: `${eur0(capacity)} / month` },
      { label: "Time at your pace today", value: when(monthsBase) },
    ];
    if (q.cutPct > 0 && cutSaving > 0)
      rows.push({
        label: `With ${q.cutPct}% less everyday spending`,
        value: monthsWithCut !== null && monthsBase !== null ? `${when(monthsWithCut)} (${monthsBase - monthsWithCut} sooner)` : when(monthsWithCut),
        tone: "good",
      });
    rows.push(
      { label: `Payment on ${eur0(loan)} at ${(AVG_RATE * 100).toFixed(2)}%`, value: `${eur0(payment)} / month` },
      { label: `Payment if rates rise to ${(STRESS_RATE * 100).toFixed(0)}%`, value: `${eur0(stress)} / month` },
      { label: "Your pay is enough for this loan", value: incomeAllows ? "Yes" : "No", tone: incomeAllows ? "good" : "warn" },
    );
    const card: FactsCard = {
      type: "facts",
      title: "Saving for a home",
      headline: { label: "Cash needed", value: eur0(cashNeeded) },
      rows,
      note: `${CAVEAT} Costs are typical medians from S-Pankki applications.`,
    };
    return {
      price: q.price,
      cashNeeded: Math.round(cashNeeded),
      downPayment: Math.round(down),
      purchaseCosts: costs,
      haveNow: Math.round(haveNow),
      stillToSave: Math.round(gap),
      monthlyCapacity: Math.round(capacity),
      monthsAtTodaysPace: monthsBase,
      cut: { pct: q.cutPct, extraPerMonth: Math.round(cutSaving), monthsWithCut, monthsSooner: monthsBase !== null && monthsWithCut !== null ? monthsBase - monthsWithCut : null },
      loan: Math.round(loan),
      monthlyPayment: Math.round(payment),
      stressPayment: Math.round(stress),
      incomeSupportsLoan: incomeAllows,
      caveat: CAVEAT,
      card,
    };
  },

  /** Quy trình vay thật sự diễn ra thế nào: thời gian, số lần liên hệ, giấy tờ, lý do bị từ chối (thống kê trên mọi hồ sơ). */
  async process() {
    const s = await mortgageRepository.processStats();
    const rejected = s.reasons.reduce((a, r) => a + r.n, 0);
    const card: FactsCard = {
      type: "facts",
      title: `How a mortgage application goes (${s.apps} applications)`,
      headline: { label: "Typical time to a decision", value: `${s.p50} days` },
      rows: [
        { label: "Fastest 10% / slowest 10%", value: `${s.p10} / ${s.p90} days` },
        { label: "Contacts with the bank per application", value: `${s.contacts}` },
        { label: "Documents received per application", value: `${s.docs}` },
        { label: "Bank asked for extra collateral", value: `${s.extraCollateralPct}% of applications` },
        { label: "Approved", value: `${s.approved} of ${s.apps}` },
        ...s.reasons.map((r) => ({ label: `Rejected: ${REASONS[r.reason] ?? r.reason}`, value: `${r.n} of ${rejected}` })),
      ],
      note: "Statistics from historical S-Pankki applications in the dataset. Your own case can differ.",
    };
    const chart = {
      type: "bar" as const,
      title: "Days to a decision",
      data: [
        { label: "Fastest 10%", value: s.p10 },
        { label: "Typical", value: s.p50 },
        { label: "Slowest 10%", value: s.p90 },
      ],
    };
    return {
      applications: s.apps,
      approvedShare: round2(s.approved / s.apps),
      daysToDecision: { fastest10: s.p10, typical: s.p50, slowest10: s.p90 },
      contactsPerApplication: s.contacts,
      documentsPerApplication: s.docs,
      extraCollateralRequestedPct: s.extraCollateralPct,
      rejectionReasons: s.reasons.map((r) => ({ reason: REASONS[r.reason] ?? r.reason, count: r.n })),
      caveat: "Statistics from historical S-Pankki applications in the dataset; an individual case can differ.",
      card,
      chart,
    };
  },
};
