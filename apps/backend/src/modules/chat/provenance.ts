import type { Provenance } from "@sbank/shared";
import { periodLabel } from "../../lib/dates.js";

const DATA = "S-Pankki transactions (synthetic dataset), up to 30 Sep 2026";
const FIN_FSA = "https://www.finanssivalvonta.fi/en/consumers/borrowing/housing-loans-and-loan-cap/";
const BOF = "https://www.suomenpankki.fi/en/statistics/statistical-news/mfi-balance-sheet/2026/interest-rates-on-household-loans-increased-in-may-2026/";

const when = (r: any) => (r?.period ? periodLabel(r.period.from, r.period.to) : undefined);

/** Giải thích cách tính cho từng tool: công thức bằng ngôn ngữ thường, dữ liệu đã dùng, và nguồn. Không chứa con số bịa: chỉ mô tả cách làm. */
export function provenanceFor(name: string, args: any, r: any): Provenance | null {
  if (!r || r.error) return null;
  switch (name) {
    case "query_spending":
      return { title: "Spending total", how: "Sum of card and account payments (not salary, income or transfers) in the period, with your filters.", data: `${r.count} transactions, ${when(r)}`, source: DATA };
    case "spending_breakdown":
      return { title: `Spending by ${r.groupBy}`, how: "Payments in the period grouped by one field; the share is each group divided by the total.", data: `${r.transactionCount} transactions, ${when(r)}`, source: DATA };
    case "compare_periods":
      return { title: "Period comparison", how: "Total of the newer period minus the total of the baseline; the change is that difference divided by the baseline.", data: `${periodLabel(r.periodA.from, r.periodA.to)} vs ${periodLabel(r.periodB.from, r.periodB.to)}`, source: DATA };
    case "recurring_payments":
      return { title: "Regular payments", how: "A payee counts as regular if it appears in at least 4 of the last 6 months with amounts within 35% of its average.", data: "Last 6 full months", source: DATA };
    case "income_summary":
      return { title: "Income", how: "Salary plus other income per month; saved = investment deposits minus withdrawals. Steady means the months differ by less than 25% from the average.", data: "Last 6 full months", source: DATA };
    case "get_baskets":
      return { title: "Three baskets", how: "This month's spending per basket against the average of the last 6 months. Baskets follow S-Bank's definition: regular essentials, unexpected necessities, everyday spending.", data: `Month ${r.month}`, source: DATA };
    case "safe_to_spend":
      return { title: "Safe to spend", how: "Balance minus the essentials you usually pay before the next payday (6-month average x days left / 30). Per day = that amount / days left.", data: `Balance and payday as of ${r.nextPayday?.date ? "30 Sep 2026" : "the latest data"}${r.paydayIsEstimate ? "; payday is an estimate" : ""}`, source: DATA };
    case "safe_to_save":
      return { title: "Safe to save", how: "Balance minus the expected essentials, unexpected costs and everyday spending until payday (6-month averages x days left / 30). Months covered = balance / monthly essentials.", data: "Last 6 full months", source: DATA };
    case "simulate_whatif":
      return { title: "What-if saving", how: "6-month average of the chosen basket or category times the cut; per year = per month x 12.", data: "Last 6 full months", source: DATA };
    case "spender_profile":
      return { title: "Spender profile", how: "Your share of everyday spending ranked against all customers in the dataset (percentile).", data: "5,100 customers, 6 months", source: DATA };
    case "compare_with_peers":
      return {
        title: "Peer comparison",
        how: "Your monthly average over 6 months against Finns of the same age group, per consumption unit, excluding imputed rent. Only categories that match clearly are compared; treat it as a rough guide.",
        data: r.peerGroup,
        source: `${r.source}, household budget survey`,
        sourceUrl: "https://pxdata.stat.fi/PxWeb/pxweb/en/StatFin/StatFin__ktutk/14q4.px",
      };
    case "mortgage_affordability":
      return {
        title: "Borrowing estimate",
        how: `Maximum loan = monthly salary / ${r.requiredIncomeRate}% (the income S-Pankki applications needed, per month, as a share of the loan). Payments are ${r.assumptions?.termYears}-year annuities at ${r.assumptions?.avgRatePct}% (Bank of Finland, May 2026) and at the ${r.assumptions?.stressRatePct}% stress rate FIN-FSA advises. Not a loan decision.`,
        data: `${r.basedOnApplications} S-Pankki applications; your average salary`,
        source: "S-Pankki mortgage data, Bank of Finland, FIN-FSA",
        sourceUrl: BOF,
      };
    case "mortgage_status":
      return { title: "Your application", how: "Your application record and its event log from the dataset. Similar applications have a loan within 20% and own funds within 3 points of the price. There is no single cut-off in the data.", data: r.hasApplication ? "1 application, event log" : undefined, source: "S-Pankki mortgage data" };
    case "contact_support":
      return { title: "S-Pankki contact details", how: "Official S-Pankki customer service numbers, copied from s-pankki.fi. I cannot see or change your accounts, cards or logins.", data: `Checked ${r.checkedOn}`, source: "S-Pankki", sourceUrl: r.sourceUrl };
    case "housing_price":
      return {
        title: "Home price estimate",
        how: "Average price per m² of old dwellings sold in that area, times the size you gave. It is an average of real sales, not a valuation of one home.",
        data: r.found ? `${r.area}, ${r.year}${r.salesBehindPrice ? `, ${r.salesBehindPrice} sales` : ""}` : undefined,
        source: "Statistics Finland, prices of old dwellings in housing companies",
        sourceUrl: "https://pxdata.stat.fi/PxWeb/api/v1/en/StatFin/ashi/",
      };
    case "mortgage_savings_plan":
      return {
        title: "Saving for a home",
        how: "Cash needed = down payment (the price minus the 90% loan cap) plus typical costs (median transfer tax share and fees in S-Pankki cases). Months = still to save / your average monthly surplus.",
        data: "Last 6 full months; S-Pankki application costs",
        source: "S-Pankki mortgage data, FIN-FSA loan cap",
        sourceUrl: FIN_FSA,
      };
    case "mortgage_process":
      return { title: "How applications go", how: "Statistics over all applications in the dataset: time from the first event to the decision, contacts, documents and decisions.", data: `${r.applications} applications`, source: "S-Pankki mortgage data" };
    case "propose_plan":
      return { title: "Your plan", how: "Caps are your 6-month averages. Saving = (goal minus what you can set aside now) / months. Everyday cap = income minus essentials, unexpected costs and saving.", data: "Last 6 full months", source: DATA };
    case "plan_progress":
      return { title: "Plan progress", how: "This month's spending per basket against the caps in your saved plan; saved = investment deposits this month.", data: `Month ${r.month}`, source: DATA };
    default:
      return null;
  }
}
