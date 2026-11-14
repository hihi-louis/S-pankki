/**
 * Fetches prices per m² of old dwellings from Statistics Finland (tables 13mx by municipality, 13mu by postal code)
 * and saves a snapshot to src/data/housing-prices.json so the demo does not depend on the network.
 * Run: npm run data:prices
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const BASE = "https://pxdata.stat.fi/PxWeb/api/v1/en/StatFin/ashi";
const out = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../src/data/housing-prices.json");

type Dim = { category: { index: Record<string, number>; label: Record<string, string> } };
interface Jsonstat { value: (number | null)[]; id: string[]; size: number[]; updated?: string; dimension: Record<string, Dim> }

async function query(table: string, year: string, dims: Record<string, string[] | "*">): Promise<Jsonstat> {
  const res = await fetch(`${BASE}/${table}.px`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query: [
        { code: "timeperiod_y", selection: { filter: "item", values: [year] } },
        ...Object.entries(dims).map(([code, v]) => ({ code, selection: v === "*" ? { filter: "all", values: ["*"] } : { filter: "item", values: v } })),
      ],
      response: { format: "json-stat2" },
    }),
  });
  if (!res.ok) throw new Error(`${table}: ${res.status} ${await res.text()}`);
  return (await res.json()) as Jsonstat;
}

/** Reads one cell by category keys, whatever the dimension order is. */
function cell(j: Jsonstat, keys: Record<string, string>): number | null {
  let pos = 0;
  j.id.forEach((dim, i) => {
    const k = dim === "timeperiod_y" ? Object.keys(j.dimension[dim].category.index)[0] : keys[dim];
    pos = pos * j.size[i] + j.dimension[dim].category.index[k];
  });
  return j.value[pos] ?? null;
}

const YEAR = "2025";
const PRICE = "keskihinta_aritm_nw";
const COUNT = "lkm_julk20";

// Municipalities: all building types, flats, terraced
const mx = await query("13mx", YEAR, { kunta_1_20150101: "*", talotyyppi_5_20111209: ["0", "1", "3"], contentscode: [PRICE, COUNT] });
const municipalities: Record<string, { name: string; all: number | null; flats: number | null; terraced: number | null; sales: number | null }> = {};
const kLab = mx.dimension.kunta_1_20150101.category.label;
for (const code of Object.keys(kLab)) {
  const g = (t: string, c: string) => cell(mx, { kunta_1_20150101: code, talotyyppi_5_20111209: t, contentscode: c });
  const all = g("0", PRICE);
  if (all === null) continue;
  municipalities[code] = { name: kLab[code], all, flats: g("3", PRICE), terraced: g("1", PRICE), sales: g("0", COUNT) };
}

// Postal codes: flats (1, 2, 3+ rooms), terraced houses
const mu = await query("13mu", YEAR, { postinumeroalue_4_20220101: "*", talotyyppi_6_20131021: ["1", "2", "3", "5"], contentscode: [PRICE, COUNT] });
const postal: Record<string, { name: string; municipality: string; flats1: number | null; flats2: number | null; flats3: number | null; terraced: number | null; sales: number | null }> = {};
const pLab = mu.dimension.postinumeroalue_4_20220101.category.label;
for (const code of Object.keys(pLab)) {
  const g = (t: string, c: string) => cell(mu, { postinumeroalue_4_20220101: code, talotyyppi_6_20131021: t, contentscode: c });
  const f1 = g("1", PRICE), f2 = g("2", PRICE), f3 = g("3", PRICE), te = g("5", PRICE);
  if ([f1, f2, f3, te].every((v) => v === null)) continue;
  const label = pLab[code].replace(/^\d{5}\s+/, ""); // "Punavuori - Bulevardi (Helsinki)"
  const m = label.match(/^(.*) \(([^)]+)\)$/);
  const sales = [1, 2, 3, 5].map((t) => g(String(t), COUNT)).reduce<number>((a, v) => a + (v ?? 0), 0);
  postal[code] = { name: m ? m[1] : label, municipality: m ? m[2] : "", flats1: f1, flats2: f2, flats3: f3, terraced: te, sales };
}

fs.writeFileSync(
  out,
  JSON.stringify(
    {
      source: "Statistics Finland, Prices of old dwellings in housing companies (asset transfer tax data)",
      tables: ["StatFin/ashi/13mx.px (municipality)", "StatFin/ashi/13mu.px (postal code)"],
      url: "https://pxdata.stat.fi/PxWeb/api/v1/en/StatFin/ashi/",
      year: YEAR,
      unit: "EUR per m², average price (not median), old dwellings in housing companies. Missing = too few sales to publish.",
      updated: mx.updated ?? null,
      fetchedAt: new Date().toISOString().slice(0, 10),
      municipalities,
      postal,
    },
    null,
    1,
  ) + "\n",
);
console.log(`Wrote ${out}: ${Object.keys(municipalities).length} municipalities, ${Object.keys(postal).length} postal codes`);
