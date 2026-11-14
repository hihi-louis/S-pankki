import assert from "node:assert/strict";
import { after, test } from "node:test";
import { db } from "../../db/kysely.js";
import { coachService } from "../coach/coach.service.js";
import { tryFast } from "./fast.js";

after(() => db.destroy());

const ask = (message: string, customerId = "CUST04488") => tryFast({ customerId, message });

test("a known question is answered without the LLM and the number matches the service", async () => {
  const res = await ask("What can I safely spend this week?");
  const truth = await coachService.safeToSpend("CUST04488");
  assert.ok(res);
  assert.equal(res.verified, true);
  assert.ok(res.answer.includes(truth.safeToSpend.toLocaleString("en-IE", { minimumFractionDigits: 2 })), res.answer);
  const card = res.cards.find((c) => c.type === "safe_to_spend") as any;
  assert.equal(card.total, truth.safeToSpend);
  assert.ok(res.provenance?.length);
});

test("wording variants and punctuation still match", async () => {
  assert.ok(await ask("  what can I safely spend until payday?? "));
  assert.ok(await ask("How steady is my income"));
  assert.ok(await ask("What are my regular monthly payments?"));
});

test("investment advice requests get a fixed refusal without the LLM", async () => {
  for (const q of ["Should I buy bitcoin?", "is it a good idea to invest in stocks", "What ETF do you recommend?"]) {
    const res = await ask(q);
    assert.ok(res, q);
    assert.match(res.answer, /cannot advise/i);
    assert.equal(res.cards.length, 0);
  }
  // câu hỏi về chính khoản đầu tư của mình không bị từ chối nhầm
  assert.equal(await ask("How much did I put into stocks last month?"), null);
});

test("free-form questions fall through to the LLM", async () => {
  assert.equal(await ask("Why did my spending jump so much in September?"), null);
  assert.equal(await ask("Where did my money go in August?"), null); // tháng khác tháng hiện tại: để LLM
});

test("a category with no transactions this month falls through instead of showing an empty answer", async () => {
  assert.equal(await ask("What did I spend on unicorns this month?"), null);
});
