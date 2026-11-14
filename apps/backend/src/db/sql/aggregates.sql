-- Bảng tổng hợp cho câu hỏi nhanh.
TRUNCATE monthly_spend, customer_stats;

INSERT INTO monthly_spend (customer_id, month, category, basket, spent, tx_count)
SELECT customer_id, date_trunc('month', tx_date)::date, category, basket,
       -SUM(amount), COUNT(*)
FROM transactions
WHERE basket > 0
GROUP BY 1, 2, 3, 4;

INSERT INTO customer_stats
  (customer_id, current_balance, last_tx_date, payday_dom, payday_days, payday_estimated, avg_salary, basket3_share)
SELECT c.customer_id, last_tx.balance_after, last_tx.tx_date,
       sal.median_dom, sal.payday_days, sal.payday_estimated, sal.avg_salary, share.b3
FROM customers c
LEFT JOIN LATERAL (
  SELECT balance_after, tx_date FROM transactions t
  WHERE t.customer_id = c.customer_id ORDER BY tx_ts DESC LIMIT 1
) last_tx ON true
-- Lương: 6 lần gần nhất. Ngày lặp lại >= 2 lần = ngày lương đều (có thể nhiều ngày, vd 15 và cuối tháng);
-- không có ngày nào lặp lại (thu nhập thất thường) thì dùng ngày trung vị và đánh dấu là ước lượng.
LEFT JOIN LATERAL (
  SELECT x.avg_salary, x.median_dom,
         COALESCE(r.days, ARRAY[x.median_dom]) AS payday_days,
         (r.days IS NULL) AS payday_estimated
  FROM (
    SELECT ROUND(AVG(amount), 2) AS avg_salary,
           percentile_disc(0.5) WITHIN GROUP (ORDER BY dom)::smallint AS median_dom
    FROM (SELECT amount, EXTRACT(DAY FROM tx_date)::int AS dom FROM transactions t
          WHERE t.customer_id = c.customer_id AND tx_type = 'salary'
          ORDER BY tx_date DESC LIMIT 6) s
  ) x
  LEFT JOIN LATERAL (
    SELECT array_agg(dom::smallint ORDER BY dom) AS days
    FROM (SELECT dom FROM (SELECT EXTRACT(DAY FROM tx_date)::int AS dom FROM transactions t
                           WHERE t.customer_id = c.customer_id AND tx_type = 'salary'
                           ORDER BY tx_date DESC LIMIT 6) s2
          GROUP BY dom HAVING COUNT(*) >= 2) q
  ) r ON true
) sal ON true
LEFT JOIN LATERAL (
  SELECT ROUND(SUM(spent) FILTER (WHERE basket = 3) / NULLIF(SUM(spent), 0), 4) AS b3
  FROM monthly_spend m WHERE m.customer_id = c.customer_id
) share ON true;

ANALYZE transactions; ANALYZE monthly_spend; ANALYZE customer_stats;
