import { sql } from "kysely";
import { db } from "../../db/kysely.js";

export const mortgageRepository = {
  /** Thu nhập tháng tối thiểu / số tiền vay trong dữ liệu: hằng số (min = max) nên coi là công thức của ngân hàng. */
  async requiredIncomeRate() {
    const r = await sql<{ rate: number; n: number }>`
      SELECT AVG(required_monthly_income / requested_loan)::float AS rate, COUNT(*)::int AS n FROM mortgage_applications`.execute(db);
    return r.rows[0];
  },

  async applicationFor(customerId: string) {
    return db.selectFrom("mortgage_applications").selectAll().where("customer_id", "=", customerId).executeTakeFirst();
  },

  /** Where the customer's application stands on a given day, from its event log (open = no decision event yet). */
  async stageAt(customerId: string, asOf: string) {
    const r = await sql<{ id: string; started: string; decided: string | null; decision: string | null; reason: string | null; loan: number; price: number }>`
      SELECT a.mortgage_id AS id,
             MIN(e.ts)::date::text AS started,
             (MAX(e.ts) FILTER (WHERE e.event_type = 'loan_decision' AND e.ts::date <= ${asOf}::date))::date::text AS decided,
             a.final_decision AS decision, a.rejection_reason AS reason,
             a.requested_loan::float AS loan, a.property_price::float AS price
      FROM mortgage_applications a JOIN mortgage_events e USING (mortgage_id)
      WHERE a.customer_id = ${customerId} AND e.ts::date <= ${asOf}::date
      GROUP BY a.mortgage_id, a.final_decision, a.rejection_reason, a.requested_loan, a.property_price
      LIMIT 1`.execute(db);
    return r.rows[0] ?? null;
  },

  /** Tóm tắt dòng thời gian của một hồ sơ. */
  async timelineOf(mortgageId: string) {
    const r = await sql<{ events: number; days: number | null; contacts: number; docs: number; extraCollateral: boolean }>`
      SELECT COUNT(*)::int AS events,
             (EXTRACT(EPOCH FROM (MAX(ts) FILTER (WHERE event_type = 'loan_decision') - MIN(ts))) / 86400)::int AS days,
             COUNT(*) FILTER (WHERE event_type = 'customer_contact')::int AS contacts,
             COUNT(*) FILTER (WHERE event_type = 'document_received')::int AS docs,
             COALESCE(BOOL_OR(event_type = 'additional_collateral_requested'), false) AS "extraCollateral"
      FROM mortgage_events WHERE mortgage_id = ${mortgageId}`.execute(db);
    return r.rows[0];
  },

  /** Các hồ sơ khác có số tiền vay (±20%) và tỉ lệ vốn tự có (±3 điểm %) gần giống. */
  async similarCases(mortgageId: string, loan: number, equityShare: number) {
    const total = await sql<{ n: number; approved: number }>`
      SELECT COUNT(*)::int AS n, COUNT(*) FILTER (WHERE final_decision = 'approved')::int AS approved
      FROM mortgage_applications
      WHERE mortgage_id <> ${mortgageId}
        AND requested_loan BETWEEN ${loan * 0.8} AND ${loan * 1.2}
        AND ABS(equity_amount / property_price - ${equityShare}) <= 0.03`.execute(db);
    return total.rows[0];
  },

  /** Độ phủ tài sản thế chấp (collateral / khoản vay) của các hồ sơ ĐƯỢC DUYỆT: cho thấy không có một ngưỡng cố định. */
  async approvedCollateralCoverage() {
    const r = await sql<{ lowest: number; median: number; n: number }>`
      SELECT MIN(collateral_value / requested_loan)::float AS lowest,
             percentile_disc(0.5) WITHIN GROUP (ORDER BY collateral_value / requested_loan)::float AS median,
             COUNT(*)::int AS n
      FROM mortgage_applications WHERE final_decision = 'approved'`.execute(db);
    return r.rows[0];
  },

  /** Thống kê quy trình trên toàn bộ hồ sơ. */
  async processStats() {
    const r = await sql<{
      apps: number; approved: number; p10: number; p50: number; p90: number;
      contacts: number; docs: number; extraCollateralPct: number;
    }>`
      WITH s AS (
        SELECT mortgage_id,
               EXTRACT(EPOCH FROM (MAX(ts) FILTER (WHERE event_type = 'loan_decision') - MIN(ts))) / 86400 AS days,
               COUNT(*) FILTER (WHERE event_type = 'customer_contact') AS contacts,
               COUNT(*) FILTER (WHERE event_type = 'document_received') AS docs,
               BOOL_OR(event_type = 'additional_collateral_requested') AS extra
        FROM mortgage_events GROUP BY 1)
      SELECT COUNT(*)::int AS apps,
             (SELECT COUNT(*) FROM mortgage_applications WHERE final_decision = 'approved')::int AS approved,
             percentile_disc(0.1) WITHIN GROUP (ORDER BY days)::int AS p10,
             percentile_disc(0.5) WITHIN GROUP (ORDER BY days)::int AS p50,
             percentile_disc(0.9) WITHIN GROUP (ORDER BY days)::int AS p90,
             ROUND(AVG(contacts)::numeric, 1)::float AS contacts,
             ROUND(AVG(docs)::numeric, 1)::float AS docs,
             ROUND(100.0 * COUNT(*) FILTER (WHERE extra) / COUNT(*))::int AS "extraCollateralPct"
      FROM s`.execute(db);
    const reasons = await sql<{ reason: string; n: number }>`
      SELECT rejection_reason AS reason, COUNT(*)::int AS n FROM mortgage_applications
      WHERE final_decision = 'rejected' GROUP BY 1 ORDER BY 2 DESC`.execute(db);
    return { ...r.rows[0], reasons: reasons.rows };
  },

  /** Chi phí thường gặp (trung vị số tiền và tỉ lệ trên giá nhà) từ các sự kiện expense_recorded. */
  async typicalCosts() {
    const r = await sql<{ type: string; amount: number; ratio: number }>`
      SELECT e.expense_type AS type,
             percentile_disc(0.5) WITHIN GROUP (ORDER BY e.expense_amount)::float AS amount,
             percentile_disc(0.5) WITHIN GROUP (ORDER BY e.expense_amount / a.property_price)::float AS ratio
      FROM mortgage_events e JOIN mortgage_applications a USING (mortgage_id)
      WHERE e.expense_type IN ('transfer_tax', 'valuation_fee', 'bank_fee')
      GROUP BY 1`.execute(db);
    return new Map(r.rows.map((x) => [x.type, x]));
  },
};
