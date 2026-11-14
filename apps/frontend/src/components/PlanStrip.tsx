import type { PlansOverview } from "@sbank/shared";
import { eur0 } from "../lib/format";

const STATUS = { on_track: "On track", watch: "Close to the limit", over: "Over the limit", none: "" } as const;

/** Your plans at a glance (goals and the weekly limit). Tap it to open My plans, where they can be changed or deleted. */
export function PlanStrip({ overview, onOpen }: { overview: PlansOverview; onOpen: () => void }) {
  const { goals, weeklyLimit } = overview;
  const shown = goals.slice(0, 2);
  return (
    <button className={`plan-strip ${overview.status}`} onClick={onOpen} aria-label="Your plans. Tap to see and change them.">
      <span className="plan-head">
        <span className="plan-title">Goals and weekly limit</span>
        {weeklyLimit && <span className={`plan-chip ${overview.status}`}>{STATUS[overview.status]}</span>}
      </span>
      {shown.map((g) => (
        <span key={g.id} className="plan-row">
          <span className="plan-row-label">{g.name}</span>
          <span className="plan-row-amt">{eur0(g.monthlyAmount)} a month</span>
        </span>
      ))}
      {goals.length > shown.length && <span className="plan-more">+ {goals.length - shown.length} more goal{goals.length - shown.length === 1 ? "" : "s"}</span>}
      {weeklyLimit && (
        <>
          <span className="plan-row">
            <span className="plan-row-label">Everyday spending this week</span>
            <span className="plan-row-amt">{eur0(weeklyLimit.spent)} of {eur0(weeklyLimit.amount)}</span>
          </span>
          <span className="plan-bar" role="img" aria-label={`${weeklyLimit.pct}% of this week's limit`}>
            <span className={`plan-fill c2${weeklyLimit.pct > 100 ? " over" : ""}`} style={{ width: `${Math.min(100, weeklyLimit.pct)}%` }} />
          </span>
        </>
      )}
      <span className="plan-msg">{overview.message} <b>Tap to change.</b></span>
    </button>
  );
}
