import type { SummaryResponse } from "@sbank/shared";
import { eur0 } from "../lib/format";

type Basket = SummaryResponse["baskets"][number];
const R = 52;
const C = 2 * Math.PI * R;

/** Donut of this month's spending split into the three baskets, with a legend. */
export function BasketPie({ baskets }: { baskets: Basket[] }) {
  const rows = baskets.filter((b) => b.id <= 3);
  const total = rows.reduce((s, b) => s + b.spent, 0);
  const starts = rows.map((_, i) => rows.slice(0, i).reduce((a, b) => a + b.spent, 0));
  return (
    <div className="pie">
      <svg viewBox="0 0 140 140" className="pie-svg" role="img" aria-label={`Spending split into three groups, ${eur0(total)} in total`}>
        <circle cx="70" cy="70" r={R} fill="none" stroke="var(--line)" strokeWidth="20" />
        {total > 0 &&
          rows.map((b, i) => {
            const offset = (starts[i] / total) * C;
            const len = (b.spent / total) * C;
            return (
              <circle key={b.id} className={`pie-seg c${b.id - 1}`} cx="70" cy="70" r={R} fill="none" strokeWidth="20"
                stroke="var(--c)" strokeDasharray={`${Math.max(len - 1.5, 0)} ${C}`} strokeDashoffset={-offset}
                transform="rotate(-90 70 70)" style={{ animationDelay: `${offset / C * 500}ms` }} />
            );
          })}
        <text x="70" y="66" textAnchor="middle" className="pie-total">{eur0(total)}</text>
        <text x="70" y="84" textAnchor="middle" className="pie-label">spent</text>
      </svg>
      <ul className="pie-legend">
        {rows.map((b) => (
          <li key={b.id}>
            <span className={`dot c${b.id - 1}`} aria-hidden="true" />
            <span className="pie-name">{b.name}</span>
            <span className="pie-amt">{eur0(b.spent)}<small>{total > 0 ? ` ${Math.round((b.spent / total) * 100)}%` : ""}</small></span>
          </li>
        ))}
      </ul>
    </div>
  );
}
