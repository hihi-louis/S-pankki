import type { ForecastPoint } from "@sbank/shared";
import { eur0, shortDate } from "../lib/format";

const W = 340;
const H = 190;
const PAD = { l: 8, r: 8, t: 30, b: 24 };

/** Estimated balance until payday: usual pace, saved plan and safe pace. Plain SVG, no chart library. */
export function ForecastChart({ points }: { points: ForecastPoint[] }) {
  const values = points.flatMap((p) => [p.usual, p.safe, ...(p.plan !== null ? [p.plan] : [])]).concat(0);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const x = (i: number) => PAD.l + (i / Math.max(1, points.length - 1)) * (W - PAD.l - PAD.r);
  const y = (v: number) => PAD.t + (1 - (v - min) / (max - min || 1)) * (H - PAD.t - PAD.b);
  const line = (get: (p: ForecastPoint) => number | null) =>
    points.map((p, i) => ({ v: get(p), i })).filter((s): s is { v: number; i: number } => s.v !== null)
      .map((s, k) => `${k ? "L" : "M"}${x(s.i).toFixed(1)},${y(s.v).toFixed(1)}`).join(" ");
  const first = points[0];
  const last = points[points.length - 1];
  const hasPlan = points.some((p) => p.plan !== null);

  return (
    <svg className="fc" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Estimated balance until payday">
      <line className="fc-zero" x1={PAD.l} x2={W - PAD.r} y1={y(0)} y2={y(0)} />
      <text className="fc-axis" x={PAD.l} y={y(0) - 4}>0 €</text>
      <path className="fc-line fc-usual" d={line((p) => p.usual)} />
      <path className="fc-line fc-safe" d={line((p) => p.safe)} />
      {hasPlan && <path className="fc-line fc-plan" d={line((p) => p.plan)} />}
      <text className="fc-axis" x={PAD.l} y={H - 6}>{shortDate(first.date)}</text>
      <text className="fc-axis" x={W - PAD.r} y={H - 6} textAnchor="end">{shortDate(last.date)} payday</text>
      <text className="fc-axis" x={PAD.l} y={y(first.usual) - 8}>{eur0(first.usual)}</text>
    </svg>
  );
}
