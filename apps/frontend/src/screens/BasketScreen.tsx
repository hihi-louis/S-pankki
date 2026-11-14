import { useEffect, useState } from "react";
import type { BasketTransactions } from "@sbank/shared";
import { getBasketTransactions } from "../api";
import { eur, shortDate } from "../lib/format";
import type { Nav } from "../lib/nav";

const anchor = (c: string) => `cat-${c.replace(/\W+/g, "-")}`;

/** The purchases behind one slice of the pie: every category with its total, then its purchases. Tap a purchase to look at its category. */
export function BasketScreen({ customerId, basket, nav }: { customerId: string; basket: 1 | 2 | 3; nav: Nav }) {
  const [data, setData] = useState<BasketTransactions | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getBasketTransactions(customerId, basket).then(setData).catch((e: Error) => setError(e.message));
  }, [customerId, basket]);

  return (
    <main className="home detail screen-enter">
      <button className="back" onClick={nav.back} aria-label="Back to Overview">←</button>
      <h2 className="detail-title">{data?.basketName ?? "Transactions"}</h2>
      {error && <p className="empty">Couldn't load: {error}</p>}
      {!data && !error && <div className="skeleton" />}
      {data && (
        <>
          <div className={`card card-accent c${basket - 1}`}>
            <div className="card-label">This month</div>
            <div className="card-big">{eur(data.total)}</div>
            <div className="card-sub">{data.count} purchase{data.count === 1 ? "" : "s"}</div>
          </div>
          <div className="card tx-card">
            <div className="card-label">Categories</div>
            {data.categories.map((g) => (
              <button key={g.category} className="tx-row" onClick={() => document.getElementById(anchor(g.category))?.scrollIntoView({ behavior: "smooth", block: "start" })}>
                <span className="tx-main">
                  <span className="tx-label">{g.category}</span>
                  <span className="tx-sub">{g.count} purchase{g.count === 1 ? "" : "s"}</span>
                </span>
                <span className="tx-amt">{eur(g.total)}</span>
              </button>
            ))}
          </div>
          {data.categories.map((g) => (
            <div key={g.category} id={anchor(g.category)} className="card tx-card tx-group">
              <div className="tx-head">
                <span className="tx-head-name">{g.category}</span>
                <span className="tx-head-total">{eur(g.total)}</span>
              </div>
              {g.items.map((t, i) => (
                <button key={`${t.date}-${i}`} className="tx-row" onClick={() => nav.open({ name: "category", category: g.category })}>
                  <span className="tx-main">
                    <span className="tx-label">{t.label}</span>
                    <span className="tx-sub">{shortDate(t.date)}</span>
                  </span>
                  <span className="tx-amt">{eur(t.amount)}</span>
                </button>
              ))}
            </div>
          ))}
          {data.truncated && <p className="card-sub tx-more">Some purchases are not shown.</p>}
        </>
      )}
    </main>
  );
}
