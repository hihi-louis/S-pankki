import { useEffect, useState } from "react";
import type { Insight, PlanProgressResponse, SummaryResponse } from "@sbank/shared";
import { getInsights, getPlanProgress, getSummary } from "../api";
import { BASKET_EMOJI, BASKET_HINT, eur, eur0, monthName, shortDate } from "../lib/format";

interface Props {
  customerId: string;
  onAsk: (text: string) => void;
}

export function HomeScreen({ customerId, onAsk }: Props) {
  const [data, setData] = useState<SummaryResponse | null>(null);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [plan, setPlan] = useState<PlanProgressResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getSummary(customerId)
      .then(setData)
      .catch((e: Error) => setError(e.message));
    // Insights are a bonus: if they fail the Overview still works
    getInsights(customerId)
      .then((r) => setInsights(r.insights))
      .catch(() => setInsights([]));
    getPlanProgress(customerId)
      .then(setPlan)
      .catch(() => setPlan(null));
  }, [customerId]);

  if (error) return <main className="home"><p className="empty">Couldn't load: {error}</p></main>;
  if (!data) return <main className="home"><div className="skeleton" /><div className="skeleton" /><div className="skeleton" /></main>;

  const month = monthName(data.month);
  const total = data.baskets.reduce((s, b) => s + b.spent, 0) || 1;

  return (
    <main className="home">
      <section className="hero">
        <div className="hero-label">Balance{data.asOf ? ` · ${shortDate(data.asOf)}` : ""}</div>
        <div className="hero-big">{eur(data.balance)}</div>
        <div className="hero-sub">
          Next salary ~{shortDate(data.nextPayday.date)} · about {eur0(data.nextPayday.expected)}
          {data.nextPayday.estimated && " (estimate: your pay days vary)"}
        </div>
        <button className="cta" onClick={() => onAsk("What can I safely spend this week?")}>
          What can I safely spend? →
        </button>
      </section>

      {plan && (
        <>
          <h2 className="section-title">Your plan</h2>
          {plan.plan ? (
            <div className={`card plan ${plan.status}`}>
              <div className="plan-head">{plan.message}</div>
              {plan.baskets.map((b) => (
                <div key={b.id} className="meter-row">
                  <div className="meter-label">
                    <span>{b.name}</span>
                    <span>{eur0(b.spent)} of {eur0(b.cap)}</span>
                  </div>
                  <div className="meter" role="img" aria-label={`${b.name}: ${b.pct}% of the plan`}>
                    <div className={`meter-fill ${b.pct > 100 ? "over" : b.pct >= 85 ? "watch" : ""}`} style={{ width: `${Math.min(100, b.pct)}%` }} />
                  </div>
                </div>
              ))}
              <div className="meter-row">
                <div className="meter-label">
                  <span>Saved this month</span>
                  <span>{eur0(plan.saving.actual)} of {eur0(plan.saving.target)}</span>
                </div>
                <div className="meter" role="img" aria-label={`Saved ${plan.saving.pct}% of the monthly target`}>
                  <div className="meter-fill good" style={{ width: `${Math.min(100, plan.saving.pct)}%` }} />
                </div>
              </div>
              <div className="card-sub">
                {plan.plan.goalLabel}
                {plan.plan.goalAmount !== null ? `: ${eur0(plan.plan.goalAmount)}` : ""} · everyday allowance about {eur0(plan.weeklyEverydayAllowance)} a week
              </div>
            </div>
          ) : (
            <button className="insight info" onClick={() => onAsk("Make me a spending plan")}>
              <span className="insight-title">Make a spending plan</span>
              <span className="insight-body">A monthly plan from your own numbers: what to keep for essentials, what to spend, what to save.</span>
              <span className="insight-ask">Build one →</span>
            </button>
          )}
        </>
      )}

      {insights.length > 0 && (
        <>
          <h2 className="section-title">For you</h2>
          {insights.map((i) => (
            <button key={i.id} className={`insight ${i.tone}`} onClick={() => onAsk(i.ask)}>
              <span className="insight-title">{i.title}</span>
              <span className="insight-body">{i.body}</span>
              <span className="insight-ask">Ask about it →</span>
            </button>
          ))}
        </>
      )}

      <h2 className="section-title">Where your money went in {month}</h2>

      <div className="stack stack-lg">
        {data.baskets.map((b) => (
          <div key={b.id} className={`stack-seg c${b.id - 1}`} style={{ width: `${(b.spent / total) * 100}%` }} />
        ))}
      </div>

      {data.baskets.map((b) => {
        const diff = b.spent - b.avg6m;
        const pct = b.avg6m ? Math.round((diff / b.avg6m) * 100) : 0;
        return (
          <button
            key={b.id}
            className="basket"
            onClick={() => onAsk(`Tell me about my ${b.name.toLowerCase()} in ${month}`)}
          >
            <span className={`basket-icon c${b.id - 1}`}>{BASKET_EMOJI[b.id]}</span>
            <span className="basket-body">
              <span className="basket-row">
                <span className="basket-name">{b.name}</span>
                <span className="basket-amt">{eur0(b.spent)}</span>
              </span>
              <span className="basket-hint">{BASKET_HINT[b.id]}</span>
              <span className="basket-row basket-meta">
                <span>{b.top.map((t) => t.category).join(" · ")}</span>
                {b.avg6m > 0 && (
                  <span className={diff > 0 ? "up" : "down"}>
                    {diff > 0 ? "▲" : "▼"} {Math.abs(pct)}% vs usual
                  </span>
                )}
              </span>
            </span>
          </button>
        );
      })}
    </main>
  );
}
