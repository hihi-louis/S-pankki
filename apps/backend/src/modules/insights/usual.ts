import { lastNMonths, monthStart } from "../../lib/dates.js";
import { benchmarkRepository } from "../benchmark/benchmark.repository.js";

/** "Usual" for a category = the median of the last 3 full months (one odd month does not move it). */
export const USUAL_MONTHS = 3;

/** A change worth showing: more than 25% and more than €30, so we never say "you spent €3 more". */
export const MIN_CHANGE_EUR = 30;
export const MIN_CHANGE_PCT = 0.25;

export const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length === 0 ? 0 : s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

export const isStandout = (diff: number, usual: number) => Math.abs(diff) >= MIN_CHANGE_EUR && Math.abs(diff) >= MIN_CHANGE_PCT * usual;

export interface CategoryHistory {
  /** Spent per category this month. */
  now: Map<string, number>;
  /** Median of the last 3 full months, per category. */
  usual: Map<string, number>;
  /** How many of the last 3 full months have any spending. */
  monthsWithData: number;
}

export async function categoryHistory(customerId: string): Promise<CategoryHistory> {
  const months = lastNMonths(USUAL_MONTHS); // the three full months before this one
  const [now, ...past] = await Promise.all([
    benchmarkRepository.spentByCategory(customerId, monthStart(0), monthStart(1)),
    ...months.map((m, i) => benchmarkRepository.spentByCategory(customerId, m, i + 1 < months.length ? months[i + 1] : monthStart(0))),
  ]);
  const cats = new Set([...now.keys(), ...past.flatMap((p) => [...p.keys()])]);
  const usual = new Map([...cats].map((c) => [c, median(past.map((p) => p.get(c) ?? 0))]));
  return { now, usual, monthsWithData: past.filter((p) => p.size > 0).length };
}
