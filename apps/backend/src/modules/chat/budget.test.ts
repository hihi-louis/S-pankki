import assert from "node:assert/strict";
import { test } from "node:test";
import { addTokens, checkBudget, setDailyTokenCap } from "./budget.js";

test("rate limit: a customer cannot send more than 12 LLM questions a minute, others are unaffected", () => {
  for (let i = 0; i < 12; i++) checkBudget("CUST00001");
  assert.throws(() => checkBudget("CUST00001"), (e: any) => e.status === 429);
  assert.doesNotThrow(() => checkBudget("CUST00002"));
});

test("daily token cap stops LLM questions once it is used up", () => {
  setDailyTokenCap(1000);
  assert.doesNotThrow(() => checkBudget("CUST00003"));
  addTokens(1200);
  assert.throws(() => checkBudget("CUST00003"), (e: any) => e.status === 503 && /budget/i.test(e.message));
  setDailyTokenCap(0);
  assert.doesNotThrow(() => checkBudget("CUST00004")); // 0 = không giới hạn
});
