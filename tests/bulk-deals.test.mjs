import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { dealValue, groupDeals, latestSession, presentDeals } from "../lib/bulk-deals.ts";

test("NSE bulk and block deals stay, and BSE rows do not", () => {
  const deals = presentDeals([
    { exch: "NSE", seg: "E", sym: "BSE", isin: "INE118H01025", csym: "BSE", cname: "UTI Mutual Fund", deal: "BULK", bs: "B", qty: 1000, avgprice: 3200, val: 32e7, date: "2026-09-30 00:00:00" },
    { exch: "NSE", seg: "E", sym: "HONASA", cname: "Peak XV", deal: "BLOCK", bs: "S", qty: 500, avgprice: 450, val: 9e7, date: "2026-09-30 00:00:00" },
    { exch: "NSE", seg: "E", sym: "BSE", isin: "INE118H01025", cname: "Goldman Sachs", deal: "BULK", bs: "S", qty: 100, avgprice: 3200, val: 5e7, date: "2026-09-30 00:00:00" },
    { exch: "BSE", seg: "E", sym: "BSE", deal: "BULK", bs: "S", qty: 10, avgprice: 10, val: 100, date: "2026-09-30 00:00:00" },
    { exch: "NSE", seg: "E", sym: "OLD", deal: "BULK", bs: "B", qty: 10, avgprice: 10, val: 1e7, date: "2026-09-29 00:00:00" },
  ]);
  assert.deepEqual(deals.map(deal => deal.symbol), ["BSE", "HONASA", "BSE", "OLD"]);
  assert.equal(deals[0].isin, "INE118H01025");
  assert.equal(deals[0].kind, "Bulk");
  assert.equal(deals[0].side, "Buy");
  assert.equal(deals[1].kind, "Block");
  assert.equal(deals[1].side, "Sell");
  const latest = latestSession(deals);
  assert.equal(latest.date, "2026-09-30");
  assert.deepEqual(groupDeals(latest.rows).map(group => group.symbol), ["BSE", "HONASA"]);
  assert.deepEqual(groupDeals(latest.rows)[0].rows.map(deal => deal.client), ["UTI Mutual Fund", "Goldman Sachs"]);
  assert.equal(dealValue(32e7), "₹32 cr");
});

test("home shows the bulk and block card from the deals route", async () => {
  const [home, view, route] = await Promise.all([
    readFile(new URL("../components/HomeWorkspace.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/BulkDeals.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/market/deals/route.ts", import.meta.url), "utf8"),
  ]);
  assert.match(home, /<BulkDeals onOpen=\{onOpenStock\} \/>/);
  assert.match(view, /home-market-card/);
  assert.match(view, /StockLogo/);
  assert.match(view, /groupDeals/);
  assert.match(route, /staticscanx\/deal/);
});
