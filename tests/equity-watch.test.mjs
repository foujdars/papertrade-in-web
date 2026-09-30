import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { quotesFromWatch, sortWatch, volumeLabel, watchIndex, watchScan } from "../lib/equity-watch.ts";

const payload = { data: [
  { s: "NSE:SBIN", d: ["SBIN", 800, 1.5, 790, 810, 788, 2500000, "State Bank of India"] },
  { s: "NSE:INFY", d: ["INFY", 1500, -0.4, 1510, 1520, 1490, 900000, "Infosys Limited"] },
  { s: "NSE:BAJAJ_AUTO", d: ["BAJAJ_AUTO", 10940, 1.2, 10800, 11000, 10750, 120000, "Bajaj Auto Limited"] },
  { s: "BSE:SBIN", d: ["SBIN", 1, 1, 1, 1, 1, 1, "Skip"] },
] };

test("equity watch keeps NSE constituents with price, range and volume", () => {
  const rows = quotesFromWatch(payload);
  assert.equal(rows.length, 3);
  assert.equal(rows[0].symbol, "SBIN");
  assert.equal(rows[2].symbol, "BAJAJ_AUTO");
  assert.equal(rows[0].name, "State Bank of India");
  assert.equal(rows[0].high, 810);
  assert.equal(rows[0].low, 788);
  assert.equal(rows[1].symbol, "INFY");
});

test("the watch sorts by percent, name or volume without inventing rows", () => {
  const rows = quotesFromWatch(payload);
  assert.deepEqual(sortWatch(rows, "change").map(row => row.symbol), ["SBIN", "BAJAJ_AUTO", "INFY"]);
  assert.deepEqual(sortWatch(rows, "name").map(row => row.symbol), ["BAJAJ_AUTO", "INFY", "SBIN"]);
  assert.deepEqual(sortWatch(rows, "volume").map(row => row.symbol), ["SBIN", "INFY", "BAJAJ_AUTO"]);
  assert.equal(volumeLabel(2500000), "25 L");
  assert.equal(volumeLabel(150000000), "15 Cr");
  assert.equal(volumeLabel(0), "—");
});

test("each index asks for that NSE basket", () => {
  assert.equal(watchIndex("bank").symbol, "NSE:BANKNIFTY");
  assert.equal(watchIndex("nope").id, "nifty50");
  assert.deepEqual(watchScan("NSE:NIFTY").symbols.groups, [{ type: "index", values: ["NSE:NIFTY"] }]);
  assert.equal(watchScan("NSE:CNXIT").filter[0].right, "NSE");
  assert.equal(watchScan("NSE:NIFTY").range[1] >= 100, true);
});

test("home renders the equity market watch", async () => {
  const [home, route, view, lib] = await Promise.all([
    readFile(new URL("../components/HomeWorkspace.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/market/equity-watch/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../components/EquityWatch.tsx", import.meta.url), "utf8"),
    readFile(new URL("../lib/equity-watch.ts", import.meta.url), "utf8"),
  ]);
  assert.match(home, /activeMarket === "india" && <EquityWatch onOpen=\{onOpenStock\} \/>/);
  assert.match(route, /scanner\.tradingview\.com\/india\/scan/);
  assert.match(view, /Equity market watch/);
  assert.match(lib, /Nifty 50/);
  assert.match(lib, /NSE:BANKNIFTY/);
  assert.doesNotMatch(view, /Sample stock/);
});
