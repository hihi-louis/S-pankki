import type { ChatResponse } from "@sbank/shared";
import { newStats, runAgent, type ChatEvent } from "./agent.js";
import type { ChatRequestBody } from "./chat.schema.js";
import { recordUsage } from "./usage.js";

const MAX_CACHE = 200;
const cache = new Map<string, ChatResponse>();

export const chatService = {
  /** Cache theo customerId + câu hỏi (chỉ khi không có lịch sử hội thoại), để câu demo trả ngay. */
  async chat(req: ChatRequestBody, emit?: (e: ChatEvent) => void, signal?: AbortSignal): Promise<ChatResponse> {
    const started = performance.now();
    const key = req.history?.length ? null : `${req.customerId}::${req.message.toLowerCase()}`;
    const hit = key ? cache.get(key) : undefined;
    if (hit) {
      void recordUsage({ customerId: req.customerId, path: "cache", latencyMs: performance.now() - started });
      return hit;
    }

    const stats = newStats();
    try {
      const res = await runAgent(req, emit, signal, stats);
      if (key) {
        if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value!);
        cache.set(key, res);
      }
      void recordUsage({ customerId: req.customerId, path: "llm", stats, latencyMs: performance.now() - started, verified: stats.verified });
      return res;
    } catch (e) {
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
