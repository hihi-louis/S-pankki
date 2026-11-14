import { sql } from "kysely";
import { db } from "../../db/kysely.js";
import { config } from "../../config.js";
import type { RunStats } from "./agent.js";

export type UsagePath = "llm" | "cache" | "fast" | "error";

/** Ghi một dòng đo đạc; lỗi ghi log không bao giờ được làm hỏng câu trả lời. */
export async function recordUsage(row: {
  customerId: string;
  path: UsagePath;
  stats?: RunStats;
  latencyMs: number;
  verified?: boolean | null;
  error?: string;
}) {
  try {
    const s = row.stats;
    await db
      .insertInto("llm_usage")
      .values({
        customer_id: row.customerId,
        path: row.path,
        model: row.path === "llm" || row.path === "error" ? config.llmModel : null,
        prompt_tokens: s?.promptTokens ?? 0,
        completion_tokens: s?.completionTokens ?? 0,
        cached_tokens: s?.cachedTokens ?? 0,
        turns: s?.turns ?? 0,
        tools: s?.tools ?? [],
        latency_ms: Math.round(row.latencyMs),
        verified: row.verified ?? null,
        error: row.error?.slice(0, 300) ?? null,
      })
      .execute();
  } catch (e) {
    console.error("[usage] could not record:", e instanceof Error ? e.message : e);
  }
}

/** Tổng hợp để xem chi phí và độ trễ (lọc theo mốc thời gian nếu có). */
export async function usageSummary(since?: string) {
  const where = since ? sql`WHERE created_at >= ${since}::timestamptz` : sql``;
  const byPath = await sql<{ path: string; n: number; avgPrompt: number; avgCompletion: number; avgCached: number; p50: number; p95: number }>`
    SELECT path, COUNT(*)::int AS n,
           ROUND(AVG(prompt_tokens))::int AS "avgPrompt", ROUND(AVG(completion_tokens))::int AS "avgCompletion",
           ROUND(AVG(cached_tokens))::int AS "avgCached",
           percentile_disc(0.5) WITHIN GROUP (ORDER BY latency_ms)::int AS p50,
           percentile_disc(0.95) WITHIN GROUP (ORDER BY latency_ms)::int AS p95
    FROM llm_usage ${where} GROUP BY path ORDER BY path`.execute(db);
  const totals = await sql<{ n: number; promptTokens: number; completionTokens: number; verifiedPct: number | null }>`
    SELECT COUNT(*)::int AS n, COALESCE(SUM(prompt_tokens),0)::int AS "promptTokens",
           COALESCE(SUM(completion_tokens),0)::int AS "completionTokens",
           ROUND(100.0 * COUNT(*) FILTER (WHERE verified) / NULLIF(COUNT(*) FILTER (WHERE verified IS NOT NULL), 0))::int AS "verifiedPct"
    FROM llm_usage ${where}`.execute(db);
  const recent = await sql`
    SELECT created_at, customer_id, path, prompt_tokens, completion_tokens, cached_tokens, turns, tools, latency_ms, verified
    FROM llm_usage ${where} ORDER BY id DESC LIMIT 15`.execute(db);
  return { since: since ?? null, totals: totals.rows[0], byPath: byPath.rows, recent: recent.rows };
}
