import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { moverScan, presentMovers, priceBand, quotesFromScan, volumeMetrics } from "../lib/market-movers.ts";

const row = (patch) => ({
  symbol: "TEST",
  name: "Test Ltd",
  price: 110,
  change: 10,
  changeAbs: 10,
  volume: 1000,
  relativeVolume: 3,
  weekHigh: 110,
  weekLow: 40,
  high: 110,
  low: 100,
  tradedValue: 2.5e9,
  ...patch,
});

test("scan rows keep NSE equities and their prices", () => {
  const quotes = quotesFromScan({ data: [
    { s: "NSE:RELIANCE", d: ["RELIANCE", 1400.5, 1.25, 17.3, 100, 1.2, 1500, 900, 1410, 1380, 5e9, "Reliance Industries"] },
    { s: "BSE:RELIANCE", d: ["RELIANCE", 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, "Skip"] },
    { s: "NSE:bad symbol", d: ["x", 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, "Skip"] },
  ] });
  assert.equal(quotes.length, 1);
  assert.equal(quotes[0].symbol, "RELIANCE");
  assert.equal(quotes[0].name, "Reliance Industries");
  assert.equal(quotes[0].price, 1400.5);
});

test("price-band hits are the 2, 5, 10, 20 and 40 percent circuits, not an ordinary move", () => {
  assert.equal(priceBand(row({ price: 110, changeAbs: 10, high: 110, low: 100 }), "upper"), 10);
  assert.equal(priceBand(row({ price: 105, changeAbs: 5, high: 105, change: 5 }), "upper"), 5);
  assert.equal(priceBand(row({ price: 95, change: -5, changeAbs: -5, high: 100, low: 95 }), "lower"), 5);
  assert.equal(priceBand(row({ price: 106, change: 6, changeAbs: 6, high: 106 }), "upper"), null);
  assert.equal(priceBand(row({ price: 108, change: 8, changeAbs: 8, high: 110 }), "upper"), 10);
});

test("each home list keeps its own note and does not invent a band", () => {
  const gained = presentMovers("gainers", [row({ symbol: "AAA", change: 4, changeAbs: 4, high: 104 })]);
  assert.equal(gained[0].note, null);
  assert.equal(gained[0].volume, 1000);
  assert.equal(volumeMetrics(gained[0]), "Vol 1,000 · ₹250 cr");
  assert.equal(gained[0].symbol, "AAA");
  const active = presentMovers("active", [row({ tradedValue: 3.09e10 })]);
  assert.equal(active[0].note, "₹3,090 cr");
  assert.equal(volumeMetrics(active[0]), "Vol 1,000 · ₹3,090 cr");
  const volume = presentMovers("volume", [row({ relativeVolume: 12.4 }), row({ symbol: "QUIET", relativeVolume: 1.1 })]);
  assert.deepEqual(volume.map(item => item.symbol), ["TEST"]);
  assert.equal(volume[0].note, "12× avg");
  const upper = presentMovers("upper", [row({ symbol: "BAND", price: 120, change: 20, changeAbs: 20, high: 120 }), row({ symbol: "PLAIN", price: 106, change: 6, changeAbs: 6, high: 106 })]);
  assert.deepEqual(upper.map(item => item.symbol), ["BAND"]);
  assert.equal(upper[0].note, "20% band");
});

test("the mover scans ask NSE for gainers, losers, activity, volume, 52-week and both bands", () => {
  assert.equal(moverScan("gainers").sort.sortOrder, "desc");
  assert.equal(moverScan("losers").sort.sortBy, "change");
  assert.equal(moverScan("active").sort.sortBy, "Value.Traded");
  assert.equal(moverScan("volume").sort.sortBy, "relative_volume_10d_calc");
  assert.equal(moverScan("high52").filter.at(-1).left, "price_52_week_high");
  assert.equal(moverScan("low52").filter.at(-1).left, "low");
  assert.equal(moverScan("upper").filter.at(-1).right, 1.7);
  assert.equal(moverScan("lower").sort.sortOrder, "asc");
  for (const tab of ["gainers", "losers", "active", "volume", "high52", "low52", "upper", "lower"]) {
    assert.equal(moverScan(tab).filter[0].right, "NSE");
  }
});

test("home renders the mover board from the NSE scan route", async () => {
  const [home, route, view, lib] = await Promise.all([
    readFile(new URL("../components/HomeWorkspace.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/market/movers/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../components/MarketMovers.tsx", import.meta.url), "utf8"),
    readFile(new URL("../lib/market-movers.ts", import.meta.url), "utf8"),
  ]);
  assert.match(home, /home-market-pair/);
  assert.match(home, /<MarketMovers onOpen=\{onOpenStock\} \/>/);
  assert.match(route, /scanner\.tradingview\.com\/india\/scan/);
  assert.match(view, /home-market-card/);
  assert.match(view, /StockLogo/);
  assert.match(view, /volumeMetrics/);
  assert.match(lib, /52W high/);
  assert.match(lib, /Upper band/);
  assert.match(lib, /Most active/);
  assert.match(lib, /Volume/);
  assert.doesNotMatch(view, /Sample stock/);
});
