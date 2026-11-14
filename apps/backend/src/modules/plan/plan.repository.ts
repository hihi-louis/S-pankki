import { db } from "../../db/kysely.js";

export interface GoalRow {
  id: number;
  name: string;
  kind: "home" | "savings";
  targetAmount: number | null;
  months: number | null;
  monthlyAmount: number;
  createdAt: string;
}

const toGoal = (r: { id: number; name: string; kind: string; target_amount: number | null; months: number | null; monthly_amount: number; created_at: Date | string }): GoalRow => ({
  id: r.id,
  name: r.name,
  kind: r.kind === "home" ? "home" : "savings",
  targetAmount: r.target_amount,
  months: r.months,
  monthlyAmount: r.monthly_amount,
  createdAt: new Date(r.created_at).toISOString(),
});

export const MAX_GOALS = 8;

export const planRepository = {
  async goals(customerId: string): Promise<GoalRow[]> {
    const rows = await db.selectFrom("goals").selectAll().where("customer_id", "=", customerId).orderBy("id").execute();
    return rows.map(toGoal);
  },

  async addGoal(customerId: string, g: Omit<GoalRow, "id" | "createdAt">): Promise<GoalRow> {
    const r = await db
      .insertInto("goals")
      .values({ customer_id: customerId, name: g.name, kind: g.kind, target_amount: g.targetAmount, months: g.months, monthly_amount: g.monthlyAmount })
      .returningAll()
      .executeTakeFirstOrThrow();
    return toGoal(r);
  },

  /** Only the fields given are changed. Returns null when the goal is not this customer's. */
  async updateGoal(customerId: string, id: number, g: Partial<Omit<GoalRow, "id" | "createdAt">>): Promise<GoalRow | null> {
    const set: Record<string, unknown> = {};
    if (g.name !== undefined) set.name = g.name;
    if (g.kind !== undefined) set.kind = g.kind;
    if (g.targetAmount !== undefined) set.target_amount = g.targetAmount;
    if (g.months !== undefined) set.months = g.months;
    if (g.monthlyAmount !== undefined) set.monthly_amount = g.monthlyAmount;
    if (Object.keys(set).length === 0) return (await this.goals(customerId)).find((x) => x.id === id) ?? null;
    const r = await db.updateTable("goals").set(set).where("customer_id", "=", customerId).where("id", "=", id).returningAll().executeTakeFirst();
    return r ? toGoal(r) : null;
  },

  async removeGoal(customerId: string, id: number): Promise<boolean> {
    const r = await db.deleteFrom("goals").where("customer_id", "=", customerId).where("id", "=", id).executeTakeFirst();
    return Number(r.numDeletedRows) > 0;
  },

  async weeklyLimit(customerId: string): Promise<number | null> {
    const r = await db.selectFrom("weekly_limits").select("amount").where("customer_id", "=", customerId).executeTakeFirst();
    return r ? r.amount : null;
  },

  async setWeeklyLimit(customerId: string, amount: number) {
    await db
      .insertInto("weekly_limits")
      .values({ customer_id: customerId, amount })
      .onConflict((oc) => oc.column("customer_id").doUpdateSet({ amount, updated_at: new Date() }))
      .execute();
  },

  async removeWeeklyLimit(customerId: string) {
    await db.deleteFrom("weekly_limits").where("customer_id", "=", customerId).execute();
  },
};
