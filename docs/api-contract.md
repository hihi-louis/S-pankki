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

`cards[].type` (the frontend picks the widget by this):

| type | fields | used for |
|---|---|---|
| `amount` | `label, value` | any single number |
| `safe_to_spend` | `perDay, total, until` | "What can I safely spend this week?" |
| `safe_to_save` | `amount, until, monthsCovered` | "How much can I save right now?" (money not needed before payday) |
| `what_if` | `category, monthlySpend, defaultCutPct` | "How much could I save if…" (slider is computed on the frontend) |
| `benchmark` | `label, you, peers, peerGroup, source?` | you vs. Finns your age (Statistics Finland) |

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
