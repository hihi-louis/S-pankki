/**
 * Kiểm chứng số liệu trong câu trả lời của model: mọi khoản tiền (và phần trăm) phải có cơ sở trong dữ liệu mà tool đã trả về
 * (hoặc trong câu hỏi/lịch sử của người dùng). Cho phép: làm tròn, cộng/trừ hai số, tổng các dòng liền kề của một bảng,
 * nhân/chia 12 (năm/tháng), và tỉ lệ phần trăm giữa hai số. Không cố bắt lỗi diễn giải, chỉ bắt số bịa.
 */

export interface Verdict {
  ok: boolean;
  /** Số tiền hoặc phần trăm không tìm thấy cơ sở. */
  unverified: string[];
  /** Số lượng giá trị đã kiểm tra. */
  checked: number;
}

const MONEY = /(?:€\s*)?(\d[\d  ,]*(?:\.\d+)?)\s*(?:€|euros?\b|EUR\b)|€\s*(\d[\d  ,]*(?:\.\d+)?)/gi;
const PERCENT = /(\d+(?:\.\d+)?)\s*%/g;

/** "1,100.48" -> 1100.48; "589,33" -> 589.33; "3 089.22" -> 3089.22. */
export function parseAmount(raw: string): number {
  const s = raw.replace(/[  ]/g, "");
  if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) return parseFloat(s.replace(/,/g, ""));
  if (/^\d+,\d{1,2}$/.test(s)) return parseFloat(s.replace(",", "."));
  return parseFloat(s.replace(/,/g, ""));
}

export function extractAmounts(text: string): number[] {
  const out: number[] = [];
  for (const m of text.matchAll(MONEY)) {
    const v = parseAmount(m[1] ?? m[2]);
    if (Number.isFinite(v)) out.push(v);
  }
  return out;
}

// "the fastest 10%", "slowest 10 %", "top 20%": tên nhóm phân vị chứ không phải số liệu cần kiểm chứng
const QUANTILE = /\b(?:fastest|slowest|quickest|top|bottom|lowest|highest|best|worst)\s+\d+(?:\.\d+)?\s*%|\d+(?:\.\d+)?\s*%\s+(?:fastest|slowest|quickest|lowest|highest|best|worst)/gi;

export function extractPercents(text: string): number[] {
  return [...text.replace(QUANTILE, " ").matchAll(PERCENT)].map((m) => parseFloat(m[1])).filter(Number.isFinite);
}

interface Numbers {
  /** Mọi số xuất hiện trong dữ liệu tool. */
  base: number[];
  /** Tổng các dòng liền kề của mỗi bảng (khớp "tổng ngày thường", "top 3"...). */
  sums: number[];
  /** Nhóm số được phép cộng/trừ với nhau: cùng một đối tượng (và con trực tiếp), hoặc các trường cấp trên cùng của các tool (vd tổng của hai lần gọi). */
  groups: number[][];
  /** Nhóm số được phép lấy tỉ lệ phần trăm: chỉ cùng một đối tượng, không trộn chéo giữa các tool. */
  pctGroups: number[][];
  /** Các số ở cấp trên cùng của dữ liệu tool (tổng, số lượng...). */
  tops: number[];
}

const MAX_GROUP = 12;

const numericProps = (o: Record<string, unknown>) =>
  Object.values(o).filter((x): x is number => typeof x === "number" && Number.isFinite(x)).map(Math.abs);

/** Gom số từ dữ liệu tool. Chỉ cho phép tính giữa các số "gần nhau" để không thể suy ra bừa bãi một con số bịa. */
export function collectNumbers(facts: unknown[]): Numbers {
  const base = new Set<number>();
  const sums = new Set<number>();
  const groups: number[][] = [];
  const pctGroups: number[][] = [];
  const walk = (v: unknown, depth: number) => {
    if (depth > 8) return;
    if (typeof v === "number") {
      if (Number.isFinite(v)) base.add(Math.abs(v));
    } else if (Array.isArray(v)) {
      if (v.length <= 60) {
        const keys = new Set<string>();
        for (const row of v) if (row && typeof row === "object") for (const [k, x] of Object.entries(row)) if (typeof x === "number") keys.add(k);
        for (const key of keys) {
          const vals = v.map((r) => (r && typeof r === "object" && typeof (r as Record<string, unknown>)[key] === "number" ? Math.abs((r as Record<string, number>)[key]) : 0));
          for (let i = 0; i < vals.length; i++) {
            let run = 0;
            for (let j = i; j < vals.length; j++) {
              run += vals[j];
              if (j > i) sums.add(run);
            }
          }
        }
      }
      for (const x of v) walk(x, depth + 1);
    } else if (v && typeof v === "object") {
      const o = v as Record<string, unknown>;
      const family = [...numericProps(o)];
      for (const child of Object.values(o)) if (child && typeof child === "object" && !Array.isArray(child)) family.push(...numericProps(child as Record<string, unknown>));
      // Nhóm nhỏ thôi: nhóm lớn có hàng nghìn cặp nên gần như số nào cũng "suy ra được", làm hỏng ý nghĩa của việc kiểm chứng
      if (family.length > 1 && family.length <= MAX_GROUP) {
        groups.push(family);
        pctGroups.push(family);
      }
      for (const x of Object.values(o)) walk(x, depth + 1);
    }
  };
  for (const f of facts) walk(f, 0);
  // Cấp trên cùng của các tool khác nhau (vd tổng của hai lần gọi query_spending)
  const tops = facts.flatMap((f) => (f && typeof f === "object" && !Array.isArray(f) ? numericProps(f as Record<string, unknown>) : []));
  if (tops.length > 1 && tops.length <= MAX_GROUP) groups.push(tops);
  return { base: [...base], sums: [...sums], groups, pctGroups, tops };
}

const tol = (b: number) => Math.max(1, Math.abs(b) * 0.005);
const near = (x: number, b: number) => Math.abs(x - b) <= tol(b);

function moneySupported(x: number, n: Numbers): boolean {
  if (x < 1) return true; // 0 € và các số dưới 1 € không đáng kiểm
  if (n.base.some((b) => near(x, b)) || n.sums.some((b) => near(x, b))) return true;
  if (n.base.some((b) => near(x, b * 12) || near(x, b / 12) || near(x, (b * 52) / 12))) return true;
  for (const g of n.groups) {
    for (let i = 0; i < g.length; i++) {
      for (let j = i + 1; j < g.length; j++) {
        if (near(x, g[i] + g[j]) || near(x, Math.abs(g[i] - g[j]))) return true;
      }
    }
  }
  return false;
}

function percentSupported(p: number, n: Numbers): boolean {
  const close = (a: number) => Math.abs(a - p) <= 0.6;
  if (n.base.some(close) || n.base.some((b) => close(b * 100))) return true;
  for (const g of n.pctGroups) {
    for (const a of g) {
      for (const b of g) {
        if (b === 0 || a === b) continue;
        if (close((a / b) * 100) || close(Math.abs(((a - b) / b) * 100))) return true;
      }
    }
  }
  return false;
}

/** `context` = các đoạn chữ mà con số được phép lấy từ đó (câu hỏi và lịch sử hội thoại). */
export function verifyAnswer(answer: string, facts: unknown[], context: string[] = []): Verdict {
  const n = collectNumbers(facts);
  for (const c of context) for (const v of [...extractAmounts(c), ...extractPercents(c)]) n.base.push(v);
  // Số do người dùng gõ thường không có ký hiệu €: "250000 euro", "5000"
  for (const c of context) for (const m of c.matchAll(/\d[\d,]*(?:\.\d+)?/g)) n.base.push(parseAmount(m[0]));

  // So sánh với lời đáp trước ("ít hơn 589,33 € của tháng trước"): cho phép cộng/trừ giữa số trong hội thoại và số cấp trên cùng của tool
  const spoken = context.flatMap((c) => extractAmounts(c));
  const mixed = [...new Set([...spoken, ...n.tops])];
  if (spoken.length && mixed.length > 1 && mixed.length <= MAX_GROUP) n.groups.push(mixed);

  const unverified: string[] = [];
  const amounts = extractAmounts(answer);
  const percents = extractPercents(answer);
  for (const x of amounts) if (!moneySupported(x, n)) unverified.push(`${x} €`);
  for (const p of percents) if (!percentSupported(p, n)) unverified.push(`${p}%`);
  return { ok: unverified.length === 0, unverified, checked: amounts.length + percents.length };
}
