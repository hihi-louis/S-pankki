import { useEffect, useState } from "react";
import type { BasketTransactions } from "@sbank/shared";
import { getBasketTransactions } from "../api";
import { eur, shortDate } from "../lib/format";
import type { Nav } from "../lib/nav";

/** The purchases behind one slice of the pie. Tap a purchase to look at its category. */
export function BasketScreen({ customerId, basket, nav }: { customerId: string; basket: 1 | 2 | 3; nav: Nav }) {
  const [data, setData] = useState<BasketTransactions | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getBasketTransactions(customerId, basket).then(setData).catch((e: Error) => setError(e.message));
  }, [customerId, basket]);

  return (
    <main className="home detail screen-enter">
      <button className="back" onClick={nav.back}>← Overview</button>
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
            {data.items.length === 0 && <p className="card-sub">No purchases in this group yet.</p>}
            {data.items.map((t, i) => (
              <button key={`${t.date}-${i}`} className="tx-row" onClick={() => nav.open({ name: "category", category: t.category })}>
                <span className="tx-main">
                  <span className="tx-label">{t.label}</span>
                  <span className="tx-sub">{t.category} · {shortDate(t.date)}</span>
                </span>
                <span className="tx-amt">{eur(t.amount)}</span>
              </button>
            ))}
            {data.truncated && <p className="card-sub tx-more">Showing the newest {data.items.length} of {data.count}.</p>}
          </div>
        </>
      )}
    </main>
  );
}
