import { useState } from "react";
import { savePlan } from "../api";
import type { AmountCard, BenchmarkCard, Card, Chart, FactsCard, SafeToSaveCard, SafeToSpendCard, WhatIfCard } from "@sbank/shared";
import { eur, eur0, shortDate } from "../lib/format";

/** Picks the right widget for each card the backend sends. */
export function CardRenderer({ card, customerId, onAsk }: { card: Card; customerId: string; onAsk?: (text: string) => void }) {
  switch (card.type) {
    case "amount":
      return <Amount card={card} />;
    case "safe_to_spend":
      return <SafeToSpend card={card} />;
    case "safe_to_save":
      return <SafeToSave card={card} />;
    case "facts":
      return <Facts card={card} customerId={customerId} onAsk={onAsk} />;
    case "what_if":
      return <WhatIf card={card} />;
    case "benchmark":
      return <Benchmark card={card} />;
    default:
      return null;
  }
}

function Amount({ card }: { card: AmountCard }) {
  return (
    <div className="card">
      <div className="card-label">{card.label}</div>
      <div className="card-big">{eur(card.value)}</div>
    </div>
  );
}

function SafeToSpend({ card }: { card: SafeToSpendCard }) {
  return (
    <div className="card card-accent">
      <div className="card-label">Safe to spend</div>
      <div className="card-big">
        {eur(card.perDay)}
        <span className="card-unit"> / day</span>
      </div>
      <div className="card-sub">
        {eur(card.total)} until payday on {shortDate(card.until)}
      </div>
    </div>
  );
}

function SafeToSave({ card }: { card: SafeToSaveCard }) {
  return (
    <div className="card card-accent">
      <div className="card-label">Safe to save now</div>
      <div className="card-big">{eur(card.amount)}</div>
      <div className="card-sub">
        Not needed before payday on {shortDate(card.until)}
        {card.monthsCovered !== null && ` · your balance covers ${card.monthsCovered} months of essentials`}
      </div>
    </div>
  );
}

function Facts({ card, customerId, onAsk }: { card: FactsCard; customerId: string; onAsk?: (text: string) => void }) {
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [saved, setSaved] = useState("");
  async function save() {
    if (card.action?.kind !== "save_plan") return;
    setState("saving");
    try {
      const r = await savePlan(customerId, card.action.draft);
      setSaved(r.message);
      setState("saved");
    } catch {
      setState("error");
    }
  }
  return (
    <div className="card">
      <div className="card-label">{card.title}</div>
      {card.headline && (
        <>
          <div className={`card-big${/^[€\d+\-−]/.test(card.headline.value) ? "" : " wrap"}`}>{card.headline.value}</div>
          <div className="card-sub">{card.headline.label}</div>
        </>
      )}
      <dl className="facts">
        {card.rows.map((r) => (
          <div key={r.label} className={`facts-row${r.tone ? ` ${r.tone}` : ""}`}>
            <dt>{r.label}</dt>
            <dd>{r.value}</dd>
          </div>
        ))}
      </dl>
      {card.note && <div className="card-sub facts-note">{card.note}</div>}
      {card.action?.kind === "ask" && onAsk && (
        <button className="cta" onClick={() => onAsk(card.action?.kind === "ask" ? card.action.question : "")}>{card.action.label}</button>
      )}
      {card.action?.kind === "save_plan" && (
        <>
          <button className="cta" disabled={state === "saving" || state === "saved"} onClick={() => void save()}>
            {state === "saved" ? "Added to your plans" : state === "saving" ? "Saving…" : "Add to my plans"}
          </button>
          {state === "saved" && <div className="card-sub facts-note">{saved} You can change or delete it in My plans, on the Overview.</div>}
          {state === "error" && <div className="card-sub facts-error" role="alert">Could not add the plan. Try again.</div>}
        </>
      )}
    </div>
  );
}

function WhatIf({ card }: { card: WhatIfCard }) {
  const [pct, setPct] = useState(card.defaultCutPct);
  const monthly = (card.monthlySpend * pct) / 100;
  return (
    <div className="card">
      <div className="card-label">
        What if you cut {card.category.toLowerCase()} by <strong>{pct}%</strong>?
      </div>
      <input
        className="slider"
        type="range"
        min={0}
        max={100}
        step={5}
        value={pct}
        onChange={(e) => setPct(Number(e.target.value))}
        aria-label={`Cut ${card.category} by percent`}
      />
      <div className="whatif-row">
        <div>
          <div className="card-big">{eur0(monthly)}</div>
          <div className="card-sub">saved per month</div>
        </div>
        <div>
          <div className="card-big">{eur0(monthly * 12)}</div>
          <div className="card-sub">saved per year</div>
        </div>
      </div>
      <div className="card-sub">Now you spend about {eur0(card.monthlySpend)} a month.</div>
    </div>
  );
}

function Benchmark({ card }: { card: BenchmarkCard }) {
  const max = Math.max(card.you, card.peers) || 1;
  return (
    <div className="card">
      <div className="card-label">{card.label}</div>
      {[
        { name: "You", v: card.you, cls: "bar-you" },
        { name: card.peerGroup, v: card.peers, cls: "bar-peer" },
      ].map((r) => (
        <div key={r.name} className="bench-row">
          <span className="bench-name">{r.name}</span>
          <div className="bench-track">
            <div className={`bench-bar ${r.cls}`} style={{ width: `${(r.v / max) * 100}%` }} />
          </div>
          <span className="bench-val">{eur0(r.v)}</span>
        </div>
      ))}
      {card.source && <div className="card-sub">Source: {card.source}</div>}
    </div>
  );
}

/** Lightweight CSS chart — no chart library needed. */
export function MiniChart({ chart }: { chart: Chart }) {
  const max = Math.max(...chart.data.map((d) => d.value), 1);
  const total = chart.data.reduce((s, d) => s + d.value, 0) || 1;

  if (chart.type === "donut") {
    return (
      <div className="card">
        <div className="card-label">{chart.title}</div>
        <div className="stack">
          {chart.data.map((d, i) => (
            <div key={d.label} className={`stack-seg c${i % 4}`} style={{ width: `${(d.value / total) * 100}%` }} />
          ))}
        </div>
        <ul className="legend">
          {chart.data.map((d, i) => (
            <li key={d.label}>
              <span className={`dot c${i % 4}`} />
              {d.label}
              <span className="legend-val">{eur0(d.value)}</span>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="card-label">{chart.title}</div>
      <div className="bars">
        {chart.data.map((d) => (
          <div key={d.label} className="bar-col">
            <div className="bar" style={{ height: `${(d.value / max) * 100}%` }} title={eur(d.value)} />
            <span className="bar-label">{d.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
