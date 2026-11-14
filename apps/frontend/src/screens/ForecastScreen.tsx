import { useEffect, useState } from "react";
import type { ForecastResponse } from "@sbank/shared";
import { getForecast } from "../api";
import { ForecastChart } from "../components/ForecastChart";
import { eur0, shortDate } from "../lib/format";
import type { Nav } from "../lib/nav";

export function ForecastScreen({ customerId, nav }: { customerId: string; nav: Nav }) {
  const [data, setData] = useState<ForecastResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getForecast(customerId).then(setData).catch((e: Error) => setError(e.message));
  }, [customerId]);

  // Only draw the plan line when it really differs from the usual pace (otherwise it hides the usual line)
  const planShown = data !== null && data.endPlan !== null && Math.abs(data.endPlan - data.endUsual) >= 25;

  return (
    <main className="home detail screen-enter">
      <button className="back" onClick={nav.back}>← Overview</button>
      <h2 className="detail-title">Safe spending forecast</h2>
      {error && <p className="empty">Couldn't load: {error}</p>}
      {!data && !error && <div className="skeleton" />}
      {data && (
        <>
          <div className={`card ${data.runsOutOn || data.shortfall > 0 ? "fc-alert" : "card-accent"}`}>
            {data.runsOutOn ? (
              <>
                <div className="card-label">At your usual pace</div>
                <div className="card-big">Runs out {shortDate(data.runsOutOn)}</div>
                <div className="card-sub">Your balance would go below zero before payday on {shortDate(data.nextPayday.date)}.</div>
              </>
            ) : (
              <>
                <div className="card-label">At your usual pace you reach payday with</div>
                <div className="card-big">{eur0(data.endUsual)}</div>
                <div className="card-sub">
                  Payday {shortDate(data.nextPayday.date)}, {data.daysLeft} days away
                  {data.nextPayday.estimated && " (estimate: your pay days vary)"}.
                </div>
              </>
            )}
          </div>

          <div className="card">
            <ForecastChart points={planShown ? data.points : data.points.map((p) => ({ ...p, plan: null }))} />
            <ul className="fc-legend">
              <li><span className="swatch fc-usual" />Usual pace, about {eur0(data.usualPerDay)} a day: ends at {eur0(data.endUsual)}</li>
              {data.shortfall > 0 ? (
                <li><span className="swatch fc-safe" />No safe pace: you may be {eur0(data.shortfall)} short even with no extras</li>
              ) : (
                <li><span className="swatch fc-safe" />Safe pace, {eur0(data.safePerDay)} a day: ends near €0</li>
              )}
              {planShown && data.planPerDay !== null && data.endPlan !== null && (
                <li><span className="swatch fc-plan" />Your weekly limit, about {eur0(data.planPerDay)} a day: ends at {eur0(data.endPlan)}</li>
              )}
              {!planShown && data.planPerDay !== null && <li className="fc-same">Your weekly limit is about the same as your usual pace.</li>}
            </ul>
          </div>

          {data.bills.length > 0 && (
            <div className="card">
              <div className="card-label">Regular bills before payday</div>
              <dl className="facts">
                {data.bills.map((b) => (
                  <div key={`${b.date}-${b.label}`} className="facts-row">
                    <dt>{b.label} · {shortDate(b.date)}</dt>
                    <dd>{eur0(b.amount)}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}

          <p className="card-sub">{data.note}</p>
          <button className="cta" onClick={() => nav.ask("Make me a spending plan")}>Make a plan with Sipi →</button>
          <button className="chip" onClick={() => nav.ask("What can I safely spend this week?")}>Ask Sipi about this</button>
        </>
      )}
    </main>
  );
}
