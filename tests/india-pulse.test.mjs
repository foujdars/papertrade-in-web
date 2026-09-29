import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { fiiDii, indexBreadth, indiaVix, nseBreadth } from "../lib/india-pulse.ts";

test("NSE advance and decline come from the Moneycontrol bar", () => {
  const breadth = nseBreadth('<div class="advBar"><span style="width:43%;"></span></div><div class="bartxt"><span class="baradv">1,380</span><span class="bardecl">1870</span></div>');
  assert.deepEqual(breadth, { advance: 1380, decline: 1870 });
  assert.equal(nseBreadth("<span class=\"baradv\">1</span>"), null);
});

test("India VIX, index breadth and FII/DII cash keep their signs", () => {
  assert.deepEqual(indiaVix({ data: { pricecurrent: "13.41", pricechange: "-0.23", pricepercentchange: "-1.69", "52wklow": "9.10", "52wkhi": "22.40" } }), { price: 13.41, change: -0.23, changePercent: -1.69, low: 9.1, high: 22.4 });
  assert.deepEqual(indexBreadth({ props: { pageProps: { adRatioData: { indexList: [{ indexName: "NIFTY 50", advance: 17, decline: 32 }, { indexName: "", advance: 1, decline: 1 }] } } } }), [{ name: "NIFTY 50", advance: 17, decline: 32 }]);
  assert.deepEqual(fiiDii({ props: { pageProps: { FiiDiiData: { fiiDiiData: [{ date: "2026-09-28", fDate: "Mon 28 Sep", fiiCM: "-5,353.22", diiCM: "5,189.02" }] } } } }), [{ date: "2026-09-28", label: "Mon 28 Sep", fii: -5353.22, dii: 5189.02 }]);
});

test("the pulse route reads Moneycontrol breadth, VIX and FII/DII", async () => {
  const route = await readFile(new URL("../app/api/market/india-pulse/route.ts", import.meta.url), "utf8");
  const home = await readFile(new URL("../components/HomeWorkspace.tsx", import.meta.url), "utf8");
  assert.match(route, /pricefeed\/notapplicable\/inidicesindia\/in%3BIDXN/);
  assert.match(route, /fii_dii_activity\/homebody\.php/);
  assert.match(route, /heat-map-advance-decline-ratio-nse-bse/);
  assert.match(home, /activeMarket === "india" \? <IndiaPulse \/>/);
});
