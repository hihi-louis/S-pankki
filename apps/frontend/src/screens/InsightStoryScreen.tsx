import { useEffect, useState } from "react";
import type { InsightStory, StoryAction, StoryStep } from "@sbank/shared";
import { applyPlanCap, getInsightStory } from "../api";
import { MiniChart } from "../components/Cards";
import { eur0 } from "../lib/format";
import type { Nav } from "../lib/nav";

function Step({ n, step }: { n: number; step: StoryStep }) {
  return (
    <section className="step">
      <div className="step-n" aria-hidden="true">{n}</div>
      <div className="step-body">
        <h3>{step.title}</h3>
        <p>{step.text}</p>
        {step.chart && <MiniChart chart={step.chart} />}
        {step.rows && step.rows.length > 0 && (
          <dl className="facts">
            {step.rows.map((r) => (
              <div key={r.label} className={`facts-row${r.tone ? ` ${r.tone}` : ""}`}>
                <dt>{r.label}</dt>
                <dd>{r.value}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </section>
  );
}

function Action({ action, customerId, nav }: { action: StoryAction; customerId: string; nav: Nav }) {
  const [state, setState] = useState<"idle" | "saving" | "done" | "error">("idle");
  const [result, setResult] = useState("");

  async function apply() {
    if (!action.apply) return;
    setState("saving");
    try {
      const r = await applyPlanCap(customerId, action.apply.basket, action.apply.reduceBy);
      const cap = action.apply.basket === 1 ? r.plan.capEssentials : action.apply.basket === 2 ? r.plan.capUnexpected : r.plan.capEveryday;
      setResult(`${r.createdNewPlan ? "Plan created. " : ""}${r.basketName} limit is now ${eur0(cap)} a month; saving ${eur0(r.plan.monthlySaving)} a month.`);
      setState("done");
    } catch {
      setState("error");
    }
  }

  return (
    <div className="card action">
      <div className="action-head">
        <strong>{action.label}</strong>
        {action.savingPerMonth !== undefined && action.apply && <span className="badge-good">saves {eur0(action.savingPerMonth)} / month</span>}
      </div>
      <p className="card-sub">{action.detail}</p>
      {action.apply && (
        <button className="cta" disabled={state === "saving" || state === "done"} onClick={() => void apply()}>
          {state === "done" ? "Added to your plan" : state === "saving" ? "Saving…" : "Apply to my plan"}
        </button>
      )}
      {action.link === "forecast" && <button className="cta" onClick={() => nav.open({ name: "forecast" })}>See the forecast</button>}
      {action.link === "plan" && <button className="cta" onClick={() => nav.ask("Make me a spending plan")}>Make a plan with the coach</button>}
      {state === "done" && <div className="card-sub facts-note">{result} See it on the Overview.</div>}
      {state === "error" && <div className="card-sub facts-error" role="alert">Could not update the plan. Try again.</div>}
    </div>
  );
}

/** What happened, why, what it means, what to do: one insight as a four-step story. */
export function InsightStoryScreen({ customerId, id, nav }: { customerId: string; id: string; nav: Nav }) {
  const [story, setStory] = useState<InsightStory | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getInsightStory(customerId, id).then(setStory).catch((e: Error) => setError(e.message));
  }, [customerId, id]);

  return (
    <main className="home detail">
      <button className="back" onClick={nav.back}>← Overview</button>
      {error && <p className="empty">Couldn't load: {error}</p>}
      {!story && !error && <div className="skeleton" />}
      {story && (
        <>
          <h2 className={`detail-title tone-${story.tone}`}>{story.title}</h2>
          <Step n={1} step={story.happened} />
          <Step n={2} step={story.why} />
          <Step n={3} step={story.means} />
          <section className="step">
            <div className="step-n" aria-hidden="true">4</div>
            <div className="step-body">
              <h3>What to do next</h3>
              <p>{story.next.text}</p>
              {story.next.actions.map((a) => (
                <Action key={a.id} action={a} customerId={customerId} nav={nav} />
              ))}
            </div>
          </section>
          <button className="chip" onClick={() => nav.ask(story.askAI)}>Ask the coach about this</button>
        </>
      )}
    </main>
  );
}
