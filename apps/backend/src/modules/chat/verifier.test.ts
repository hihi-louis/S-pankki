import assert from "node:assert/strict";
import { test } from "node:test";
import { extractAmounts, extractPercents, parseAmount, verifyAnswer } from "./verifier.js";

const facts = [
  { total: 589.33, count: 15, period: { from: "2026-08-01", to: "2026-09-01" } },
  { rows: [{ label: "Mon", spent: 2978.79 }, { label: "Tue", spent: 2420.73 }, { label: "Wed", spent: 4355.31 }], monthly: 1086.12, sharePct: 40.6 },
  { a: 4819.42, b: 3150.68 },
];

test("parses amounts in common formats", () => {
  assert.equal(parseAmount("1,100.48"), 1100.48);
  assert.equal(parseAmount("589,33"), 589.33);
  assert.equal(parseAmount("3 089.22"), 3089.22);
  assert.deepEqual(extractAmounts("You spent 589.33 € on taxis and €1,200 on rent, about 250 euros more."), [589.33, 1200, 250]);
  assert.deepEqual(extractPercents("up 53% and 8.1 % more"), [53, 8.1]);
});

test("accepts exact, rounded and derived numbers", () => {
  assert.ok(verifyAnswer("You spent 589.33 € on taxis.", facts).ok);
  assert.ok(verifyAnswer("About 590 € on taxis.", facts).ok); // làm tròn
  assert.ok(verifyAnswer("That is 7,070.56 € in total.", [{ x: 2978.79, y: 4091.77 }]).ok); // tổng hai số
  assert.ok(verifyAnswer("Mon to Wed came to 9,754.83 €.", facts).ok); // tổng các dòng liền kề
  assert.ok(verifyAnswer("That is 13,033.44 € a year.", facts).ok); // 1086.12 x 12
  assert.ok(verifyAnswer("Spending is 53% above usual.", facts).ok); // (4819.42 - 3150.68) / 3150.68
  assert.ok(verifyAnswer("Housing is 40.6% of spending.", facts).ok); // phần trăm có sẵn
});

test("accepts numbers from the question or history", () => {
  assert.ok(verifyAnswer("For a 250,000 € home you need more.", [{ need: 31891 }], ["Can I buy a 250000 euro home?"]).ok);
});

test("rejects invented amounts and percentages", () => {
  const bad = verifyAnswer("You spent 999.99 € on taxis, 88% more than usual.", facts);
  assert.equal(bad.ok, false);
  assert.deepEqual(bad.unverified, ["999.99 €", "88%"]);
});

test("cannot derive an invented number by mixing unrelated results", () => {
  // 200 € is not a sum/difference of numbers that belong together, and 88% is not a ratio of related numbers
  const many = [
    { total: 589.33, count: 15 },
    { total: 3089.22, rows: [{ spent: 1252.97 }, { spent: 341.95 }, { spent: 293.3 }, { spent: 272.82 }] },
    { monthly: 1086.12, other: { avg: 2172.23, now: 3436.35 } },
  ];
  assert.equal(verifyAnswer("You spent 88% more than usual.", many).ok, false);
  assert.equal(verifyAnswer("Roughly 777 € went missing.", many).ok, false);
  assert.ok(verifyAnswer("That is 58% above usual.", many).ok); // 3436.35 / 2172.23 - 1: cùng một đối tượng
  assert.ok(verifyAnswer("Taxis plus the first two rows is 2,183.25 €.", many).ok === false);
});

test("percentile phrases are names, not claims", () => {
  assert.ok(verifyAnswer("The fastest 10% took 18 days and the slowest 10% about 34 days.", [{ fastest10: 18, slowest10: 34 }]).ok);
  assert.deepEqual(extractPercents("the fastest 10% and a 42% rise"), [42]);
});

test("answers without numbers pass", () => {
  const v = verifyAnswer("I can only help with your own spending.", facts);
  assert.ok(v.ok);
  assert.equal(v.checked, 0);
});
