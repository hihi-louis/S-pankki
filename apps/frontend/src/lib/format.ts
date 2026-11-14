const eurFmt = new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR" });
const eurRound = new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

/** €1,234.56 — always positive; callers decide the wording ("spent", "+"). */
export const eur = (n: number) => eurFmt.format(Math.abs(n));
export const eur0 = (n: number) => eurRound.format(Math.abs(n));

export const shortDate = (iso: string) =>
  new Date(iso + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" });

export const monthName = (yyyyMm: string) =>
  new Date(yyyyMm + "-01T00:00:00").toLocaleDateString("en-GB", { month: "long" });

const MCC: Record<string, string> = {
  "4121": "Taxi", "4111": "Public transport", "5541": "Fuel", "5542": "Fuel", "7523": "Parking",
  "5411": "Supermarket", "5499": "Food shop", "5422": "Butcher", "5451": "Dairy shop",
  "5812": "Restaurant", "5813": "Bar", "5814": "Fast food & café",
  "7832": "Cinema", "7922": "Tickets & shows", "7999": "Recreation", "7991": "Attractions", "7996": "Amusement park",
  "5912": "Pharmacy", "8011": "Doctor", "8021": "Dentist", "8099": "Health service",
  "5200": "Home supplies", "5732": "Electronics", "5251": "Hardware", "5712": "Furniture", "5734": "Software",
  "5941": "Sports", "5651": "Clothing", "5691": "Clothing", "5942": "Books", "5945": "Toys & games", "5999": "Shopping",
  "4722": "Travel agency", "4511": "Flights", "7011": "Hotel", "7512": "Car rental",
};

/** Human label for a transaction. Blank merchant/MCC means a transfer. */
export function txLabel(tx: { category: string; mcc?: string | null; merchantId?: string | null }) {
  if (tx.mcc && MCC[tx.mcc]) return MCC[tx.mcc];
  if (!tx.merchantId || tx.merchantId === ".") return `${tx.category} (transfer)`;
  return tx.category;
}

/** "+12%", "-30%", or "x7" for very large rises (a 6,000% jump reads better as a multiple). */
export function diffLabel(diffPct: number | null): string {
  if (diffPct === null) return "new";
  if (diffPct >= 500) return `x${Math.round(1 + diffPct / 100)}`;
  return `${diffPct >= 0 ? "+" : "-"}${Math.abs(diffPct)}%`;
}

export const BASKET_EMOJI: Record<number, string> = { 1: "🏠", 2: "🔧", 3: "☕" };
export const BASKET_HINT: Record<number, string> = {
  1: "Rent, bills and food. Money that has to go out every month.",
  2: "Needed, but you can't plan when: a doctor, a broken laptop.",
  3: "Small choices that quietly add up: eating out, fun, shopping.",
};
