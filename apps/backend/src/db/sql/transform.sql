-- Chuyển raw_transactions (text) -> transactions (đúng kiểu) và gắn giỏ.
-- Luật 3 giỏ nằm ở MỘT chỗ duy nhất này, theo docs/api-contract.md:
--   1 Regular essentials: Housing, Utilities, Groceries, Transportation (trừ taxi MCC 4121)
--   2 Unexpected necessities: Health, Home & Tech
--   3 Everyday spending: mọi chi tiêu còn lại (Restaurants, Entertainment, Lifestyle, Travel, taxi)
INSERT INTO transactions
  (customer_id, account_id, tx_date, tx_ts, category, amount, balance_after,
   tx_type, merchant_id, mcc_code, basket)
SELECT
  customer_id,
  bank_account_id,
  tx_date::date,
  to_timestamp(tx_timestamp, 'DDMONYY:HH24:MI:SS')::timestamp,  -- "03OCT24:09:04:04"
  category,
  tx_amount_eur::numeric,
  balance_after_eur::numeric,
  transaction_type,
  NULLIF(merchant_id, ''),
  NULLIF(mcc_code, '')::int,
  CASE
    WHEN transaction_type IN ('salary','other_income','salary_sweep',
                              'investment_deposit','investment_withdrawal') THEN 0
    WHEN category IN ('Housing','Utilities','Groceries') THEN 1
    WHEN category = 'Transportation' AND COALESCE(NULLIF(mcc_code,'')::int, 0) <> 4121 THEN 1
    WHEN category IN ('Health','Home & Tech') THEN 2
    ELSE 3
  END
FROM raw_transactions;
