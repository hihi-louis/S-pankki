import type { ChatResponse } from "@sbank/shared";
import { newStats, runAgent, type ChatEvent } from "./agent.js";
import { addTokens, checkBudget } from "./budget.js";
import type { ChatRequestBody } from "./chat.schema.js";
import { tryFast } from "./fast.js";
import { recordUsage } from "./usage.js";

const MAX_CACHE = 300;
const cache = new Map<string, ChatResponse>();

/** Chuẩn hóa để "How much did I spend?" và "how much did i spend" dùng chung một bản cache. */
const normalize = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}€% ]+/gu, " ").replace(/\s+/g, " ").trim();

export const chatService = {
  /**
   * Thứ tự xử lý, rẻ nhất trước: (1) đường nhanh cho câu hỏi quen thuộc (0 token), (2) cache theo khách và câu hỏi,
   * (3) LLM, có giới hạn tốc độ và ngân sách token.
   */
  async chat(req: ChatRequestBody, emit?: (e: ChatEvent) => void, signal?: AbortSignal): Promise<ChatResponse> {
    const started = performance.now();

    const fast = await tryFast(req).catch(() => null);
    if (fast) {
      emit?.({ type: "status", text: "Looking at your data…" });
      emit?.({ type: "delta", text: fast.answer });
      void recordUsage({ customerId: req.customerId, path: "fast", latencyMs: performance.now() - started, verified: true });
      return fast;
    }

    const key = req.history?.length ? null : `${req.customerId}::${normalize(req.message)}`;
    const hit = key ? cache.get(key) : undefined;
    if (hit) {
      void recordUsage({ customerId: req.customerId, path: "cache", latencyMs: performance.now() - started, verified: hit.verified ?? null });
      return hit;
    }

    checkBudget(req.customerId);
    const stats = newStats();
    try {
      const res = await runAgent(req, emit, signal, stats);
      // Chỉ cache câu trả lời đã được kiểm chứng
      if (key && res.verified !== false) {
        if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value!);
        cache.set(key, res);
      }
      addTokens(stats.promptTokens + stats.completionTokens);
      void recordUsage({ customerId: req.customerId, path: "llm", stats, latencyMs: performance.now() - started, verified: stats.verified });
      return res;
    } catch (e) {
      addTokens(stats.promptTokens + stats.completionTokens);
      void recordUsage({
        customerId: req.customerId,
        path: "error",
        stats,
        latencyMs: performance.now() - started,
        error: e instanceof Error ? e.message : String(e),
      });
      throw e;
    }
  },
};
