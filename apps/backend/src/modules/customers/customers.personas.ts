/**
 * Khách chọn tay từ dữ liệu làm persona demo (tên là tên giả).
 * Tuổi lấy từ DB; mô tả dựa trên số liệu 6 tháng 03-08/2026 (chi/tháng, lương, số dư).
 */
export const PERSONA_DEFS = [
  {
    customerId: "CUST04488",
    name: "Mikko",
    description: "39, salary ~3,570 €/month, spends ~3,150 €/month incl. ~590 € on taxis in August.",
  },
  {
    customerId: "CUST00488",
    name: "Aino",
    description: "18, salary ~1,650 €/month, spends nearly all of it; balance under 900 €.",
  },
  {
    customerId: "CUST02305",
    name: "Pekka",
    description: "51, salary ~3,660 €/month, spends ~2,100 €, only ~9% on little leaks; balance ~13,000 €.",
  },
  {
    customerId: "CUST01382",
    name: "Laura",
    description: "50, salary ~5,900 €/month, spends ~7,700 €/month, 43% of it on discretionary little leaks.",
  },
] as const;
