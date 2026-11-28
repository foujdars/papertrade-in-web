import test from "node:test";
import assert from "node:assert/strict";
import { gzipSync } from "node:zlib";
import { build } from "esbuild";

const mcxUrl = "https://assets.upstox.com/market-quote/instruments/exchange/MCX.json.gz";
const dates = { expiry: "2034-02-17", expiryMs: Date.parse("2034-02-17T14:00:00+05:30") };
const products = [
  { symbol: "C-BTC-90000-170234", contract_type: "call_options", strike_price: "90000" },
  { symbol: "C-BTC-91000-170234", contract_type: "call_options", strike_price: "91000" },
  { symbol: "C-XAUT-4000-170234", contract_type: "call_options", strike_price: "4000" },
  { symbol: "P-XAUT-4000-170234", contract_type: "put_options", strike_price: "4000" },
].map(row => ({
  ...row, state: "live", trading_status: "operational", notional_type: "vanilla", is_quanto: false,
  contract_unit_currency: row.symbol.split("-")[1], contract_value: "0.001", tick_size: "0.1",
  settlement_time: "2034-02-17T12:00:00Z", quoting_asset: { symbol: "USD" }, settling_asset: { symbol: "USD" },
  maker_commission_rate: "0.0001", taker_commission_rate: "0.0002", product_specs: { premium_commission_rate: 0.035 },
}));

const nifty = "NSE_INDEX|Nifty 50";
const nseOption = { instrument_key: "NSE_FO|2", instrument_type: "CE", strike_price: 24000, expiry: dates.expiry, lot_size: 75 };
const nseMissingSpec = { instrument_key: "NSE_FO|3", market_data: { ltp: 40, bid_price: 38, bid_qty: 75, ask_price: 42, ask_qty: 75 } };

const goldFuture = { segment: "MCX_FO", instrument_type: "FUT", instrument_key: "MCX_FO|100", underlying_symbol: "GOLD", trading_symbol: "GOLD 05 APR 34", expiry: dates.expiryMs, qty_multiplier: 100, lot_size: 1 };
const goldOption = { ...goldFuture, instrument_key: "MCX_FO|101", instrument_type: "CE", strike_price: 160000, underlying_key: goldFuture.instrument_key };

test("spread feeds join verified contracts and quotes from NSE, Delta and MCX", async t => {
  const compiled = await build({
    stdin: { contents: `
      export * as delta from "./app/api/global-markets/route.ts";
      export * as commodities from "./app/api/upstox/commodities/route.ts";
      export * as nse from "./app/api/upstox/option-chain/route.ts";
      export * as client from "./lib/spread-chain-client.ts";
    `, resolveDir: process.cwd() },
    bundle: true, write: false, platform: "node", format: "esm",
    plugins: [{ name: "test-server-only", setup(api) {
      api.onResolve({ filter: /^server-only$/ }, () => ({ path: "server-only", namespace: "stub" }));
      api.onLoad({ filter: /.*/, namespace: "stub" }, () => ({ contents: "" }));
    } }],
  });
  const { delta, commodities, nse, client } = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString("base64")}`);
  t.mock.method(globalThis, "fetch", async input => {
    const url = new URL(input);
    if (url.href === mcxUrl) return new Response(gzipSync(JSON.stringify([goldFuture, goldOption])), { status: 200 });
    if (url.hostname === "api.india.delta.exchange" && url.pathname === "/v2/products") return Response.json({ success: true, result: products });
    if (url.hostname === "api.india.delta.exchange" && url.pathname === "/v2/tickers") {
      assert.equal(url.searchParams.get("expiry_date"), "17-02-2034");
      const root = url.searchParams.get("underlying_asset_symbols");
      assert.ok(root === "BTC" || root === "XAUT");
      return Response.json({ success: true, result: [{
        symbol: root === "BTC" ? products[0].symbol : products[2].symbol, close: "1200", spot_price: root === "BTC" ? "90500" : "4000",
        greeks: {delta: "0.51", theta: "-2.2", gamma: "0"}, oi_contracts: "0", mark_price: "1201",
        quotes: { best_bid: "1100", bid_size: "12", best_ask: "1300", ask_size: "0", mark_iv: "0.41" },
      }] });
    }
    if (url.hostname === "api.india.delta.exchange" && url.pathname === "/v2/products/C-XAUT-4000-170234") {
      return Response.json({ success: true, result: products[2] });
    }
    if (url.hostname === "api.india.delta.exchange" && url.pathname === "/v2/history/candles") {
      assert.equal(url.searchParams.get("symbol"), "C-XAUT-4000-170234");
      const time = Number(url.searchParams.get("end")) - 300;
      return Response.json({ success: true, result: [{ time, open: 70, high: 72, low: 69, close: 71, volume: 2 }] });
    }
    if (url.hostname === "api.upstox.com" && url.pathname === "/v2/market-quote/quotes") {
      assert.deepEqual(new Set(url.searchParams.get("instrument_key").split(",")), new Set([goldFuture.instrument_key, goldOption.instrument_key]));
      return Response.json({ status: "success", data: {
        future: { instrument_token: goldFuture.instrument_key, last_price: 159000 },
        option: { instrument_token: goldOption.instrument_key, last_price: 1250,
          depth: { buy: [{ price: 1200, quantity: 2 }], sell: [{ price: 1300, quantity: 3 }] } },
      } });
    }
    if (url.hostname === "api.upstox.com" && url.pathname === "/v2/option/contract") {
      assert.equal(url.searchParams.get("instrument_key"), nifty);
      return Response.json({ status: "success", data: [nseOption] });
    }
    if (url.hostname === "api.upstox.com" && url.pathname === "/v2/option/chain") {
      assert.equal(url.searchParams.get("expiry_date"), dates.expiry);
      return Response.json({ status: "success", data: [{
        expiry: dates.expiry, strike_price: 24000, underlying_spot_price: 24100,
        call_options: { ...nseMissingSpec, instrument_key: nseOption.instrument_key, option_greeks: { iv: 18.8, delta: 0 } }, put_options: nseMissingSpec,
      }] });
    }
    assert.fail(`Unexpected request to ${url}`);
  });
  const previousToken = process.env.UPSTOX_ACCESS_TOKEN;
  process.env.UPSTOX_ACCESS_TOKEN = "test-token";
  t.after(() => {
    if (previousToken === undefined) delete process.env.UPSTOX_ACCESS_TOKEN;
    else process.env.UPSTOX_ACCESS_TOKEN = previousToken;
  });

  const deltaReq = new Request("http://localhost/api/global-markets?mode=spread-chain&underlying=BTC");
  const directory = await (await delta.GET(deltaReq)).json();
  assert.equal(directory.series[0].expiry, dates.expiry);
  const deltaChain = await (await delta.GET(new Request(`${deltaReq.url}&series=${directory.series[0].id}`))).json();
  assert.equal(deltaChain.reference, 90500);
  assert.equal(deltaChain.contracts[0].multiplier, 0.001);
  assert.equal(deltaChain.contracts[0].ask, null);
  assert.equal(deltaChain.contracts[0].bid, 1100);
  assert.equal(deltaChain.contracts[0].iv, .41);
  assert.equal(deltaChain.contracts[0].oi, 0);
  assert.deepEqual(deltaChain.contracts[0].greeks, { delta:.51, theta:-2.2, gamma:0, vega:null });
  assert.equal(deltaChain.contracts[1].last, null);

  const roots = await (await delta.GET(new Request("http://localhost/api/global-markets?mode=token-option-roots"))).json();
  assert.deepEqual(roots.roots, ["XAUT"]);
  const tokenReq = new Request(deltaReq.url.replace("BTC", "XAUT"));
  const tokenDirectory = await (await delta.GET(tokenReq)).json();
  const tokenChain = await (await delta.GET(new Request(`${tokenReq.url}&series=${tokenDirectory.series[0].id}`))).json();
  assert.equal(tokenChain.reference, 4000);
  assert.deepEqual(tokenChain.contracts.map(leg => leg.kind), ["CE", "PE"]);
  const candles = await (await delta.GET(new Request("http://localhost/api/global-markets?mode=candles&symbol=C-XAUT-4000-170234&timeframe=5m"))).json();
  assert.equal(candles.ok, true);
  assert.ok(candles.candles.length > 0);

  const mcxReq = new Request("http://localhost/api/upstox/commodities?optionRoot=GOLD");
  const mcxDirectory = await (await commodities.GET(mcxReq)).json();
  assert.equal(mcxDirectory.series[0].expiry, dates.expiry);
  const mcxChainRequest = new Request(`${mcxReq.url}&series=${encodeURIComponent(mcxDirectory.series[0].id)}`);
  const mcxChain = await (await commodities.GET(mcxChainRequest)).json();
  assert.equal(mcxChain.reference, 159000);
  assert.equal(mcxChain.contracts[0].ask, 1300);
  assert.equal(mcxChain.contracts[0].multiplier, 100);
  assert.equal(mcxChain.future.id, goldFuture.instrument_key);
  assert.equal(mcxChain.future.last, 159000);
  assert.equal(mcxChain.future.ask, null);
  const nseParams = new URLSearchParams({ instrumentKey: nifty, expiry: dates.expiry });
  const nseChain = await (await nse.GET(new Request(`http://localhost/api/upstox/option-chain?${nseParams}`))).json();
  assert.equal(nseChain.rows[0].call.lotSizeVerified, true);
  const normalized = client.normalizeNseSpreadChain(nseChain.rows, dates.expiry);
  assert.equal(normalized.reference, 24100);
  assert.deepEqual(normalized.contracts.map(leg => leg.multiplier), [75, null]);
  assert.equal(normalized.contracts[0].iv, .188);
  assert.equal(normalized.contracts[0].greeks.delta, 0);
  assert.equal(normalized.contracts[1].greeks.delta, null);

  delete process.env.UPSTOX_ACCESS_TOKEN;
  const manualOnly = await (await commodities.GET(mcxChainRequest)).json();
  assert.equal(manualOnly.ok, true);
  assert.equal(manualOnly.contracts[0].strike, 160000);
  assert.equal(manualOnly.contracts[0].ask, null);
  assert.match(manualOnly.quoteWarning, /enter premiums manually/);
});
