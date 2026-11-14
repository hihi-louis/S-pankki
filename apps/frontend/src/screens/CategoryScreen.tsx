import { useEffect, useState } from "react";
import type { CategoryDive } from "@sbank/shared";
import { getCategory } from "../api";
import { MiniChart } from "../components/Cards";
import { diffLabel, eur0, shortDate } from "../lib/format";
import type { Nav } from "../lib/nav";

export function CategoryScreen({ customerId, category, nav }: { customerId: string; category: string; nav: Nav }) {
  const [data, setData] = useState<CategoryDive | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getCategory(customerId, category).then(setData).catch((e: Error) => setError(e.message));
  }, [customerId, category]);

  return (
    <main className="home detail screen-enter">
      <button className="back" onClick={nav.back}>← Overview</button>
      <h2 className="detail-title">{category}</h2>
      {error && <p className="empty">Couldn't load: {error}</p>}
      {!data && !error && <div className="skeleton" />}
      {data && (
        <>
          <div className="card card-accent">
            <div className="card-label">{data.basketName} · this month</div>
            <div className="card-big">{eur0(data.now)}</div>
            <div className="card-sub">
              Usual {eur0(data.usual)} a month ·{" "}
              <span className={data.diffPct !== null && data.diffPct > 0 ? "up" : "down"}>{diffLabel(data.diffPct)} vs usual</span>
            </div>
          </div>

          <MiniChart chart={{ type: "bar", title: `${data.category} by month (€)`, data: data.trend }} />

          {data.merchants.length > 0 && (
            <div className="card">
              <div className="card-label">Where it went this month</div>
              {data.merchants.map((m) => (
                <div key={m.label} className="meter-row">
                  <div className="meter-label"><span>{m.label}</span><span>{eur0(m.spent)}</span></div>
                  <div className="meter" role="img" aria-label={`${m.label}: ${m.sharePct}% of the category`}>
                    <div className="meter-fill" style={{ width: `${Math.min(100, m.sharePct)}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}

          {data.biggest.length > 0 && (
            <div className="card">
              <div className="card-label">Largest purchases</div>
              <dl className="facts">
                {data.biggest.map((b) => (
                  <div key={`${b.date}-${b.label}-${b.amount}`} className="facts-row">
                    <dt>{b.label} · {shortDate(b.date)}</dt>
                    <dd>{eur0(b.amount)}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}

          {data.peers && (
            <div className="card">
              <div className="card-label">Compared with {data.peers.peerGroup}</div>
              <div className="whatif-row">
                <div><div className="card-big">{eur0(data.peers.you)}</div><div className="card-sub">you, a month</div></div>
                <div><div className="card-big">{eur0(data.peers.peers)}</div><div className="card-sub">peers, a month</div></div>
              </div>
              <div className="card-sub">Source: {data.peers.source}. A rough guide, not a judgment.</div>
            </div>
          )}

          <button className="cta" onClick={() => nav.ask(`What did I spend on ${data.category.replace("&", "and").toLowerCase()} this month?`)}>
            Ask the coach about this →
          </button>
        </>
      )}
    </main>
  );
}
