import type { LoanStatusResponse } from "@sbank/shared";
import { eur0, shortDate } from "../lib/format";
import { demoLoanOpen } from "../lib/demo";

/** One line about the home loan, shown only when it matters for spending (open application or a recent decision). */
export function LoanStrip({ status, onOpen }: { status: LoanStatusResponse; onOpen: () => void }) {
  const c = status.context;
  if (!c) return null;
  const title =
    c.state === "in_progress" ? `Open since ${shortDate(c.startedOn)}`
    : c.decision === "approved" ? `Approved ${shortDate(c.decidedOn ?? "")}`
    : `Not approved ${shortDate(c.decidedOn ?? "")}`;
  const sub =
    c.state === "in_progress" ? `Held back from safe-to-spend: ${eur0(status.reserve)} until the bank decides`
    : c.decision === "approved" ? `About ${eur0(c.estimatedMonthlyPayment)} a month, plus about ${eur0(c.typicalBuyingCosts)} buying costs (estimates)`
    : "Tap to see what the data shows";
  return (
    <button className={`loan-strip ${c.state === "in_progress" ? "open" : c.decision ?? ""}`} onClick={onOpen}>
      <span className="loan-strip-icon" aria-hidden="true">⌂</span>
      <span className="loan-strip-main">
        <span className="loan-strip-title">Home loan · {title}{demoLoanOpen() && <em className="loan-demo">demo</em>}</span>
        <span className="loan-strip-sub">{sub}</span>
      </span>
      <span aria-hidden="true">→</span>
    </button>
  );
}
