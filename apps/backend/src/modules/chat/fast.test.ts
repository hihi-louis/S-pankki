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

const askFast = (message: string) => tryFast({ customerId: "CUST05020", message } as never);

test("a lost card goes to the card blocking line without the model", async () => {
  const r = await askFast("I lost my card");
  assert.match(r?.answer ?? "", /020 333/);
  assert.equal(r?.cards[0]?.type, "facts");
});

test("a request for a person gets the customer service number", async () => {
  const r = await askFast("Can I talk to a real person?");
  assert.match(r?.answer ?? "", /010 76 5800/);
});

test("spending questions are not mistaken for support requests", async () => {
  assert.equal(await askFast("How much did I spend on my card this month?"), null);
  assert.equal(await askFast("What did I spend on fraud protection?"), null);
});
