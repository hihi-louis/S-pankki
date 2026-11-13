import { z } from "zod";
import { basketsService } from "../baskets/baskets.service.js";
import { coachService } from "../coach/coach.service.js";
import { whatIfBaseSchema, whatIfQuerySchema } from "../coach/coach.schema.js";
import { spendingQuerySchema } from "../spending/spending.schema.js";
import { spendingService } from "../spending/spending.service.js";

/** customerId bị bỏ khỏi input của tool: backend tự gắn từ request, LLM không thể đọc dữ liệu khách khác. */
const spendingInput = spendingQuerySchema.omit({ customerId: true });
const whatIfInput = whatIfBaseSchema.omit({ customerId: true });
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
      "Filter by category, basket (1 essentials, 2 important, 3 discretionary) or MCC: " +
      "4121 taxi, 4111 public transport, 5814 cafes/fast food, 5813 bars, 5812 restaurants, 5541/5542 fuel. " +
      CATEGORIES_HINT,
    schema: spendingInput,
    run: (input, customerId) => spendingService.getSpending({ ...spendingInput.parse(input), customerId }),
  },
  {
    name: "get_baskets",
    description:
      "This month's spending in the 3 baskets (essentials, important, discretionary) compared with the 6-month average, " +
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
      "The customer's spender profile: label, how their discretionary share compares with other customers, " +
      "and this month's discretionary spending versus their own average.",
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
