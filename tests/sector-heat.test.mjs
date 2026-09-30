import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { heatLevel, sectorChartUrl, sectorQuote, SECTORS } from "../lib/sector-heat.ts";
import { watchIndex } from "../lib/equity-watch.ts";

test("sector change uses the session percent, not the start of a 5-day chart", () => {
  const quote = sectorQuote({ chart: { result: [{ meta: { regularMarketPrice: 54692.15, regularMarketChangePercent: 0.796, chartPreviousClose: 55438.5 } }] } });
  assert.equal(quote.price, 54692.15);
  assert.equal(quote.change, 0.796);
  assert.equal(sectorQuote({ chart: { result: [{ meta: { regularMarketPrice: 100, chartPreviousClose: 90 } }] } }), null);
  assert.equal(sectorQuote(null), null);
});

test("heat colours follow the size of the move", () => {
  assert.equal(heatLevel(1.5), 3);
  assert.equal(heatLevel(0.6), 2);
  assert.equal(heatLevel(0.1), 1);
  assert.equal(heatLevel(0), 0);
  assert.equal(heatLevel(-0.1), -1);
  assert.equal(heatLevel(-0.6), -2);
  assert.equal(heatLevel(-1.5), -3);
});

test("sector tiles point at real NSE indices and matching watch lists", () => {
  assert.equal(sectorChartUrl("^NSEBANK").includes("query1.finance.yahoo.com"), true);
  assert.equal(sectorChartUrl("^NSEBANK").includes("%5ENSEBANK"), true);
  const bank = SECTORS.find(sector => sector.id === "bank");
  assert.equal(bank.chart, "BANKNIFTY");
  assert.equal(watchIndex(bank.watch).symbol, "NSE:BANKNIFTY");
  for (const sector of SECTORS) {
    if ("watch" in sector) assert.equal(watchIndex(sector.watch).id, sector.watch);
    assert.equal(sector.symbol.startsWith("^"), true);
  }
});

test("home renders the sector heat map", async () => {
  const [home, route, view] = await Promise.all([
    readFile(new URL("../components/HomeWorkspace.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/market/sector-heat/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../components/SectorHeat.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(home, /<SectorHeat /);
  assert.match(route, /sectorChartUrl/);
  assert.match(view, /Sector heat map/);
  assert.doesNotMatch(view, /Sample sector/);
});
