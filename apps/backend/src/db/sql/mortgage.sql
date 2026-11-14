-- raw_mortgage_* (text) -> mortgage_applications / mortgage_events (đúng kiểu).
INSERT INTO mortgage_applications
  (mortgage_id, customer_id, final_decision, rejection_reason, property_price, requested_loan,
   equity_amount, collateral_value, required_monthly_income, loan_to_value)
SELECT
  mortgage_customer_id, customer_id, final_decision, NULLIF(rejection_reason, ''),
  NULLIF(final_property_price_eur, '')::numeric,
  NULLIF(final_requested_loan_eur, '')::numeric,
  NULLIF(final_equity_amount_eur, '')::numeric,
  NULLIF(final_collateral_value_eur, '')::numeric,
  ROUND(NULLIF(required_monthly_income_eur, '')::numeric, 2),
  ROUND(NULLIF(final_loan_to_value, '')::numeric, 4)
FROM raw_mortgage_link;

INSERT INTO mortgage_events
  (mortgage_id, ts, event_type, property_id, property_type, property_price_estimate, loan_amount,
   equity_amount, collateral_type, collateral_value, collateral_status, decision, rejection_reason,
   expense_type, expense_amount, note)
SELECT
  mortgage_customer_id,
  to_timestamp(ts, 'DDMONYY:HH24:MI:SS')::timestamp,   -- "26MAY26:00:00:00"
  event_type, NULLIF(property_id, ''), NULLIF(property_type, ''),
  NULLIF(property_price_estimate, '')::numeric, NULLIF(loan_amount, '')::numeric,
  NULLIF(equity_amount, '')::numeric, NULLIF(collateral_type, ''),
  NULLIF(collateral_value, '')::numeric, NULLIF(collateral_status, ''),
  NULLIF(decision, ''), NULLIF(rejection_reason, ''), NULLIF(expense_type, ''),
  NULLIF(expense_amount, '')::numeric, NULLIF(note, '')
FROM raw_mortgage_events;
