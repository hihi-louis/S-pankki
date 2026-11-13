/**
 * Khách demo theo docs/api-contract.md (CUST05020, CUST05014, CUST04121) cộng CUST04488 cho câu hỏi taxi
 * (hợp đồng yêu cầu một khách có giao dịch MCC 4121 trong tháng 8/2026).
 * Tuổi lấy từ DB; mô tả dựa trên số liệu 6 tháng 03-08/2026 (chi/tháng, lương, số dư).
 */
export const PERSONA_DEFS = [
  {
    customerId: "CUST05020",
    name: "Aino",
    description: "Salary ~2,400 €/month plus side income, spends ~3,300 €/month. Balance ~6,900 €.",
  },
  {
    customerId: "CUST05014",
    name: "Eetu",
    description: "Salary ~3,800 €/month, eats out ~1,600 €/month. 43% of spending is everyday spending.",
  },
  {
    customerId: "CUST04121",
    name: "Ella",
    description: "Salary ~3,200 €/month, spends ~3,800 €/month. 37% of spending is everyday spending.",
  },
  {
    customerId: "CUST04488",
    name: "Mikko",
    description: "Salary ~3,570 €/month, spends ~3,150 €/month, incl. ~590 € on taxis in August.",
  },
] as const;
