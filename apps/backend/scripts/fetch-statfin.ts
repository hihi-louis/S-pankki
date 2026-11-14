/**
 * Tải chi tiêu hộ gia đình theo nhóm tuổi từ Statistics Finland (bảng 14q4, khảo sát 2022)
 * và lưu bản chụp vào src/data/statfin-hbs.json để demo không phụ thuộc mạng.
 * Chạy: npm run data:statfin
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const TABLE = "https://pxdata.stat.fi/PxWeb/api/v1/en/StatFin/ktutk/14q4.px";
const YEAR = "2022";
const CONTENT = "kulukk_kt_hk_2_1"; // chi tiêu mỗi đơn vị tiêu dùng mỗi tháng, giá hiện hành, EUR
// 0 tổng, 01 thực phẩm, 04 nhà ở, 042 tiền thuê tính toán của chủ nhà (không phải tiền mặt), 05 đồ gia dụng,
// 06 sức khỏe, 07 giao thông, 09 giải trí và văn hóa, 111 nhà hàng và quán ăn
const CODES = ["0", "01", "04", "042", "05", "06", "07", "09", "111"];

const out = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../src/data/statfin-hbs.json");

const res = await fetch(TABLE, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    query: [
      { code: "timeperiod_y", selection: { filter: "item", values: [YEAR] } },
      { code: "coicop_46_20231201", selection: { filter: "item", values: CODES } },
      { code: "ikaryhma_10_20180101", selection: { filter: "all", values: ["*"] } },
      { code: "contentscode", selection: { filter: "item", values: [CONTENT] } },
    ],
    response: { format: "json-stat2" },
  }),
});
if (!res.ok) throw new Error(`StatFin responded ${res.status}: ${await res.text()}`);
const j = (await res.json()) as {
  value: (number | null)[];
  updated?: string;
  dimension: Record<string, { category: { index: Record<string, number> } }>;
};

// Sắp xếp theo vị trí do API cung cấp: khóa dạng số ("0", "111") bị JS tự đưa lên đầu nên không dùng thứ tự khóa
const byPosition = (index: Record<string, number>) => Object.keys(index).sort((a, b) => index[a] - index[b]);
const allAges = byPosition(j.dimension.ikaryhma_10_20180101.category.index);
const ages = allAges.filter((a) => a !== "SSS");
const codes = byPosition(j.dimension.coicop_46_20231201.category.index);
const values: Record<string, Record<string, number | null>> = {};
codes.forEach((c, ci) => {
  values[c] = {};
  allAges.forEach((a, ai) => (values[c][a] = j.value[ci * allAges.length + ai]));
});

fs.writeFileSync(
  out,
  JSON.stringify(
    {
      source: "Statistics Finland, Households' consumption (Household Budget Survey)",
      table: "StatFin/ktutk/14q4.px: Household consumption expenditure by age of reference person",
      url: TABLE,
      year: YEAR,
      unit: "EUR per consumption unit per month, current prices",
      updated: j.updated ?? null,
      fetchedAt: new Date().toISOString().slice(0, 10),
      ageGroups: ages,
      values,
    },
    null,
    2,
  ) + "\n",
);
console.log(`Wrote ${out}: ${codes.length} groups x ${allAges.length} age groups`);
