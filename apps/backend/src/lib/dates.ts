/** "Hôm nay" cố định theo dữ liệu (giao dịch cuối cùng là 2026-09-29). */
export const TODAY = "2026-09-30";

const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Ngày đầu tháng, lệch `offset` tháng so với TODAY (0 = tháng này, -1 = tháng trước). */
export function monthStart(offset = 0): string {
  const d = new Date(`${TODAY.slice(0, 7)}-01T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + offset);
  return iso(d);
}

/** Khoảng [from, to) của một tháng, lệch `offset` tháng so với TODAY. */
export function monthRange(offset: number) {
  return { from: monthStart(offset), to: monthStart(offset + 1) };
}

/** `n` tháng gần nhất trước tháng hiện tại, từ cũ đến mới (không gồm tháng này). */
export function lastNMonths(n: number): string[] {
  return Array.from({ length: n }, (_, i) => monthStart(i - n));
}

/** Ngày nhận lương kế tiếp (sau TODAY) khi lương về vào ngày `dom` của tháng; ngày bị kẹp theo độ dài tháng. */
export function nextPayday(dom: number): string {
  for (const offset of [0, 1]) {
    const start = new Date(`${monthStart(offset)}T00:00:00Z`);
    const daysInMonth = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0)).getUTCDate();
    const candidate = iso(new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), Math.min(dom, daysInMonth))));
    if (candidate > TODAY) return candidate;
  }
  throw new Error("unreachable");
}
