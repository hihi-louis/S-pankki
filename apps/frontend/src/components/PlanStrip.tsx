import type { PlanProgressResponse } from "@sbank/shared";
import { eur0 } from "../lib/format";

const STATUS = { on_track: "On track", watch: "Close to the limit", over: "Over the limit" } as const;

/** The saved plan at a glance: the monthly saving and how each basket is doing against its cap. Shown only when a plan is saved. */
export function PlanStrip({ progress, onOpen }: { progress: PlanProgressResponse; onOpen: () => void }) {
  const plan = progress.plan;
  if (!plan) return null;
  const goal = plan.goalAmount ? `${plan.goalLabel} (${eur0(plan.goalAmount)})` : plan.goalLabel;
  return (
    <button className={`plan-strip ${progress.status}`} onClick={onOpen} aria-label="Your plan. Tap to ask how you are doing.">
      <span className="plan-head">
        <span className="plan-title">Your plan</span>
        <span className={`plan-chip ${progress.status}`}>{STATUS[progress.status]}</span>
      </span>
      <span className="plan-goal">Save {eur0(plan.monthlySaving)} a month · {goal}</span>
      {progress.baskets.map((b) => (
        <span key={b.id} className="plan-row">
          <span className="plan-row-label">{b.name}</span>
          <span className="plan-row-amt">{eur0(b.spent)} of {eur0(b.cap)}</span>
          <span className="plan-bar" role="img" aria-label={`${b.name}: ${b.pct}% of the limit`}>
            <span className={`plan-fill c${b.id - 1}${b.pct > 100 ? " over" : ""}`} style={{ width: `${Math.min(100, b.pct)}%` }} />
          </span>
        </span>
      ))}
      <span className="plan-msg">{progress.message}</span>
    </button>
  );
}
