import { HttpError } from "../../lib/errors.js";
import { config } from "../../config.js";

/**
 * Giới hạn chi phí LLM (quan trọng khi app đứng sau tunnel công khai): số câu hỏi LLM mỗi phút theo khách và toàn hệ thống,
 * và ngân sách token mỗi ngày. Đường nhanh và cache không bị giới hạn vì không tốn token: hết ngân sách thì các câu phổ biến vẫn trả lời được.
 */
const PER_CUSTOMER_PER_MIN = 12;
const GLOBAL_PER_MIN = 60;
const windows = new Map<string, number[]>();
let day = new Date().toISOString().slice(0, 10);
let tokensToday = 0;
let dailyCap = config.llmDailyTokenCap;

/** Đặt lại giới hạn token mỗi ngày (dùng khi kiểm thử). */
export function setDailyTokenCap(n: number) {
  dailyCap = n;
}

function hit(key: string, limit: number, now: number) {
  const recent = (windows.get(key) ?? []).filter((t) => now - t < 60_000);
  if (recent.length >= limit) {
    windows.set(key, recent);
    return false;
  }
  recent.push(now);
  windows.set(key, recent);
  return true;
}

export function checkBudget(customerId: string) {
  const now = Date.now();
  const today = new Date().toISOString().slice(0, 10);
  if (today !== day) {
    day = today;
    tokensToday = 0;
  }
  if (dailyCap > 0 && tokensToday >= dailyCap)
    throw new HttpError(503, "The daily AI budget is used up. Quick questions from the suggestions still work; free-form questions will be back tomorrow.");
  if (!hit(`c:${customerId}`, PER_CUSTOMER_PER_MIN, now) || !hit("global", GLOBAL_PER_MIN, now))
    throw new HttpError(429, "You are asking quickly. Please wait a few seconds and try again.");
}

export function addTokens(n: number) {
  tokensToday += n;
}
export const tokensUsedToday = () => tokensToday;
