-- Bảng tổng hợp cho câu hỏi nhanh.
TRUNCATE monthly_spend, customer_stats;

INSERT INTO monthly_spend (customer_id, month, category, basket, spent, tx_count)
SELECT customer_id, date_trunc('month', tx_date)::date, category, basket,
       -SUM(amount), COUNT(*)
FROM transactions
WHERE basket > 0
GROUP BY 1, 2, 3, 4;

INSERT INTO customer_stats
  (customer_id, current_balance, last_tx_date, payday_dom, avg_salary, basket3_share)
SELECT c.customer_id, last_tx.balance_after, last_tx.tx_date,
       sal.payday_dom, sal.avg_salary, share.b3
FROM customers c
LEFT JOIN LATERAL (
  SELECT balance_after, tx_date FROM transactions t
  WHERE t.customer_id = c.customer_id ORDER BY tx_ts DESC LIMIT 1
) last_tx ON true
LEFT JOIN LATERAL (
  SELECT mode() WITHIN GROUP (ORDER BY EXTRACT(DAY FROM tx_date))::smallint AS payday_dom,
         ROUND(AVG(amount), 2) AS avg_salary
  FROM (SELECT tx_date, amount FROM transactions t
        WHERE t.customer_id = c.customer_id AND tx_type = 'salary'
        ORDER BY tx_date DESC LIMIT 6) s
) sal ON true
LEFT JOIN LATERAL (
  SELECT ROUND(SUM(spent) FILTER (WHERE basket = 3) / NULLIF(SUM(spent), 0), 4) AS b3
  FROM monthly_spend m WHERE m.customer_id = c.customer_id
) share ON true;

ANALYZE transactions; ANALYZE monthly_spend; ANALYZE customer_stats;
