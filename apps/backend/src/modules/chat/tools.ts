import { z } from "zod";
import { basketsService } from "../baskets/baskets.service.js";
import { coachService } from "../coach/coach.service.js";
import { whatIfBaseSchema, whatIfQuerySchema } from "../coach/coach.schema.js";
import { benchmarkService } from "../benchmark/benchmark.service.js";
import { benchmarkQuerySchema } from "../benchmark/benchmark.schema.js";
import { exploreService } from "../explore/explore.service.js";
import { breakdownQuerySchema, compareQuerySchema } from "../explore/explore.schema.js";
import { spendingQuerySchema } from "../spending/spending.schema.js";
import { spendingService } from "../spending/spending.service.js";

/** customerId bị bỏ khỏi input của tool: backend tự gắn từ request, LLM không thể đọc dữ liệu khách khác. */
const spendingInput = spendingQuerySchema.omit({ customerId: true });
const whatIfInput = whatIfBaseSchema.omit({ customerId: true });
const breakdownInput = breakdownQuerySchema.omit({ customerId: true });
const compareInput = compareQuerySchema.omit({ customerId: true });
const benchmarkInput = benchmarkQuerySchema.omit({ customerId: true });
const noInput = z.object({});

const toolSchema = (s: z.ZodType) => {
  const { $schema: _ignored, ...rest } = z.toJSONSchema(s, { io: "input", unrepresentable: "any" });
  return rest;
};

const CATEGORIES_HINT =
  "Valid categories: Groceries, Housing, Transportation, Utilities, Health, Home & Tech, Entertainment, Lifestyle, Restaurants, Travel.";

interface ToolDef {
  name: string;
  description: string;
  schema: z.ZodType;
  run: (input: unknown, customerId: string) => Promise<unknown>;
}

const defs: ToolDef[] = [
  {
    name: "query_spending",
    description:
      "Total spending and source transactions for a date range [from, to) (to is exclusive). " +
      "Filter by category, basket (1 regular essentials, 2 unexpected necessities, 3 everyday spending) or MCC: " +
      "4121 taxi, 4111 public transport, 5814 cafes/fast food, 5813 bars, 5812 restaurants, 5541/5542 fuel. " +
      CATEGORIES_HINT,
    schema: spendingInput,
    run: (input, customerId) => spendingService.getSpending({ ...spendingInput.parse(input), customerId }),
  },
  {
    name: "spending_breakdown",
    description:
      "Break spending in [from, to) down by one dimension: category, month (trend over time), merchant (which shops), " +
      "basket, or weekday. Optional filters: category, basket, mcc. Use it for 'where does my money go', 'which shops', " +
      "'how did X change month to month', 'which day do I spend most'. " + CATEGORIES_HINT,
    schema: breakdownInput,
    run: (input, customerId) => exploreService.breakdown(breakdownQuerySchema.parse({ ...(input as object), customerId })),
  },
  {
    name: "compare_periods",
    description:
      "Compare spending in period B with period A (A is the baseline, e.g. last month; B the newer one, e.g. this month). " +
      "Returns totals, difference, % change and the categories that changed most. Optional filters: category, basket, mcc. " + CATEGORIES_HINT,
    schema: compareInput,
    run: (input, customerId) => exploreService.compare(compareQuerySchema.parse({ ...(input as object), customerId })),
  },
  {
    name: "recurring_payments",
    description:
      "Regular monthly payments (rent, utilities, subscriptions, regular shops) found in the last 6 months, " +
      "their monthly total and share of spending.",
    schema: noInput,
    run: (_input, customerId) => exploreService.recurring(customerId),
  },
  {
    name: "income_summary",
    description:
      "Income over the last 6 months (salary and other income), how steady it is, usual payday, and how much was invested per month.",
    schema: noInput,
    run: (_input, customerId) => exploreService.incomeSummary(customerId),
  },
  {
    name: "safe_to_save",
    description:
      "How much the customer can move to savings right now without running short before payday, " +
      "plus how many months of essentials the balance covers and the gap to a 3-month emergency fund.",
    schema: noInput,
    run: (_input, customerId) => coachService.safeToSave(customerId),
  },
  {
    name: "compare_with_peers",
    description:
      "Compare the customer's average monthly spending with Finns of the same age group (Statistics Finland household " +
      "budget survey, 2022). Optional topic: total, groceries, housing, transport, restaurants, recreation, health; leave EMPTY for a general 'how do I compare' question so all categories are returned.",
    schema: benchmarkInput,
    run: (input, customerId) => benchmarkService.compare(benchmarkQuerySchema.parse({ ...(input as object), customerId })),
  },
  {
    name: "get_baskets",
    description:
      "This month's spending in the 3 baskets (regular essentials, unexpected necessities, everyday spending) compared with the 6-month average, " +
      "top categories per basket, current balance and next payday.",
    schema: noInput,
    run: (_input, customerId) => basketsService.getSummary(customerId),
  },
  {
    name: "safe_to_spend",
    description:
      "How much the customer can safely spend until the next payday after reserving the expected essentials, " +
      "plus the per-day amount.",
    schema: noInput,
    run: (_input, customerId) => coachService.safeToSpend(customerId),
  },
  {
    name: "simulate_whatif",
    description:
      "What the customer would save if they cut spending in ONE basket or ONE category by a percent OR a fixed " +
      "amount per month. Based on the 6-month average. Provide exactly one of basket/category and exactly one of percent/amountEur. " +
      CATEGORIES_HINT,
    schema: whatIfInput,
    run: (input, customerId) => coachService.whatIf(whatIfQuerySchema.parse({ ...(input as object), customerId })),
  },
  {
    name: "spender_profile",
    description:
      "The customer's spender profile: label, how their everyday-spending share compares with other customers, " +
      "and this month's everyday spending versus their own average.",
    schema: noInput,
    run: (_input, customerId) => coachService.spenderProfile(customerId),
  },
];

/** Định dạng OpenAI `tools`. */
export const toolDefinitions = defs.map((t) => ({
  type: "function" as const,
  function: { name: t.name, description: t.description, parameters: toolSchema(t.schema) },
}));

/** Chạy tool; lỗi được trả về cho LLM tự sửa thay vì làm sập request. */
export async function runTool(name: string, rawArgs: string, customerId: string): Promise<unknown> {
  const tool = defs.find((t) => t.name === name);
  if (!tool) return { error: `Unknown tool ${name}` };
  try {
    const input = rawArgs ? JSON.parse(rawArgs) : {};
    return await tool.run(input, customerId);
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}
