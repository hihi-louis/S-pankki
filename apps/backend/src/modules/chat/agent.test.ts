import assert from "node:assert/strict";
import { after, test } from "node:test";
import { db } from "../../db/kysely.js";
import { newStats, runAgent, type ChatEvent } from "./agent.js";

/** LLM giả: mỗi lần gọi lấy bước kế tiếp trong kịch bản. Bước trả về mảng chunk thì là stream, ngược lại là phản hồi thường. */
function fakeLlm(script: Array<(params: any) => any>) {
  let i = 0;
  const calls: any[] = [];
  const create = async (params: any) => {
    calls.push(params);
    const out = script[i++]?.(params);
    if (!out) throw new Error("unexpected extra LLM call");
    if (!params.stream) return out;
    return (async function* () {
      for (const chunk of out) yield chunk;
    })();
  };
  return { llm: { chat: { completions: { create } } } as any, calls };
}

const toolCall = (args: object) => [
  { choices: [{ delta: { tool_calls: [{ index: 0, id: "c1", function: { name: "query_spending", arguments: JSON.stringify(args) } }] } }] },
  { choices: [], usage: { prompt_tokens: 100, completion_tokens: 10 } },
];
const speak = (text: string) => [
  ...text.split(" ").map((w, k) => ({ choices: [{ delta: { content: (k ? " " : "") + w } }] })),
  { choices: [], usage: { prompt_tokens: 150, completion_tokens: 20 } },
];
const TAXI = { from: "2026-08-01", to: "2026-09-01", mcc: 4121 }; // CUST04488: 589,33 € trong 15 giao dịch
const req = { customerId: "CUST04488", message: "How much did I spend on taxis in August?" };

after(() => db.destroy());

test("a correct answer is verified and not rewritten", async () => {
  const { llm, calls } = fakeLlm([() => toolCall(TAXI), () => speak("You spent 589.33 € on taxis in August across 15 rides.")]);
  const stats = newStats();
  const res = await runAgent(req, () => {}, undefined, stats, { llm });
  assert.match(res.answer, /589\.33/);
  assert.equal(stats.verified, true);
  assert.equal(stats.regenerated, false);
  assert.equal(calls.length, 2);
  assert.equal(res.verified, true);
  assert.equal(res.cards[0]?.type, "amount");
  assert.ok(res.provenance?.some((p) => p.title === "Spending total"));
});

test("an invented amount is caught, the model rewrites it, and the customer never keeps the wrong figure", async () => {
  const events: ChatEvent[] = [];
  const { llm } = fakeLlm([
    () => toolCall(TAXI),
    () => speak("You spent 999.99 € on taxis in August."),
    () => ({ choices: [{ message: { content: "You spent 589.33 € on taxis in August." } }], usage: { prompt_tokens: 200, completion_tokens: 15 } }),
  ]);
  const stats = newStats();
  const res = await runAgent(req, (e) => events.push(e), undefined, stats, { llm });
  assert.match(res.answer, /589\.33/);
  assert.doesNotMatch(res.answer, /999/);
  assert.equal(stats.regenerated, true);
  assert.equal(stats.verified, true);
  assert.ok(events.some((e) => e.type === "reset"), "the wrong text already streamed must be cleared");
  assert.equal(events.at(-1)?.type, "delta"); // câu đã sửa được phát sau khi xóa
});

test("if the rewrite is still wrong, a safe sentence replaces it and the answer is not marked verified", async () => {
  const { llm } = fakeLlm([
    () => toolCall(TAXI),
    () => speak("You spent 999.99 € on taxis."),
    () => ({ choices: [{ message: { content: "Still 888.88 € on taxis." } }], usage: {} }),
  ]);
  const stats = newStats();
  const res = await runAgent(req, () => {}, undefined, stats, { llm });
  assert.doesNotMatch(res.answer, /999|888/);
  assert.match(res.answer, /could not confirm/i);
  assert.equal(stats.verified, false);
  assert.equal(res.verified, false);
});

test("a number given without calling any tool is forced through a tool first", async () => {
  const { llm, calls } = fakeLlm([
    () => speak("You spent 123 € on taxis."), // model định trả lời có số mà chưa gọi tool
    () => toolCall(TAXI),
    () => speak("You spent 589.33 € on taxis in August."),
  ]);
  const stats = newStats();
  const res = await runAgent(req, () => {}, undefined, stats, { llm });
  assert.match(res.answer, /589\.33/);
  assert.equal(calls[1].tool_choice, "required");
  assert.equal(stats.verified, true);
});

test("a reply without numbers and without tools is fine", async () => {
  const { llm } = fakeLlm([() => speak("Hi! I can help with your spending.")]);
  const stats = newStats();
  const res = await runAgent({ ...req, message: "hi" }, () => {}, undefined, stats, { llm });
  assert.match(res.answer, /help/);
  assert.equal(stats.verified, null);
});
