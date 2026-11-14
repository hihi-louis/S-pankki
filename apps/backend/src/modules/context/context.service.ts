import { coachService } from "../coach/coach.service.js";
import { mortgageRepository } from "../mortgage/mortgage.repository.js";
import { mortgageService, type LoanContext } from "../mortgage/mortgage.service.js";

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Safe-to-spend that also knows about the customer's home loan. Cash flow alone can look fine while a loan is being decided
 * or has just been approved, so we hold back what the loan is about to cost: the first monthly payment and the usual buying costs.
 * Nothing is held back for a rejected application. The held-back amount is an estimate from public averages, not the bank's rule.
 */
export const moneyContext = {
  async safeToSpend(customerId: string) {
    const [safe, loan] = await Promise.all([coachService.safeToSpend(customerId), mortgageService.loanContext(customerId)]);
    const reserve = loan && loan.decision !== "rejected" ? loan.estimatedMonthlyPayment + loan.typicalBuyingCosts : 0;
    const after = round2(Math.max(0, safe.safeToSpend - reserve));
    return {
      ...safe,
      loanContext: loan,
      /** Held back for the home loan (first payment + usual buying costs). 0 without a loan or after a rejection. */
      loanReserve: reserve,
      /** What is left after that. Equals safeToSpend when there is no reserve. */
      safeAfterLoan: reserve > 0 ? after : safe.safeToSpend,
      safeAfterLoanPerDay: reserve > 0 ? round2(after / safe.daysLeft) : safe.perDay,
    };
  },
};

export type SafeWithLoan = Awaited<ReturnType<typeof moneyContext.safeToSpend>>;
export type { LoanContext };

/** For the Overview strip and the demo switch. */
export async function loanStatus(customerId: string) {
  const [app, ctx] = await Promise.all([mortgageRepository.applicationFor(customerId), mortgageService.loanContext(customerId)]);
  const reserve = ctx && ctx.decision !== "rejected" ? ctx.estimatedMonthlyPayment + ctx.typicalBuyingCosts : 0;
  return { hasApplication: Boolean(app), context: ctx, reserve };
}
