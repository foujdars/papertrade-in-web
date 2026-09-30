import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { moneycontrolCryptoSymbols, moneycontrolEquitySymbols, moneycontrolTrendingSymbols, moneycontrolUsSymbols, popularHeading, searchShelfRows, tradingViewLeaders, matchShelfInstrument } from "../lib/search-shelf.ts";
import { boardQuotes, splitBoard } from "../lib/search-board.ts";

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
  const trending = moneycontrolTrendingSymbols({ a: { analytics_sequence: "2", sc_nseid: "TCS" }, b: { analytics_sequence: "1", sc_nseid: " idea " }, c: { analytics_sequence: "3", sc_nseid: "" } });
  assert.deepEqual(trending, ["IDEA", "TCS"]);
  const indian = moneycontrolEquitySymbols({ props: { pageProps: { marketStatsData: { marketStatsOverviewData: { list: [{ symbol: " sail " }, { symbol: "RELIANCE" }, { symbol: "bad symbol" }, { symbol: "RELIANCE" }] } } } } });
  assert.deepEqual(indian, ["SAIL", "RELIANCE"]);
  const us = moneycontrolUsSymbols({ props: { pageProps: { USData: { tableData: { header: [{ name: "stock_ticker" }], body: { dataList: [["NVDA"], ["AAPL"], ["BRK.B"], ["too long"]] } } } } } });
  assert.deepEqual(us, ["NVDA", "AAPL", "BRK.B"]);
  const crypto = moneycontrolCryptoSymbols({ props: { pageProps: { topCryptoListData: [{ baseAsset: "BTC" }, { baseAsset: "USDC" }, { baseAsset: "ETH" }] } } });
  assert.deepEqual(crypto, ["BTC", "ETH"]);
  assert.deepEqual(tradingViewLeaders({ data: [{ d: ["NVDA"] }, { d: ["AAPL"] }, { d: ["TOO-LONG"] }] }), ["NVDA", "AAPL"]);
});

test("All opens with recent charts before Moneycontrol names", () => {
  const rows = searchShelfRows({ shelf: "all", instruments, recent: ["BTCUSD", "RELIANCE"], popular, query: "" });
  assert.deepEqual(rows.recent.map(item => item.symbol), ["BTCUSD", "RELIANCE"]);
  assert.deepEqual(rows.popular.map(item => item.symbol), ["TCS"]);
  assert.equal(popularHeading("all", popular), "Trending on Moneycontrol");
});

test("IN keeps Indian charts first, US and crypto use their own rankings", () => {
  const indian = searchShelfRows({ shelf: "in", instruments, recent: ["BTCUSD", "TCS"], popular, query: "" });
  assert.deepEqual(indian.recent.map(item => item.symbol), ["TCS"]);
  assert.deepEqual(indian.popular.map(item => item.symbol), ["RELIANCE"]);
  const us = searchShelfRows({ shelf: "us", instruments, recent: ["AAPLXUSD"], popular, query: "" });
  assert.deepEqual(us.recent.map(item => item.symbol), ["AAPLXUSD"]);
  assert.deepEqual(us.popular.map(item => item.symbol), ["NVDAXUSD"]);
  assert.equal(popularHeading("us", popular), "Most active on TradingView");
  assert.equal(popularHeading("us", { ...popular, sources: { ...popular.sources, us: "moneycontrol" } }), "Largest on Moneycontrol");
  assert.equal(popularHeading("crypto", popular), "Top on Moneycontrol");
  const crypto = searchShelfRows({ shelf: "crypto", instruments, recent: [], popular, query: "" });
  assert.deepEqual(crypto.popular.map(item => item.symbol), ["ETHUSD", "BTCUSD"]);
});

test("a query stays inside the selected tab", () => {
  const rows = searchShelfRows({ shelf: "in", instruments, recent: [], popular, query: "bit" });
  assert.deepEqual(rows.matches.map(item => item.symbol), []);
  const all = searchShelfRows({ shelf: "all", instruments, recent: [], popular, query: "gold" });
  assert.deepEqual(all.matches.map(item => item.symbol), ["XAUTUSD"]);
});

test("the search window is portaled over Home instead of sitting in the search box", async () => {
  const view = await readFile(new URL("../components/HomeWorkspace.tsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../app/home-hub.css", import.meta.url), "utf8");
  assert.match(view, /createPortal\(/);
  assert.match(view, /document\.querySelector\("\.terminal-shell"\)/);
  assert.match(css, /\.home-search-sheet \{[^}]*position:\s*fixed/s);
  assert.match(css, /\.home-search-sheet \{[^}]*z-index:\s*261/s);
  assert.match(css, /\.home-search-sheet \{[^}]*right:\s*0/s);
  assert.match(css, /\.home-search-sheet \{[^}]*animation:\s*home-side-slide/s);
  assert.match(view, /home-pair-row/);
  assert.match(view, /Gainers/);
  assert.match(view, /Losers/);
  assert.match(view, /search-movers/);
});

test("search lists keep five recent names, then gainers and losers", () => {
  const many = ["RELIANCE", "TCS", "INFY", "SBIN", "ITC", "LT"].map((symbol, index) => ({ symbol, name: symbol, instrumentKey: `NSE_EQ|${index}`, categories: [], assetType: "EQUITY" }));
  const rows = searchShelfRows({ shelf: "in", instruments: many, recent: many.map(item => item.symbol), popular, query: "" });
  assert.deepEqual(rows.recent.map(item => item.symbol), ["RELIANCE", "TCS", "INFY", "SBIN", "ITC"]);
  const board = splitBoard(boardQuotes({ data: [
    { d: ["NVDA", 100, 2, 2500000, "NVIDIA"] },
    { d: ["AAPL", 90, -1.5, 100000, "Apple"] },
    { d: ["MSFT", 80, 0, 10, "Flat"] },
  ] }, "us"));
  assert.deepEqual(board.gainers.map(row => row.symbol), ["NVDA"]);
  assert.deepEqual(board.losers.map(row => row.symbol), ["AAPL"]);
  assert.equal(board.gainers[0].volume, 2500000);
  assert.equal(matchShelfInstrument(instruments, "us", "AAPL")?.symbol, "AAPLXUSD");
  assert.equal(matchShelfInstrument(instruments, "crypto", "BTC")?.symbol, "BTCUSD");
});

test("the popular route reads Moneycontrol", async () => {
  const route = await readFile(new URL("../app/api/market/search-popular/route.ts", import.meta.url), "utf8");
  assert.match(route, /moneycontrol\.com\/mc-apis\/trending-stocks\/limit-30/);
  assert.match(route, /moneycontrol\.com\/stocks\/market-stats\/most-active-stocks-nse/);
  assert.match(route, /moneycontrol\.com\/cryptocurrency/);
  assert.match(route, /moneycontrol\.com\/us-markets\/market-movers\/top-companies-by-market-cap/);
});
