import { toolDefinitions } from "./tools.js";

/**
 * (Tùy chọn, mặc định tắt: LLM_TOOL_GATING.) Chọn trước nhóm tool liên quan tới câu hỏi bằng từ khóa rẻ tiền, để không gửi cả 11 schema (khoảng 1.400 token) cho mỗi lượt.
 * Luật cụ thể xếp theo độ ưu tiên (lấy tối đa 2 luật đầu khớp); luật chung "chi tiêu" chỉ dùng khi không luật cụ thể nào khớp.
 * Không nhận ra ý nào thì gửi đủ tất cả: thà tốn token còn hơn thiếu tool cần dùng.
 * Đã đo: lọc tool giảm tổng token 4.857 → 2.737 nhưng làm mất cache tiền tố (token tính giá đầy đủ 649 → 1.793),
 * nên chỉ có lợi khi nhà cung cấp không cache hoặc token cache đắt hơn ~35% giá thường.
 */
interface Rule {
  when: RegExp;
  tools: string[];
}

const SPECIFIC: Rule[] = [
  { when: /\b(people my age|my age|peers|average finn|statistics finland|am i normal|others)\b/i, tools: ["compare_with_peers", "get_baskets"] },
  { when: /\b(kind of spender|type of spender|spender|my habits)\b/i, tools: ["spender_profile", "get_baskets", "compare_with_peers"] },
  { when: /\b(what if|cut|reduce|cutting|halve|half)\b/i, tools: ["simulate_whatif", "spending_breakdown"] },
  { when: /\b(safe|safely|afford|until payday|this week|left to spend)\b/i, tools: ["safe_to_spend", "safe_to_save", "simulate_whatif"] },
  { when: /\b(save|saving|savings|emergency|put aside|set aside)\b/i, tools: ["safe_to_save", "simulate_whatif", "income_summary"] },
  { when: /\b(income|salary|paid|payday|earn|earnings)\b/i, tools: ["income_summary", "safe_to_save"] },
  { when: /\b(recurring|regular|subscription|subscriptions|bills|rent|fixed)\b/i, tools: ["recurring_payments", "spending_breakdown"] },
  { when: /\b(compared?|versus|vs\.?|more than|less than|than last|than usual|usual)\b/i, tools: ["compare_periods", "spending_breakdown", "query_spending"] },
  { when: /\b(baskets?|essentials|necessities|everyday|overview|where (did|does) my money)\b/i, tools: ["get_baskets", "spending_breakdown", "compare_periods"] },
];

const GENERIC: Rule = {
  when: /\b(spend|spent|spending|how much|taxi|taxis|food|groceries|restaurants?|cafe|coffee|fuel|shops?|merchants?|transactions?|week ?day|weekend)\b/i,
  tools: ["query_spending", "spending_breakdown", "compare_periods", "get_baskets"],
};

const MAX_RULES = 2;

export function selectTools(message: string) {
  const hits = SPECIFIC.filter((r) => r.when.test(message)).slice(0, MAX_RULES);
  const rules = hits.length ? hits : GENERIC.when.test(message) ? [GENERIC] : [];
  const names = new Set(rules.flatMap((r) => r.tools));
  if (names.size === 0) return toolDefinitions; // không nhận ra ý: gửi đủ
  return toolDefinitions.filter((t) => names.has(t.function.name));
}
