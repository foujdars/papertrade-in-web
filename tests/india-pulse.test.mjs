import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { appendAdTape, fiiDii, flowsInRange, historyFlows, indexBreadth, indiaVix, istStamp, mergeFlows, niftyCloses, nseBreadth, putCallRatio, selectAdTape, vixBand, withNifty, FLOW_WINDOWS } from "../lib/india-pulse.ts";

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

test("VIX bands are explicit indicators and invalid index closes never draw a false plunge", () => {
  assert.deepEqual([14.99, 15, 20, 30].map(value => vixBand(value).label), ["Calm", "Watch", "Elevated", "High"]);
  assert.equal(vixBand(13.41).position < 25, true);
  assert.deepEqual(niftyCloses({ chart: { result: [{ timestamp: [1790601600, 1790688000, 1790774400], indicators: { quote: [{ close: [24600, null, 0] }] } }] } }), [{ date: "2026-09-28", close: 24600 }]);
});

test("the session tape records live NSE counts and does not invent a path", () => {
  const open = istStamp("2026-09-29", 10, 0);
  const nextMinute = istStamp("2026-09-29", 10, 1);
  const first = appendAdTape([], { advance: 700, decline: 1600 }, open);
  const second = appendAdTape(first, { advance: 710, decline: 1590 }, nextMinute);
  const sameMinute = appendAdTape(second, { advance: 720, decline: 1580 }, nextMinute + 20_000);
  assert.equal(first.length, 1);
  assert.equal(second.length, 2);
  assert.equal(sameMinute.length, 2);
  assert.equal(sameMinute[1].advance, 720);
  assert.equal(appendAdTape(sameMinute, { advance: 1, decline: 1 }, istStamp("2026-09-29", 16, 0)).length, 2);
  assert.equal(appendAdTape([], { advance: 1380, decline: 1870 }, istStamp("2026-09-27", 11, 0)).length, 0);
  assert.equal(appendAdTape([], { advance: 1380, decline: 1870 }, istStamp("2026-10-02", 11, 0)).length, 0);
  assert.equal(appendAdTape(sameMinute, null, open), sameMinute);
});

test("after the close the full session stays up until the next 9:15 tape forms", () => {
  const tuesday = [{ t: istStamp("2026-09-29", 15, 30), advance: 1380, decline: 1870 }];
  assert.equal(selectAdTape(tuesday, [], istStamp("2026-09-29", 18, 0)).length, 1);
  assert.equal(selectAdTape([], tuesday, istStamp("2026-09-30", 8, 30))[0].advance, 1380);
  assert.deepEqual(selectAdTape([], tuesday, istStamp("2026-09-30", 9, 15)), []);
  const wednesday = [{ t: istStamp("2026-09-30", 9, 16), advance: 400, decline: 200 }];
  assert.equal(selectAdTape(wednesday, tuesday, istStamp("2026-09-30", 9, 16))[0].advance, 400);
});

test("PCR sums nearest-expiry put and call open interest and does not invent missing values", () => {
  assert.deepEqual(putCallRatio([{ put_options: { market_data: { oi: 120 } }, call_options: { market_data: { oi: 80 } } }, { put_options: { market_data: { oi: 60 } }, call_options: { market_data: { oi: 40 } } }], "2026-10-01", "2026-09-29T10:00:00Z"), { value: 1.5, putOi: 180, callOi: 120, expiry: "2026-10-01", asOf: "2026-09-29T10:00:00Z" });
  assert.equal(putCallRatio([{ put_options: { market_data: { oi: 100 } } }], "2026-10-01", "now"), null);
  assert.equal(FLOW_WINDOWS.some(item => item.id === "1D"), false);
});

test("FII and DII ranges keep six months and one year", () => {
  const history = historyFlows([{ date: "29-Sep-2026", fii_net: "-9980.22", dii_net: "6952.71" }, { date: "14-Jan-2026", fii_net: "-6440", dii_net: "7353" }]);
  const merged = mergeFlows([{ date: "2026-09-29", label: "Tue 29 Sep", fii: -9980, dii: 6953 }], history);
  assert.equal(merged[0].date, "2026-09-29");
  assert.equal(merged.at(-1).date, "2026-01-14");
  const withIndex = withNifty(merged, [{ date: "2026-09-28", close: 24600 }, { date: "2026-09-29", close: 24720 }]);
  assert.equal(withIndex[0].nifty, 24720);
  assert.equal(Math.round(withIndex[0].niftyChange), 120);
  assert.equal(flowsInRange(withIndex, 1).length, 1);
  assert.equal(flowsInRange(withIndex, 372).length, 2);
});

test("the pulse route reads Moneycontrol breadth, VIX and FII/DII", async () => {
  const route = await readFile(new URL("../app/api/market/india-pulse/route.ts", import.meta.url), "utf8");
  const home = await readFile(new URL("../components/HomeWorkspace.tsx", import.meta.url), "utf8");
  const pulse = await readFile(new URL("../components/IndiaPulse.tsx", import.meta.url), "utf8");
  const dispatch = await readFile(new URL("../app/api/technical-alerts/dispatch/route.ts", import.meta.url), "utf8");
  assert.match(route, /pricefeed\/notapplicable\/inidicesindia\/in%3BIDXN/);
  assert.match(route, /fii_dii_activity\/homebody\.php/);
  assert.match(route, /recordNseAdTape/);
  assert.doesNotMatch(route, /heat-map-advance-decline-ratio-nse-bse/);
  assert.match(home, /activeMarket === "india" \? <IndiaPulse \/>/);
  assert.match(pulse, /NSE advances and declines through the session/);
  assert.doesNotMatch(pulse, /Major indices/);
  assert.match(dispatch, /sampleNseAdTape/);
  assert.match(dispatch, /dispatchEma5ReversalAlerts/);
});
