import type { SavedPlan } from "@sbank/shared";
import { db } from "../../db/kysely.js";

type Draft = Omit<SavedPlan, "createdAt">;

const toSaved = (r: {
  goal_type: string; goal_label: string; goal_amount: number | null; months: number | null; monthly_saving: number;
  cap_essentials: number; cap_unexpected: number; cap_everyday: number; created_at: Date | string;
}): SavedPlan => ({
  goalType: r.goal_type === "home" ? "home" : "savings",
  goalLabel: r.goal_label,
  goalAmount: r.goal_amount,
  months: r.months,
  monthlySaving: r.monthly_saving,
  capEssentials: r.cap_essentials,
  capUnexpected: r.cap_unexpected,
  capEveryday: r.cap_everyday,
  createdAt: new Date(r.created_at).toISOString(),
});

export const planRepository = {
  async get(customerId: string): Promise<SavedPlan | null> {
    const r = await db.selectFrom("plans").selectAll().where("customer_id", "=", customerId).executeTakeFirst();
    return r ? toSaved(r) : null;
  },

  /** Mỗi khách một kế hoạch: lưu mới thì thay kế hoạch cũ. */
  async upsert(customerId: string, p: Draft): Promise<SavedPlan> {
    const values = {
      goal_type: p.goalType,
      goal_label: p.goalLabel,
      goal_amount: p.goalAmount,
      months: p.months,
      monthly_saving: p.monthlySaving,
      cap_essentials: p.capEssentials,
      cap_unexpected: p.capUnexpected,
      cap_everyday: p.capEveryday,
    };
    const r = await db
      .insertInto("plans")
      .values({ customer_id: customerId, ...values })
      .onConflict((oc) => oc.column("customer_id").doUpdateSet({ ...values, created_at: new Date() }))
      .returningAll()
      .executeTakeFirstOrThrow();
    return toSaved(r);
  },

  async remove(customerId: string) {
    await db.deleteFrom("plans").where("customer_id", "=", customerId).execute();
  },
};
