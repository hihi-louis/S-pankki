import { useEffect, useState } from "react";
import type { SummaryResponse } from "@sbank/shared";
import { getSummary } from "../api";
import { BASKET_EMOJI, BASKET_HINT, eur, eur0, monthName, shortDate } from "../lib/format";

interface Props {
  customerId: string;
  onAsk: (text: string) => void;
}

export function HomeScreen({ customerId, onAsk }: Props) {
  const [data, setData] = useState<SummaryResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getSummary(customerId)
      .then(setData)
      .catch((e: Error) => setError(e.message));
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
        </div>
        <button className="cta" onClick={() => onAsk("What can I safely spend this week?")}>
          What can I safely spend? →
        </button>
      </section>

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
