# API contract (frontend ↔ backend)

Source of truth: `packages/shared/src/index.ts`. Change the types there first, then both sides.

## Ground rules

- All amounts in **EUR**. In `sources`, **negative = money out**. Cards and charts use positive numbers.
- Dates are ISO `YYYY-MM-DD`.
- The dataset ends on **2026-09-30**. Treat that as "today" ("this week" = last days of Sep, "last month" = Aug 2026) and send it as `asOf`.
- **Numbers come from code (SQL / logic), not from the LLM.** The LLM writes `answer` and `suggestions` around numbers it got from tools.
- All user-facing text in **English**.

## Baskets (S-Bank's names)

| id | name | categories |
|---|---|---|
| 1 | Regular essentials 🏠 | Housing, Utilities, Groceries, Transportation (except taxi) |
| 2 | Unexpected necessities 🔧 | Health, Home & Tech |
| 3 | Everyday spending ☕ | Restaurants, Entertainment, Lifestyle, Travel, taxi (MCC 4121) |
| – | not spending | Salary, Other Income, Invest Deposit/Withdraw, Salary Sweep |

## `POST /chat`

Request: `{ customerId, message, history? }`

Response:

```json
{
  "answer": "You spent €64.20 on taxis in August.",
  "cards": [{ "type": "amount", "label": "Taxis in August", "value": 64.2, "currency": "EUR" }],
  "chart": null,
  "sources": [{ "date": "2026-08-03", "amount": -18.5, "category": "Transportation", "merchantId": "MRC-TRN-0012", "mcc": "4121" }],
  "sourcesTotal": 4,
  "suggestions": ["Compare to July", "What if I took the bus?"]
}
```

### `POST /chat/stream`

Same request as `/chat`, answered as Server-Sent Events (`data: {json}` lines separated by a blank line):

| event | fields | meaning |
|---|---|---|
| `status` | `text` | what the assistant is doing, e.g. "Comparing the periods…" |
| `delta` | `text` | a piece of the answer as it is written |
| `reset` | | discard the text received so far |
| `final` | `response` | the full `/chat` response (always sent last; replace the streamed text with `response.answer`) |
| `error` | `message` | something failed; show `message` |

Invalid input is a normal `400` JSON response before the stream opens.

`cards[].type` (the frontend picks the widget by this):

| type | fields | used for |
|---|---|---|
| `amount` | `label, value` | any single number |
| `safe_to_spend` | `perDay, total, until` | "What can I safely spend this week?" |
| `safe_to_save` | `amount, until, monthsCovered` | "How much can I save right now?" (money not needed before payday) |
| `facts` | `title, headline?, rows[{label,value,tone?}], note?` | tables of ready-formatted facts: mortgage answers, spending plan |
| `what_if` | `category, monthlySpend, defaultCutPct` | "How much could I save if…" (slider is computed on the frontend) |
| `benchmark` | `label, you, peers, peerGroup, source?` | you vs. Finns your age (Statistics Finland) |

`provenance[]` (`title, how, data?, source, sourceUrl?`) explains how each figure was obtained; the app shows it as "How I calculated this".
`verified` is `true` when every amount and percentage in `answer` was checked against the data the tools returned (a wrong answer is rewritten once, then replaced by a safe sentence and `verified` is `false`).

`chart.type`: `bar` (months), `line`, `donut` (shares, e.g. by basket).

## `GET /summary?customerId=`

```json
{
  "month": "2026-09",
  "asOf": "2026-09-30",
  "balance": 3757.43,
  "nextPayday": { "date": "2026-10-20", "expected": 2143.39, "estimated": false },
  "baskets": [
    { "id": 1, "name": "Regular essentials", "spent": 1874.38, "avg6m": 1793.61,
      "top": [{ "category": "Housing", "spent": 1252.97 }] }
  ]
}
```

## `GET /personas`

`[{ customerId, name, age, description }]`. Demo customers: `CUST05020` (21), `CUST05014` (23), `CUST04121` (18).

Note: CUST05020 has no taxi rides. For the taxi demo question, pick a customer with MCC 4121 transactions in Aug 2026.

## `GET /insights?customerId=`

Proactive observations for the Overview (computed from the data, no LLM): a spike or drop vs. the 6-month average,
safe-to-spend or a shortfall warning, fixed costs, income stability, savings habit, and a peer comparison.
Up to 4, most important first. Tapping one sends `ask` to `/chat`.

```json
{
  "asOf": "2026-09-30",
  "insights": [
    { "id": "spike-restaurants", "tone": "alert", "title": "Restaurants is 738 € above usual",
      "body": "You spent 750 € on restaurants this month. A typical month is 12 €.",
      "ask": "What did I spend on restaurants this month?" }
  ]
}
```

## `GET /customers/:id`

The "login": the app checks that the customer ID exists and greets the customer. No password (demo only).
The dataset has no customer names, so the app greets the customer by ID. `404` if the ID is unknown.

```json
{ "customerId": "CUST05020", "age": 21, "postalCode": "00708" }
```

## The story flow (Overview, insight story, category, forecast)

The Overview tells the month as: snapshot, what stands out, what is coming, your plan. All of these are computed from the data (no LLM).

| endpoint | returns |
|---|---|
| `GET /snapshot?customerId=` | `Snapshot`: spent vs usual, income, net, and every category with `now`, `usual`, `diffPct` |
| `GET /category?customerId=&category=` | `CategoryDive`: 7-month trend, where it went (shops), largest purchases, peers when comparable |
| `GET /insights/:id?customerId=` | `InsightStory`: `happened`, `why`, `means`, `next.actions[]` (what happened, why, what it means, what to do) |
| `GET /coach/forecast?customerId=` | `ForecastResponse`: estimated balance per day until payday (usual pace, saved plan, safe pace) and the regular bills in between |
| `POST /plan/apply` `{customerId, basket, reduceBy}` | Lowers a basket cap in the saved plan (creates a starting plan first if none) and raises the monthly saving by the same amount |

`why` lists the biggest items (shops, purchases): they show what the money went to, not the customer's reason.
`StoryAction.apply` is only ever run by the customer's tap on "Apply to my plan"; `link` opens another screen.
Insight ids are `trim-<Category>`, `weekday-<Day>`, `last-month`, `spike-<Category>`, `drop-<Category>`, `runway-ok|runway-short`, `income-variable`, `saving-habit`, `peer-<key>`, `fixed-costs`.

## `GET /recommendations?customerId=`

The cards of the Overview carousel, in plain English, at most 5, at most one per `type`, most urgent first, then by money impact:

| type | when | button | opens |
|---|---|---|---|
| `heads_up` | the balance may reach zero before payday (replaces `week` if the bills alone do not fit) | Make a plan | story `runway-short` |
| `loan` | a home-loan application is open (no decision yet) or was decided in the last 45 days. Open: right after any heads-up, and the `week` card adds "your home loan is still open, so you may want to spend less". Decided: after `week`. | Check my application / See my application / See why | the chat (`target.kind = "ask"`) |
| `week` | always (unless `heads_up` replaced it) | See how I worked this out | the forecast |
| `pattern` | a weekday is 25%+ of everyday spending, or a category is clearly above usual | Show me why | story `weekday-<Day>` or `spike-<Category>` |
| `opportunity` | the biggest flexible category (everyday spending), a 20% trim | Try it | story `trim-<Category>` (10/20/30% buttons) |
| `good` | a category clearly below usual, else a steady saving habit | Show me why | story `drop-<Category>` or `saving-habit` |
| `peer` | a big difference to people the same age (only if there is room) | Show me why | story `peer-<key>` |
| `start` | under 3 full months of history: only "where last month went", no "usual" | Show me where it went | story `last-month` |

"Usual" is the median of the last 3 full months for that category. A change counts only if it is over 25% and over €30.
Rules live in `insights/recommendations.ts` (pure function with unit tests). Wording stays neutral ("a lighter month").

```json
{ "asOf": "2026-09-30", "items": [
  { "id": "this-week-safe", "type": "week", "eyebrow": "This week", "tone": "info", "headline": "You can safely spend €2,659",
    "body": "That is about €380 a day after your bills and basics, until payday on 14 Oct.",
    "cta": "See how I worked this out", "target": { "kind": "forecast" } } ] }
```

`target` is `{kind:"forecast"}`, `{kind:"insight", id}` or `{kind:"ask", text}` (send `text` to the chat).
An application counts as open when its event log has no `loan_decision` yet on the as-of day. In the dataset every application is decided by 10 Sep 2026, so with today = 30 Sep the customers who see this are those decided in the last 45 days (15 of 200).
The chat tool `safe_to_spend` also returns `loanContext` in that case, and the assistant says that cash flow alone does not show that spending more is wise.

`query_spending` results also carry `perDay`, `perWeek` and `averagePerTransaction`, so the assistant can say "about 39 € a ride" without doing its own arithmetic (numbers it makes up are rejected by the number check).

## `GET /basket-transactions?customerId=&basket=1|2|3`

The purchases behind one slice of the Overview pie, this month, grouped by category (biggest total first).
`categories[]` = `{ category, total, count, items[{ date, amount (positive), label }] }`, items newest first.
Merchant names are not in the data, so `label` is "Pharmacy #13" style (shop type from the MCC code plus the shop number).
`truncated` is true when more than 500 purchases exist (not expected for one month).

## Home loan context

`GET /loan-context?customerId=` returns `LoanStatusResponse` (`hasApplication`, `context`, `reserve`). `context` is not null when the customer's application is
open (no `loan_decision` yet) or was decided in the last 45 days. `reserve` = estimated first payment + usual buying costs (0 after a rejection).
Safe-to-spend (recommendation card, chat tool `safe_to_spend`, fast path) then also returns `loanContext`, `loanReserve`, `safeAfterLoan` and `safeAfterLoanPerDay`,
and the amount shown is the one after the reserve. The reserve is an estimate from public averages, not the bank's rule.

Demo switch: any request with the header `x-demo-loan-open: 1` shows the customer's loan as if it were still open (the middle day of the application). The app sets it from the account menu.
