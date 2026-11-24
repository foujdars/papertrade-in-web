import test from "node:test";
import assert from "node:assert/strict";
import { comparisonRequest } from "../lib/chart-compare.ts";
import { referenceCandles, referenceHistoryPlan } from "../lib/global-reference-data.ts";
import { globalReferenceInstrument } from "../lib/global-reference.ts";
import { deltaSymbolFromInstrumentKey, isGlobalInstrumentKey } from "../lib/global-markets.ts";
import { compareMarketInstruments, marketGroup } from "../lib/market-directory.ts";

const now = Date.parse("2026-10-06T15:00:00Z") / 1000;
const time = now - 300;
const plan = referenceHistoryPlan("5m", new URLSearchParams(), now);
const alpacaBar = { t: new Date(time * 1000).toISOString(), o: 101, h: 104, l: 100, c: 103, v: 20 };
const twelveBar = { datetime: "2026-10-06 14:55:00", open: "101", high: "104", low: "100", close: "103", volume: "20" };

function withEnv(t, values) {
  for (const [key, value] of Object.entries(values)) {
    const previous = process.env[key];
    process.env[key] = value;
    t.after(() => {
      if (previous === undefined) delete process.env[key];
      else process.env[key] = previous;
    });
  }
}

test("real US listings are discovered before the separate Delta derivatives", () => {
  const listing = globalReferenceInstrument("AAPL");
  const contract = { ...listing, symbol: "AAPLXUSD", instrumentKey: "DELTA|AAPLXUSD", assetType: "FUTURE" };
  assert.equal(marketGroup(listing), "us");
  assert.ok(compareMarketInstruments(listing, contract) < 0);
  assert.equal(isGlobalInstrumentKey(listing.instrumentKey), true);
  assert.equal(deltaSymbolFromInstrumentKey(listing.instrumentKey), null);
  assert.equal(deltaSymbolFromInstrumentKey(contract.instrumentKey), "AAPLXUSD");
  assert.match(comparisonRequest(listing.instrumentKey, "5m"), /^\/api\/global-reference\?symbol=AAPL/);
  assert.throws(() => referenceHistoryPlan("toString", new URLSearchParams(), now), /Unsupported timeframe/);
});

test("US share candles fall back to Twelve Data if Alpaca is unavailable", async (t) => {
  withEnv(t, { ALPACA_DATA_KEY_ID: "key", ALPACA_DATA_SECRET_KEY: "secret", TWELVE_DATA_API_KEY: "twelve" });
  const requests = t.mock.method(globalThis, "fetch", async (url, options) => {
    if (url.hostname === "data.alpaca.markets") {
      assert.match(url.pathname, /\/stocks\/AAPL\/bars$/);
      assert.equal(url.searchParams.get("feed"), "iex");
      assert.equal(options.headers["APCA-API-SECRET-KEY"], "secret");
      return Response.json({ bars: [alpacaBar] }, { status: 503 });
    }
    assert.equal(url.hostname, "api.twelvedata.com");
    assert.equal(url.searchParams.get("symbol"), "AAPL");
    return Response.json({ meta: { currency: "USD" }, values: [twelveBar] });
  });
  const result = await referenceCandles("AAPL", "5m", plan, now);
  assert.equal(requests.mock.callCount(), 2);
  assert.equal(result.source, "Twelve Data");
  assert.deepEqual(result.candles, [{ time, open: 101, high: 104, low: 100, close: 103, volume: 20 }]);
});

test("spot crypto falls back to Kraken USD and filters invalid candles", async (t) => {
  t.mock.method(globalThis, "fetch", async (url) => {
    if (url.hostname === "api.exchange.coinbase.com") {
      assert.match(url.pathname, /\/BTC-USD\/candles$/);
      return new Response(null, { status: 429 });
    }
    assert.equal(url.hostname, "api.kraken.com");
    assert.equal(url.searchParams.get("pair"), "XBTUSD");
    return Response.json({ error: [], result: { XXBTZUSD: [
      [time - 300, "101", "103", "104", "102", "102", "1"],
      [time, "101", "104", "100", "103", "102", "1"],
    ], last: time } });
  });
  const result = await referenceCandles("BTC-USD", "5m", plan, now);
  assert.equal(result.source, "Kraken");
  assert.equal(result.candles.length, 1);
  assert.equal(result.candles[0].time, time);
});

test("spot gold falls back to OANDA XAU_USD midpoint, with no exchange volume", async (t) => {
  withEnv(t, { TWELVE_DATA_API_KEY: "twelve", OANDA_DATA_TOKEN: "oanda" });
  t.mock.method(globalThis, "fetch", async (url) => {
    if (url.hostname === "api.twelvedata.com") {
      assert.equal(url.searchParams.get("symbol"), "XAU/USD");
      return Response.json({ status: "error" });
    }
    assert.equal(url.pathname, "/v3/instruments/XAU_USD/candles");
    assert.equal(url.searchParams.get("price"), "M");
    return Response.json({ candles: [{ time: alpacaBar.t, mid: { o: "101", h: "104", l: "100", c: "103" }, volume: 9 }] });
  });
  const result = await referenceCandles("XAUUSD", "5m", plan, now);
  assert.equal(result.source, "OANDA · midpoint");
  assert.equal(result.candles[0].volume, 0);
  await assert.rejects(referenceCandles("XAUTUSD", "5m", plan, now), /Unsupported reference instrument/);
});
