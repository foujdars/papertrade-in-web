import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { moneycontrolCryptoSymbols, moneycontrolEquitySymbols, popularHeading, searchShelfRows, tradingViewLeaders } from "../lib/search-shelf.ts";

const instruments = [
  { symbol: "RELIANCE", name: "Reliance Industries", instrumentKey: "NSE_EQ|1", categories: [], assetType: "EQUITY" },
  { symbol: "TCS", name: "Tata Consultancy", instrumentKey: "NSE_EQ|2", categories: [], assetType: "EQUITY" },
  { symbol: "BTCUSD", name: "Bitcoin perpetual", instrumentKey: "DELTA|BTCUSD", categories: ["GLOBAL", "CRYPTO"], assetType: "FUTURE" },
  { symbol: "ETHUSD", name: "Ethereum perpetual", instrumentKey: "DELTA|ETHUSD", categories: ["GLOBAL", "CRYPTO"], assetType: "FUTURE" },
  { symbol: "AAPLXUSD", name: "Apple xStock Token perpetual", instrumentKey: "DELTA|AAPLXUSD", categories: ["GLOBAL", "US_MARKET"], assetType: "FUTURE" },
  { symbol: "NVDAXUSD", name: "NVIDIA xStock Token perpetual", instrumentKey: "DELTA|NVDAXUSD", categories: ["GLOBAL", "US_MARKET"], assetType: "FUTURE" },
  { symbol: "XAUTUSD", name: "Gold perpetual", instrumentKey: "DELTA|XAUTUSD", categories: ["GLOBAL", "GOLD"], assetType: "FUTURE" },
];
const popular = {
  in: ["TCS", "RELIANCE", "INFY"],
  us: ["NVDA", "AAPL"],
  crypto: ["ETH", "BTC"],
  sources: { in: "moneycontrol", us: "tradingview", crypto: "moneycontrol" },
};

test("Moneycontrol pages yield NSE symbols and crypto bases", () => {
  const indian = moneycontrolEquitySymbols({ props: { pageProps: { marketStatsData: { marketStatsOverviewData: { list: [{ symbol: " sail " }, { symbol: "RELIANCE" }, { symbol: "bad symbol" }, { symbol: "RELIANCE" }] } } } } });
  assert.deepEqual(indian, ["SAIL", "RELIANCE"]);
  const crypto = moneycontrolCryptoSymbols({ props: { pageProps: { topCryptoListData: [{ baseAsset: "BTC" }, { baseAsset: "USDC" }, { baseAsset: "ETH" }] } } });
  assert.deepEqual(crypto, ["BTC", "ETH"]);
  assert.deepEqual(tradingViewLeaders({ data: [{ d: ["NVDA"] }, { d: ["AAPL"] }, { d: ["TOO-LONG"] }] }), ["NVDA", "AAPL"]);
});

test("All opens with recent charts before Moneycontrol names", () => {
  const rows = searchShelfRows({ shelf: "all", instruments, recent: ["BTCUSD", "RELIANCE"], popular, query: "" });
  assert.deepEqual(rows.recent.map(item => item.symbol), ["BTCUSD", "RELIANCE"]);
  assert.deepEqual(rows.popular.map(item => item.symbol), ["TCS"]);
  assert.equal(popularHeading("all", popular), "Most active on Moneycontrol");
});

test("IN keeps Indian charts first, US and crypto use their own rankings", () => {
  const indian = searchShelfRows({ shelf: "in", instruments, recent: ["BTCUSD", "TCS"], popular, query: "" });
  assert.deepEqual(indian.recent.map(item => item.symbol), ["TCS"]);
  assert.deepEqual(indian.popular.map(item => item.symbol), ["RELIANCE"]);
  const us = searchShelfRows({ shelf: "us", instruments, recent: ["AAPLXUSD"], popular, query: "" });
  assert.deepEqual(us.recent.map(item => item.symbol), ["AAPLXUSD"]);
  assert.deepEqual(us.popular.map(item => item.symbol), ["NVDAXUSD"]);
  assert.equal(popularHeading("us", popular), "Most active on TradingView");
  const crypto = searchShelfRows({ shelf: "crypto", instruments, recent: [], popular, query: "" });
  assert.deepEqual(crypto.popular.map(item => item.symbol), ["ETHUSD", "BTCUSD"]);
});

test("a query stays inside the selected tab", () => {
  const rows = searchShelfRows({ shelf: "in", instruments, recent: [], popular, query: "bit" });
  assert.deepEqual(rows.matches.map(item => item.symbol), []);
  const all = searchShelfRows({ shelf: "all", instruments, recent: [], popular, query: "gold" });
  assert.deepEqual(all.matches.map(item => item.symbol), ["XAUTUSD"]);
});

test("the popular route reads Moneycontrol", async () => {
  const route = await readFile(new URL("../app/api/market/search-popular/route.ts", import.meta.url), "utf8");
  assert.match(route, /moneycontrol\.com\/stocks\/market-stats\/most-active-stocks-nse/);
  assert.match(route, /moneycontrol\.com\/cryptocurrency/);
});
