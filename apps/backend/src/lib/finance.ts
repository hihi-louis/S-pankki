/** Trả góp đều hằng tháng (annuity) cho khoản vay `principal`, lãi suất năm `annualRate` (0.0317 = 3,17%), `years` năm. */
export function annuityPayment(principal: number, annualRate: number, years: number): number {
  const n = years * 12;
  const i = annualRate / 12;
  if (i === 0) return principal / n;
  return (principal * i) / (1 - Math.pow(1 + i, -n));
}

export const eur0 = (n: number) => `€${Math.round(n).toLocaleString("en-IE")}`;
export const pct1 = (x: number) => `${(x * 100).toFixed(1)}%`;
