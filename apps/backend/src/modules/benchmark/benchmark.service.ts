import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { HttpError } from "../../lib/errors.js";
import { lastNMonths, monthStart } from "../../lib/dates.js";
import { customersRepository } from "../customers/customers.repository.js";
import { benchmarkRepository } from "./benchmark.repository.js";
import type { BenchmarkQuery } from "./benchmark.schema.js";

// Bản chụp Statistics Finland (cập nhật bằng `npm run data:statfin`)
interface Hbs {
  source: string;
  table: string;
  year: string;
  unit: string;
  ageGroups: string[];
  values: Record<string, Record<string, number | null>>;
}
const hbs = JSON.parse(
  fs.readFileSync(fileURLToPath(new URL("../../data/statfin-hbs.json", import.meta.url)), "utf8"),
) as Hbs;

interface Group {
  key: string;
  label: string;
  /** Danh mục của S-Pankki; null = tất cả. */
  categories: string[] | null;
  /** Mã COICOP cộng vào, và mã trừ ra (tiền thuê tính toán của chủ nhà không phải tiền mặt). */
  plus: string;
  minus?: string;
}

// Chỉ so sánh những nhóm tương ứng rõ ràng giữa hai bên; Lifestyle, Travel, Home & Tech không có nhóm tương đương sạch nên bỏ qua.
const GROUPS: Group[] = [
  { key: "total", label: "Total spending", categories: null, plus: "0", minus: "042" },
  { key: "groceries", label: "Groceries", categories: ["Groceries"], plus: "01" },
  { key: "housing", label: "Housing and utilities", categories: ["Housing", "Utilities"], plus: "04", minus: "042" },
  { key: "transport", label: "Transport", categories: ["Transportation"], plus: "07" },
  { key: "restaurants", label: "Eating out", categories: ["Restaurants"], plus: "111" },
  { key: "recreation", label: "Recreation and entertainment", categories: ["Entertainment"], plus: "09" },
  { key: "health", label: "Health", categories: ["Health"], plus: "06" },
];

const MONTHS = 6;
const round = (n: number) => Math.round(n);

/** Nhóm tuổi của Statistics Finland chứa `age`. */
function ageGroup(age: number): string {
  const groups = hbs.ageGroups;
  for (const g of groups) {
    if (g.endsWith("-")) {
      if (age >= Number(g.slice(0, -1))) return g;
    } else {
      const [lo, hi] = g.split("-").map(Number);
      if (age >= lo && age <= hi) return g;
    }
  }
  return groups[0];
}
const groupLabel = (g: string) => (g.endsWith("-") ? `${g.slice(0, -1)}+` : g.replace("-", "–"));

export const benchmarkService = {
  /** So sánh chi tiêu trung bình mỗi tháng (6 tháng trọn vẹn gần nhất) với người Phần Lan cùng nhóm tuổi. */
  async compare(q: BenchmarkQuery) {
    const customer = await customersRepository.findWithStats(q.customerId);
    if (!customer) throw new HttpError(404, `Customer ${q.customerId} not found`);
    const age = customer.age ?? 0;
    const ag = ageGroup(age);
    const spent = await benchmarkRepository.spentByCategory(q.customerId, lastNMonths(MONTHS)[0], monthStart(0));

    const rows = GROUPS.filter((g) => !q.topic || g.key === q.topic).flatMap((g) => {
      const plus = hbs.values[g.plus]?.[ag];
      if (plus == null) return [];
      const peers = plus - (g.minus ? hbs.values[g.minus]?.[ag] ?? 0 : 0);
      const total = g.categories ? g.categories.reduce((s, c) => s + (spent.get(c) ?? 0), 0) : [...spent.values()].reduce((s, v) => s + v, 0);
      const you = total / MONTHS;
      return [
        {
          key: g.key,
          label: g.label,
          you: round(you),
          peers: round(peers),
          diffPct: peers > 0 ? round(((you - peers) / peers) * 100) : null,
        },
      ];
    });

    return {
      age,
      peerGroup: `Finns aged ${groupLabel(ag)}`,
      period: "average per month over the last 6 months",
      source: `${hbs.source}, ${hbs.year}`,
      note:
        "Peer figures are per consumption unit (a single adult counts as 1), 2022 prices, and exclude imputed rent. " +
        "Only categories that match clearly are compared.",
      rows,
    };
  },
};
