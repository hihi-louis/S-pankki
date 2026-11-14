import { useEffect, useState } from "react";
import type { Goal, PlansOverview } from "@sbank/shared";
import { addGoal, deleteGoal, deleteWeeklyLimit, getPlans, setWeeklyLimit, updateGoal, type GoalInput } from "../api";
import { eur0 } from "../lib/format";
import type { Nav } from "../lib/nav";

const STEP_WEEK = 10;
const STEP_MONTH = 10;

/** Number field with minus and plus buttons: easy on a phone. */
function Stepper({ label, value, step, min = 0, onChange }: { label: string; value: number; step: number; min?: number; onChange: (n: number) => void }) {
  return (
    <div className="stepper">
      <span className="stepper-label">{label}</span>
      <button type="button" aria-label={`Less ${label}`} onClick={() => onChange(Math.max(min, value - step))}>−</button>
      <input
        inputMode="numeric"
        aria-label={label}
        value={value}
        onChange={(e) => {
          const n = Number(e.target.value.replace(/[^\d]/g, ""));
          onChange(Number.isFinite(n) ? n : value);
        }}
      />
      <button type="button" aria-label={`More ${label}`} onClick={() => onChange(value + step)}>+</button>
    </div>
  );
}

function GoalForm({ initial, onSave, onCancel, busy }: { initial?: Goal; onSave: (g: GoalInput) => void; onCancel: () => void; busy: boolean }) {
  const [name, setName] = useState(initial?.name ?? "");
  const [target, setTarget] = useState<string>(initial?.targetAmount ? String(initial.targetAmount) : "");
  const [monthly, setMonthly] = useState(initial?.monthlyAmount ?? 100);
  const t = Number(target.replace(/[^\d]/g, "")) || null;
  const ok = name.trim().length > 0 && monthly >= 0;
  return (
    <form
      className="goal-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (ok) onSave({ name: name.trim(), kind: initial?.kind ?? "savings", targetAmount: t, months: initial?.months ?? null, monthlyAmount: monthly });
      }}
    >
      <label>What are you saving for?<input value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder="e.g. Trip, new laptop, home" /></label>
      <label>How much in total? (optional)<input inputMode="numeric" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="e.g. 3000" /></label>
      <Stepper label="Set aside each month (€)" value={monthly} step={STEP_MONTH} onChange={setMonthly} />
      {t && monthly > 0 && <p className="card-sub">At this pace: about {Math.ceil(t / monthly)} months.</p>}
      <div className="form-actions">
        <button className="cta" type="submit" disabled={!ok || busy}>{busy ? "Saving…" : "Save"}</button>
        <button className="cta ghost" type="button" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}

/** My plans: every goal and the weekly limit, with edit and delete. The coach only suggests; changes happen here. */
export function PlansScreen({ customerId, nav }: { customerId: string; nav: Nav }) {
  const [ov, setOv] = useState<PlansOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<number | "new" | null>(null);
  const [confirm, setConfirm] = useState<number | null>(null);
  const [undo, setUndo] = useState<Goal | null>(null);
  const [limit, setLimit] = useState<number | null>(null);

  useEffect(() => {
    getPlans(customerId).then((o) => { setOv(o); setLimit(o.weeklyLimit?.amount ?? null); }).catch((e: Error) => setError(e.message));
  }, [customerId]);

  async function run(fn: () => Promise<PlansOverview>) {
    setBusy(true);
    setError(null);
    try {
      const o = await fn();
      setOv(o);
      setLimit(o.weeklyLimit?.amount ?? null);
      return true;
    } catch (e) {
      setError((e as Error).message || "Something went wrong. Try again.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="home detail screen-enter">
      <button className="back" onClick={nav.back}>← Overview</button>
      <h2 className="detail-title">My plans</h2>
      <p className="card-sub">The coach only suggests. You decide what to keep. I read your transactions to see how you are doing, and I never move money.</p>
      {error && <p className="empty" role="alert">{error}</p>}
      {!ov && !error && <div className="skeleton" />}
      {ov && (
        <>
          <section className="card">
            <div className="card-label">Weekly limit for everyday spending</div>
            {limit === null ? (
              <>
                <p className="card-sub">Everyday spending means restaurants, fun, shopping and taxis. A limit helps you see how much is left this week. About {eur0(ov.suggestedWeeklyLimit)} a week matches what you usually spend.</p>
                <button className="cta" disabled={busy} onClick={() => void run(async () => { await setWeeklyLimit(customerId, ov.suggestedWeeklyLimit); return getPlans(customerId); })}>
                  Set it to {eur0(ov.suggestedWeeklyLimit)} a week
                </button>
              </>
            ) : (
              <>
                <Stepper label="€ a week" value={limit} step={STEP_WEEK} min={10} onChange={setLimit} />
                {ov.weeklyLimit && (
                  <>
                    <div className="plan-bar tall" role="img" aria-label={`${ov.weeklyLimit.pct}% of this week's limit`}>
                      <span className={`plan-fill c2${ov.weeklyLimit.pct > 100 ? " over" : ""}`} style={{ width: `${Math.min(100, ov.weeklyLimit.pct)}%` }} />
                    </div>
                    <p className="card-sub">Last 7 days: {eur0(ov.weeklyLimit.spent)} spent{ov.weeklyLimit.pct > 100 ? "" : `, ${eur0(ov.weeklyLimit.remaining)} left`}.</p>
                  </>
                )}
                <div className="form-actions">
                  <button className="cta" disabled={busy || limit === ov.weeklyLimit?.amount} onClick={() => void run(async () => { await setWeeklyLimit(customerId, limit); return getPlans(customerId); })}>Save limit</button>
                  <button className="cta ghost" disabled={busy} onClick={() => void run(() => deleteWeeklyLimit(customerId))}>Remove limit</button>
                </div>
              </>
            )}
          </section>

          <section className="block">
            <div className="eyebrow">Goals</div>
            {ov.goals.length === 0 && editing !== "new" && <p className="card-sub">No goals yet. Add one, or ask the coach to make a plan for you.</p>}
            {ov.goals.map((g) => (
              <div key={g.id} className="card goal-card">
                {editing === g.id ? (
                  <GoalForm initial={g} busy={busy} onCancel={() => setEditing(null)} onSave={(fields) => void run(() => updateGoal(customerId, g.id, fields)).then((ok) => ok && setEditing(null))} />
                ) : (
                  <>
                    <div className="goal-head">
                      <strong>{g.name}</strong>
                      <span className="goal-amt">{eur0(g.monthlyAmount)} a month</span>
                    </div>
                    <p className="card-sub">
                      {g.targetAmount ? `Toward ${eur0(g.targetAmount)}${g.monthsAtThisPace ? `, about ${g.monthsAtThisPace} months at this pace` : ""}.` : "No total set."}
                    </p>
                    {confirm === g.id ? (
                      <div className="form-actions">
                        <button className="cta danger" disabled={busy} onClick={() => void run(() => deleteGoal(customerId, g.id)).then((ok) => { if (ok) { setUndo(g); setConfirm(null); } })}>Yes, delete</button>
                        <button className="cta ghost" onClick={() => setConfirm(null)}>Keep it</button>
                      </div>
                    ) : (
                      <div className="form-actions">
                        <button className="cta ghost" onClick={() => { setEditing(g.id); setConfirm(null); }}>Edit</button>
                        <button className="cta ghost" onClick={() => setConfirm(g.id)}>Delete</button>
                      </div>
                    )}
                  </>
                )}
              </div>
            ))}
            {undo && (
              <div className="undo" role="status">
                Deleted "{undo.name}".{" "}
                <button className="link-btn" onClick={() => void run(() => addGoal(customerId, { name: undo.name, kind: undo.kind, targetAmount: undo.targetAmount, months: undo.months, monthlyAmount: undo.monthlyAmount })).then((ok) => ok && setUndo(null))}>Undo</button>
              </div>
            )}
            {editing === "new" ? (
              <div className="card goal-card">
                <GoalForm busy={busy} onCancel={() => setEditing(null)} onSave={(g) => void run(() => addGoal(customerId, g)).then((ok) => ok && setEditing(null))} />
              </div>
            ) : (
              <button className="cta" onClick={() => { setEditing("new"); setUndo(null); }}>Add a goal</button>
            )}
          </section>

          <button className="cta ghost" onClick={() => nav.ask("Make me a spending plan")}>Ask the coach for a plan</button>
        </>
      )}
    </main>
  );
}
