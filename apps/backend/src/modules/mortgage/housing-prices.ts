import fs from "node:fs";
import { fileURLToPath } from "node:url";

/** Prices per m² of old dwellings from Statistics Finland (snapshot made by `npm run data:prices`). */
interface Muni { name: string; all: number | null; flats: number | null; terraced: number | null; sales: number | null }
interface Post { name: string; municipality: string; flats1: number | null; flats2: number | null; flats3: number | null; terraced: number | null; sales: number | null }
interface Snapshot { source: string; url: string; year: string; municipalities: Record<string, Muni>; postal: Record<string, Post> }

const data: Snapshot = JSON.parse(fs.readFileSync(fileURLToPath(new URL("../../data/housing-prices.json", import.meta.url)), "utf8"));

const plain = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
// Swedish and common spellings of the big cities
const ALIAS: Record<string, string> = { helsingfors: "helsinki", esbo: "espoo", vanda: "vantaa", abo: "turku", tammerfors: "tampere", uleaborg: "oulu" };

export type HomeType = "any" | "flat" | "terraced";
export const housingDataYear = data.year;
export const housingSource = { source: data.source, url: data.url, year: data.year };

const byName = new Map(Object.values(data.municipalities).map((m) => [plain(m.name), m]));

export interface PriceLookup {
  found: boolean;
  message?: string;
  areaLabel?: string;
  level?: "municipality" | "postal code";
  homeKind?: string;
  pricePerSqm?: number;
  salesCount?: number | null;
}

/** Finds the price per m² for a place: a 5-digit postal code, or a municipality name. */
export function lookupPrice(area: string, homeType: HomeType, sqm: number): PriceLookup {
  const a = area.trim();
  const code = a.match(/\b(\d{5})\b/)?.[1];
  if (code && data.postal[code]) {
    const p = data.postal[code];
    // Rooms follow from the size: up to 35 m² one room, up to 55 two rooms, otherwise three or more
    const rooms = sqm < 35 ? 1 : sqm < 55 ? 2 : 3;
    const price = homeType === "terraced" ? p.terraced : ([p.flats1, p.flats2, p.flats3][rooms - 1] ?? null);
    if (price !== null) {
      const kind = homeType === "terraced" ? "terraced houses" : `${rooms === 3 ? "three-room or larger" : rooms === 1 ? "one-room" : "two-room"} flats`;
      return { found: true, areaLabel: `${p.name} (${code}), ${p.municipality}`, level: "postal code", homeKind: kind, pricePerSqm: price, salesCount: p.sales };
    }
    return { found: false, message: `Statistics Finland has too few sales to publish a price for ${p.name} (${code}) for that home type. Try the city name instead.` };
  }
  const key = ALIAS[plain(a)] ?? plain(a);
  const m = byName.get(key) ?? [...byName.entries()].find(([k]) => k.startsWith(key) && key.length >= 3)?.[1];
  if (m) {
    const price = homeType === "flat" ? m.flats : homeType === "terraced" ? m.terraced : m.all;
    if (price !== null) {
      const kind = homeType === "flat" ? "flats" : homeType === "terraced" ? "terraced houses" : "all home types";
      return { found: true, areaLabel: m.name, level: "municipality", homeKind: kind, pricePerSqm: price, salesCount: m.sales };
    }
  }
  // A district name such as "Kallio" or "Kamppi"
  const post = Object.entries(data.postal).filter(([, p]) => plain(p.name).includes(key) && key.length >= 4);
  if (post.length > 0) {
    const [c, p] = post.sort((x, y) => (y[1].sales ?? 0) - (x[1].sales ?? 0))[0];
    return lookupPrice(c, homeType, sqm);
  }
  return { found: false, message: `No price found for "${area}". Use a Finnish city name (for example Helsinki, Espoo, Tampere) or a 5-digit postal code.` };
}
