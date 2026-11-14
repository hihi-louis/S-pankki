import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import type { LoanStatusResponse, PlansOverview, Recommendation, SummaryResponse } from "@sbank/shared";
import { getLoanStatus, getPlans, getRecommendations, getSummary } from "../api";
import { BasketPie } from "../components/BasketPie";
import { PlanStrip } from "../components/PlanStrip";
import { LoanStrip } from "../components/LoanStrip";
import { RecommendationCarousel } from "../components/RecommendationCarousel";
import { eur } from "../lib/format";
import type { Nav } from "../lib/nav";
import { useCountUp } from "../lib/useCountUp";

/** A euro amount that counts up to its value. */
function Count({ value }: { value: number }) {
  return <>{eur(useCountUp(value))}</>;
}

interface Props {
  customerId: string;
  nav: Nav;
}

/** Cards come in one after another instead of all at once. */
const rise = (i: number) => ({ "--i": i }) as CSSProperties;

/**
 * Overview: recommendations first, then the month at a glance.
 * Each part loads on its own, so a slow or failed one never blocks the other.
 */
export function HomeScreen({ customerId, nav }: Props) {
  const [data, setData] = useState<SummaryResponse | null>(null);
  const [recs, setRecs] = useState<Recommendation[] | null>(null);
  const [loan, setLoan] = useState<LoanStatusResponse | null>(null);
  const [plan, setPlan] = useState<PlansOverview | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getSummary(customerId).then(setData).catch((e: Error) => setError(e.message));
    getPlans(customerId).then(setPlan).catch(() => setPlan(null));
    getLoanStatus(customerId).then(setLoan).catch(() => setLoan(null));
    getRecommendations(customerId).then((r) => setRecs(r.items)).catch(() => setRecs([]));
  }, [customerId]);


  function openRec(r: Recommendation) {
    if (r.target.kind === "ask") nav.ask(r.target.text);
    else nav.open(r.target.kind === "forecast" ? { name: "forecast" } : { name: "insight", id: r.target.id });
  }

  return (
    <main className="home screen-enter">
      {error && <p className="empty">Couldn't load everything: {error}</p>}

      <section className="block rise rec-block" style={rise(0)}>
        <div className="eyebrow">Picked for you</div>
        <h2 className="h-display">Recommendations</h2>
        {recs === null ? (
          <div className="skeleton skeleton-card" />
        ) : recs.length > 0 ? (
          <RecommendationCarousel items={recs} onOpen={openRec} />
        ) : (
          <p className="card-sub">Nothing stands out right now.</p>
        )}
      </section>

      {loan?.context && (
        <section className="block rise" style={rise(1)}>
          <LoanStrip status={loan} onOpen={() => nav.ask("What is the status of my mortgage application?")} />
        </section>
      )}

      <section className="block rise money-block" style={rise(1)}>
        <div className="eyebrow">Insights</div>
        <h2 className="h-display">Know your money</h2>
        {!data ? (
          <div className="card skeleton-money" aria-busy="true">
            <div className="skeleton sk-line sk-wide" /><div className="skeleton sk-big" />
            <div className="skeleton sk-line" /><div className="skeleton sk-line sk-wide" />
          </div>
        ) : (
          <div className="card">
            <div className="glance-balance">
              <div>
                <div className="card-sub">Current balance</div>
                <div className="card-big"><Count value={data.balance} /></div>
              </div>
            </div>
            <div className="card-sub pie-title">Current monthly spending</div>
            <BasketPie baskets={data.baskets} onPick={(basket) => nav.open({ name: "basket", basket })} />
          </div>
        )}
      </section>

      {plan && (plan.goals.length > 0 || plan.weeklyLimit) && (
        <section className="block rise" style={rise(3)}>
          <div className="eyebrow">Plans</div>
          <h2 className="h-display">Your plan</h2>
          <PlanStrip overview={plan} onOpen={() => nav.open({ name: "plans" })} />
        </section>
      )}
    </main>
  );
}
