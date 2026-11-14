import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import type { Recommendation, Snapshot, SummaryResponse } from "@sbank/shared";
import { getRecommendations, getSnapshot, getSummary } from "../api";
import { RecommendationCarousel } from "../components/RecommendationCarousel";
import { diffLabel, eur, eur0, monthName, shortDate } from "../lib/format";
import type { Nav } from "../lib/nav";
import { useCountUp } from "../lib/useCountUp";

/** A euro amount that counts up to its value. */
function Count({ value, whole = false }: { value: number; whole?: boolean }) {
  const v = useCountUp(value);
  return <>{whole ? eur0(v) : eur(v)}</>;
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
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [recs, setRecs] = useState<Recommendation[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getSummary(customerId).then(setData).catch((e: Error) => setError(e.message));
    getSnapshot(customerId).then(setSnapshot).catch(() => setSnapshot(null));
    getRecommendations(customerId).then((r) => setRecs(r.items)).catch(() => setRecs([]));
  }, [customerId]);

  const month = data ? monthName(data.month) : "This month";

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
          <p className="card-sub">Nothing stands out right now.</p>
        )}
      </section>

      <section className="block rise" style={rise(1)}>
        <div className="eyebrow">Your money</div>
        <h2 className="h-display">{month} at a glance</h2>
        {!data && !snapshot ? (
          <div className="card skeleton-money" aria-busy="true">
            <div className="skeleton sk-line sk-wide" /><div className="skeleton sk-big" />
            <div className="skeleton sk-line" /><div className="skeleton sk-line sk-wide" /><div className="skeleton sk-line" />
          </div>
        ) : (
          <div className="card">
            {data && (
              <div className="glance-balance">
                <div>
                  <div className="card-sub">Balance on {shortDate(data.asOf ?? data.nextPayday.date)}</div>
                  <div className="card-big"><Count value={data.balance} /></div>
                </div>
                <div className="glance-pay">
                  <div className="card-sub">Next pay{data.nextPayday.estimated ? " (guess)" : ""}</div>
                  <div className="glance-pay-date">{shortDate(data.nextPayday.date)}</div>
                  <div className="card-sub">about {eur0(data.nextPayday.expected)}</div>
                </div>
              </div>
            )}
            {snapshot && (
              <>
                <div className="snap-tiles">
                  <div><div className="card-sub">Spent</div><div className="snap-num"><Count whole value={snapshot.spent} /></div></div>
                  <div><div className="card-sub">Usual</div><div className="snap-num"><Count whole value={snapshot.usualSpent} /></div></div>
                  <div><div className="card-sub">Came in</div><div className="snap-num"><Count whole value={snapshot.income} /></div></div>
                </div>
                {snapshot.vsUsualPct !== null && (
                  <div className={`snap-line ${snapshot.vsUsualPct >= 0 ? "up" : "down"}`}>
                    {snapshot.vsUsualPct >= 0 ? "▲" : "▼"} {Math.abs(snapshot.vsUsualPct)}% {snapshot.vsUsualPct >= 0 ? "more" : "less"} than a normal month
                  </div>
                )}
                <div className="card-sub">{snapshot.net >= 0 ? `${eur0(snapshot.net)} left after spending.` : `You spent ${eur0(-snapshot.net)} more than came in.`}</div>
                <div className="cat-hint">Tap a category to see why</div>
                <div className="cat-list">
                  {(() => {
                    const rows = snapshot.categories.filter((c) => c.now > 0).slice(0, 6);
                    const top = Math.max(...rows.map((c) => c.now), 1);
                    return rows.map((c, i) => (
                    <button key={c.category} className="cat-row" style={{ "--w": `${Math.max(4, (c.now / top) * 100)}%`, "--d": `${300 + i * 70}ms` } as CSSProperties} onClick={() => nav.open({ name: "category", category: c.category })}>
                      <span className={`dot c${c.basket - 1}`} aria-hidden="true" />
                      <span className="cat-name">{c.category}<span className="cat-bar" aria-hidden="true" /></span>
                      <span className="cat-amt">{eur0(c.now)}</span>
                      <span className={`cat-diff ${c.diffPct !== null && c.diffPct > 25 ? "up" : c.diffPct !== null && c.diffPct < -25 ? "down" : ""}`}>{diffLabel(c.diffPct)}</span>
                    </button>
                    ));
                  })()}
                </div>
              </>
            )}
          </div>
        )}
      </section>
    </main>
  );
}
