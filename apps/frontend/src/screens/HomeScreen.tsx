import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import type { ForecastResponse, PlanProgressResponse, Recommendation, Snapshot, SummaryResponse } from "@sbank/shared";
import { getForecast, getPlanProgress, getRecommendations, getSnapshot, getSummary } from "../api";
import { IconArrowDownRight, IconEuro, IconTarget, IconTrendUp } from "../components/Icons";
import { RecommendationCarousel } from "../components/RecommendationCarousel";
import { BASKET_EMOJI, BASKET_HINT, diffLabel, eur, eur0, monthName, shortDate } from "../lib/format";
import type { Nav } from "../lib/nav";

interface Props {
  customerId: string;
  nav: Nav;
}

const QUESTIONS = [
  { q: "Where did my money go?", Icon: IconArrowDownRight },
  { q: "What kind of spender am I?", Icon: IconTarget },
  { q: "What can I safely spend this week?", Icon: IconEuro },
  { q: "How could I save more?", Icon: IconTrendUp },
];

/** Cards come in one after another instead of all at once. */
const rise = (i: number) => ({ "--i": i }) as CSSProperties;

/**
 * Overview: recommendations first, then quick questions, then the month in detail.
 * Each part loads on its own, so a slow or failed one never blocks the rest.
 */
export function HomeScreen({ customerId, nav }: Props) {
  const [data, setData] = useState<SummaryResponse | null>(null);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [recs, setRecs] = useState<Recommendation[] | null>(null);
  const [forecast, setForecast] = useState<ForecastResponse | null>(null);
  const [plan, setPlan] = useState<PlanProgressResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getSummary(customerId).then(setData).catch((e: Error) => setError(e.message));
    getSnapshot(customerId).then(setSnapshot).catch(() => setSnapshot(null));
    getRecommendations(customerId).then((r) => setRecs(r.items)).catch(() => setRecs([]));
    getForecast(customerId).then(setForecast).catch(() => setForecast(null));
    getPlanProgress(customerId).then(setPlan).catch(() => setPlan(null));
  }, [customerId]);

  const month = data ? monthName(data.month) : "This month";
  const total = data ? data.baskets.reduce((s, b) => s + b.spent, 0) || 1 : 1;

  function openRec(r: Recommendation) {
    nav.open(r.target.kind === "forecast" ? { name: "forecast" } : { name: "insight", id: r.target.id });
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
          <p className="card-sub">Nothing stands out right now. Ask me anything below.</p>
        )}
      </section>

      <section className="block rise" style={rise(1)}>
        <div className="eyebrow">Ask your coach</div>
        <h2 className="h-display">What would you like to know?</h2>
        <div className="ask-grid">
          {QUESTIONS.map(({ q, Icon }) => (
            <button key={q} className="ask-card" onClick={() => nav.ask(q)}>
              <span className="ask-icon"><Icon /></span>
              {q}
            </button>
          ))}
        </div>
      </section>

      <section className="block rise" style={rise(2)}>
        <div className="eyebrow">Your money</div>
        <h2 className="h-display">{month} at a glance</h2>
        {!data && !snapshot ? (
          <div className="skeleton" />
        ) : (
          <div className="card">
            {data && (
              <div className="glance-balance">
                <div>
                  <div className="card-sub">Balance{data.asOf ? ` on ${shortDate(data.asOf)}` : ""}</div>
                  <div className="card-big">{eur(data.balance)}</div>
                </div>
                <div className="glance-pay">
                  <div className="card-sub">Next pay</div>
                  <div className="glance-pay-date">
                    {shortDate(data.nextPayday.date)}
                    {data.nextPayday.estimated ? " (a guess)" : ""}
                  </div>
                  <div className="card-sub">about {eur0(data.nextPayday.expected)}</div>
                </div>
              </div>
            )}
            {snapshot && (
              <>
                <div className="snap-message">{snapshot.message}</div>
                <div className="snap-tiles">
                  <div><div className="card-sub">Spent</div><div className="snap-num">{eur0(snapshot.spent)}</div></div>
                  <div><div className="card-sub">Normal month</div><div className="snap-num">{eur0(snapshot.usualSpent)}</div></div>
                  <div><div className="card-sub">Came in</div><div className="snap-num">{eur0(snapshot.income)}</div></div>
                </div>
                <div className="card-sub">
                  {snapshot.net >= 0 ? `${eur0(snapshot.net)} left after spending` : `You spent ${eur0(-snapshot.net)} more than came in`} this month. Tap a category to see why.
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
              </>
            )}
          </div>
        )}
      </section>

      {forecast && (
        <section className="block rise" style={rise(3)}>
          <div className="eyebrow">Looking ahead</div>
          <h2 className="h-display">Until your next pay</h2>
          <button className={`card forecast-card${forecast.runsOutOn || forecast.shortfall > 0 ? " fc-alert" : ""}`} onClick={() => nav.open({ name: "forecast" })}>
            <span className="card-label">Safe to spend each day</span>
            <span className="card-big">{eur0(forecast.safePerDay)}<span className="card-unit"> / day</span></span>
            <span className="card-sub">
              {forecast.runsOutOn
                ? `If you spend the way you usually do, you would run out on ${shortDate(forecast.runsOutOn)}.`
                : `Spend like you usually do and you reach payday on ${shortDate(forecast.nextPayday.date)} with about ${eur0(forecast.endUsual)}.`}
            </span>
            <span className="insight-ask">See the day-by-day view →</span>
          </button>
        </section>
      )}

      {plan && (
        <section className="block rise" style={rise(4)}>
          <div className="eyebrow">Your plan</div>
          <h2 className="h-display">{plan.plan ? "How you are doing" : "Make a plan"}</h2>
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
                {plan.plan.goalAmount !== null ? `: ${eur0(plan.plan.goalAmount)}` : ""} · about {eur0(plan.weeklyEverydayAllowance)} a week for everyday things
              </div>
            </div>
          ) : (
            <button className="insight info" onClick={() => nav.ask("Make me a spending plan")}>
              <span className="insight-title">Make a spending plan</span>
              <span className="insight-body">A monthly plan built from your own numbers: what to keep for bills, what to spend, what to save.</span>
              <span className="insight-ask">Build one →</span>
            </button>
          )}
        </section>
      )}

      {data && (
        <section className="block rise" style={rise(5)}>
          <div className="eyebrow">Your three groups</div>
          <h2 className="h-display">Where your money went</h2>
          <div className="stack stack-lg">
            {data.baskets.map((b) => (
              <div key={b.id} className={`stack-seg c${b.id - 1}`} style={{ width: `${(b.spent / total) * 100}%` }} />
            ))}
          </div>
          {data.baskets.map((b) => {
            const diff = b.spent - b.avg6m;
            const pct = b.avg6m ? Math.round((diff / b.avg6m) * 100) : 0;
            return (
              <button key={b.id} className="basket" onClick={() => nav.ask(`Tell me about my ${b.name.toLowerCase()} in ${month}`)}>
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
                        {diff > 0 ? "▲" : "▼"} {Math.abs(pct)}% vs a normal month
                      </span>
                    )}
                  </span>
                </span>
              </button>
            );
          })}
        </section>
      )}
    </main>
  );
}
