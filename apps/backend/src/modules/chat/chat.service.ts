import type { ChatResponse } from "@sbank/shared";
import { runAgent, type ChatEvent } from "./agent.js";
import type { ChatRequestBody } from "./chat.schema.js";

const MAX_CACHE = 200;
const cache = new Map<string, ChatResponse>();

export const chatService = {
  /** Cache theo customerId + câu hỏi (chỉ khi không có lịch sử hội thoại), để câu demo trả ngay. */
  async chat(req: ChatRequestBody, emit?: (e: ChatEvent) => void, signal?: AbortSignal): Promise<ChatResponse> {
    const key = req.history?.length ? null : `${req.customerId}::${req.message.toLowerCase()}`;
    const hit = key ? cache.get(key) : undefined;
    if (hit) return hit;

    const res = await runAgent(req, emit, signal);
    if (key) {
      if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value!);
      cache.set(key, res);
    }
    return res;
  },
};
