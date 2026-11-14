import { useEffect, useState } from "react";
import type { ForecastResponse, Insight, PlanProgressResponse, Snapshot, SummaryResponse } from "@sbank/shared";
import { getForecast, getInsights, getPlanProgress, getSnapshot, getSummary } from "../api";
import { BASKET_EMOJI, BASKET_HINT, diffLabel, eur, eur0, monthName, shortDate } from "../lib/format";
import type { Nav } from "../lib/nav";

interface Props {
  customerId: string;
  nav: Nav;
}

/** Overview, in the order a coach would tell it: this month, what stands out, what is coming, your plan. */
export function HomeScreen({ customerId, nav }: Props) {
  const [data, setData] = useState<SummaryResponse | null>(null);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [forecast, setForecast] = useState<ForecastResponse | null>(null);
  const [plan, setPlan] = useState<PlanProgressResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getSummary(customerId)
      .then(setData)
      .catch((e: Error) => setError(e.message));
    // Everything below is a bonus: if one fails the Overview still works
    getSnapshot(customerId).then(setSnapshot).catch(() => setSnapshot(null));
    getInsights(customerId).then((r) => setInsights(r.insights)).catch(() => setInsights([]));
    getForecast(customerId).then(setForecast).catch(() => setForecast(null));
    getPlanProgress(customerId).then(setPlan).catch(() => setPlan(null));
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
        <button className="cta" onClick={() => nav.ask("What can I safely spend this week?")}>
          What can I safely spend? →
        </button>
      </section>

      {snapshot && (
        <>
          <h2 className="section-title">{month} at a glance</h2>
          <div className="card">
            <div className="snap-message">{snapshot.message}</div>
            <div className="snap-tiles">
              <div><div className="card-sub">Spent</div><div className="snap-num">{eur0(snapshot.spent)}</div></div>
              <div><div className="card-sub">Usual</div><div className="snap-num">{eur0(snapshot.usualSpent)}</div></div>
              <div><div className="card-sub">Income</div><div className="snap-num">{eur0(snapshot.income)}</div></div>
            </div>
            <div className="card-sub">
              {snapshot.net >= 0 ? `${eur0(snapshot.net)} left after spending` : `Spent ${eur0(-snapshot.net)} more than came in`} this month. Tap a category to see why.
            </div>
            <div className="cat-list">
              {snapshot.categories.filter((c) => c.now > 0).slice(0, 6).map((c) => (
                <button key={c.category} className="cat-row" onClick={() => nav.open({ name: "category", category: c.category })}>
                  <span className={`dot c${c.basket - 1}`} aria-hidden="true" />
                  <span className="cat-name">{c.category}</span>
                  <span className="cat-amt">{eur0(c.now)}</span>
                  <span className={`cat-diff ${c.diffPct !== null && c.diffPct > 25 ? "up" : c.diffPct !== null && c.diffPct < -25 ? "down" : ""}`}>{diffLabel(c.diffPct)}</span>
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {insights.length > 0 && (
        <>
          <h2 className="section-title">For you</h2>
          {insights.map((i) => (
            <button key={i.id} className={`insight ${i.tone}`} onClick={() => nav.open({ name: "insight", id: i.id })}>
              <span className="insight-title">{i.title}</span>
              <span className="insight-body">{i.body}</span>
              <span className="insight-ask">See the story →</span>
            </button>
          ))}
        </>
      )}

      {forecast && (
        <>
          <h2 className="section-title">Looking ahead</h2>
          <button className={`card forecast-card${forecast.runsOutOn ? " fc-alert" : ""}`} onClick={() => nav.open({ name: "forecast" })}>
            <span className="card-label">Safe spending forecast</span>
            <span className="card-big">{eur0(forecast.safePerDay)}<span className="card-unit"> / day</span></span>
            <span className="card-sub">
              {forecast.runsOutOn
                ? `At your usual pace you would run out on ${shortDate(forecast.runsOutOn)}.`
                : `Safe to spend until payday on ${shortDate(forecast.nextPayday.date)}; at your usual pace you reach it with ${eur0(forecast.endUsual)}.`}
            </span>
            <span className="insight-ask">See the forecast →</span>
          </button>
        </>
      )}

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
            <button className="insight info" onClick={() => nav.ask("Make me a spending plan")}>
              <span className="insight-title">Make a spending plan</span>
              <span className="insight-body">A monthly plan from your own numbers: what to keep for essentials, what to spend, what to save.</span>
              <span className="insight-ask">Build one →</span>
            </button>
          )}
        </>
      )}

      <h2 className="section-title">Your three baskets</h2>

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
            onClick={() => nav.ask(`Tell me about my ${b.name.toLowerCase()} in ${month}`)}
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
