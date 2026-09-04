import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import test from "node:test";
import ts from "typescript";
import * as logos from "../lib/stock-logo.ts";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const reliance = { symbol: "RELIANCE", instrumentKey: "NSE_EQ|INE002A01018" };

test("company logos use verified equity ISIN keys, never guessed symbols or URLs", () => {
  assert.equal(logos.stockLogoUrl(reliance.instrumentKey), "https://assets.upstox.com/content/assets/images/logos/NSE_EQ%7CINE002A01018.png");
  for (const invalid of [undefined, "RELIANCE", "NSE_INDEX|Nifty 50", "NSE_FO|12345", "https://example.com/logo.png", "NSE_EQ|../../x", "NSE_EQ|INE002A01018?x"]) {
    assert.equal(logos.stockLogoUrl(invalid), null);
  }
});

test("renamed and newly supplied symbols resolve by ISIN; unknown stocks fall back", () => {
  const directory = logos.stockLogoDirectory([reliance, { symbol: "NEWLYLISTED", instrumentKey: "NSE_EQ|INE470Y01017" }, { symbol: "ETERNAL", instrumentKey: "NSE_EQ|INE758T01015" }, { symbol: "ZOMATO", instrumentKey: "NSE_EQ|INE758T01015" }]);
  assert.equal(logos.resolveStockLogo({ symbol: "NEWLYLISTED" }, directory), logos.stockLogoUrl("NSE_EQ|INE470Y01017"));
  assert.equal(logos.resolveStockLogo({ symbol: "ZOMATO" }, directory), logos.resolveStockLogo({ symbol: "ETERNAL" }, directory));
  assert.equal(logos.resolveStockLogo({ symbol: "UNKNOWN" }, directory), null);
});

test("derivatives use their underlying company and indices do not get an unrelated logo", () => {
  const option = { symbol: "RELIANCE-CALL", instrumentKey: "NSE_FO|12345", underlyingSymbol: "RELIANCE" };
  const directory = logos.stockLogoDirectory([option, reliance]);
  assert.equal(logos.resolveStockLogo(option, directory), logos.stockLogoUrl(reliance.instrumentKey));
  assert.equal(logos.resolveStockLogo({ symbol: option.symbol }, directory), logos.stockLogoUrl(reliance.instrumentKey));
  assert.equal(logos.resolveStockLogo({ symbol: "FUTURE", underlyingKey: reliance.instrumentKey }, directory), logos.stockLogoUrl(reliance.instrumentKey));
  assert.equal(logos.resolveStockLogo({ symbol: "NIFTY-CALL", instrumentKey: "NSE_FO|123", underlyingKey: "NSE_INDEX|Nifty 50" }, directory), null);
});

test("logo image is lazy and fixed-size, handles failure, and resets identity on symbol changes", async () => {
  const require = createRequire(import.meta.url);
  const react = require("react");
  let failed = false;
  const fakeReact = { ...react, useContext: () => logos.stockLogoDirectory([reliance]), useState: () => [failed, (value) => { failed = value; }] };
  const compiled = ts.transpileModule(await source("components/StockLogo.tsx"), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } });
  const exports = {};
  new Function("require", "exports", compiled.outputText)((name) => name === "react" ? fakeReact : name === "@/lib/stock-logo" ? logos : require(name), exports);
  const element = exports.StockLogo({ ...reliance, size: 32 });
  const view = element.type(element.props);
  assert.equal(view.props["aria-hidden"], "true");
  assert.equal(view.props.style["--stock-logo-size"], "32px");
  const img = view.props.children;
  assert.equal(img.type, "img");
  assert.equal(img.props.loading, "lazy");
  assert.equal(img.props.referrerPolicy, "no-referrer");
  assert.equal(img.props.alt, "");
  img.props.onError();
  assert.equal(element.type(element.props).props.children, "RE");
  assert.notEqual(element.key, exports.StockLogo({ symbol: "UNKNOWN" }).key);
});

test("stock surfaces share company artwork while scanner rows omit repeated signal explanations", async () => {
  for (const component of ["TradingDashboard", "HomeWorkspace", "MarketsWorkspace", "FnoListsWorkspace", "FnoChartWorkspace", "OptionChainSheet", "AdvancedChartWorkspace", "NotificationCenter"]) {
    assert.match(await source(`components/${component}.tsx`), /<StockLogo\b/, component);
  }
  const dashboard = await source("components/TradingDashboard.tsx");
  assert.match(dashboard, /<StockLogoProvider instruments={tradingUniverse}>/);
  const markets = await source("components/MarketsWorkspace.tsx");
  assert.doesNotMatch(markets, /row\.setupStatus|Entry \$\{formatInr\(row\.entry\)\}/);
  assert.match(markets, /detail && <small>{detail}<\/small>/);
  assert.doesNotMatch(await source("app/globals.css"), /scanner-mode-toggle button:(first|last)-child::after/);
});

test("new trade alerts preserve explicit stock identity instead of parsing message text", async () => {
  const notification = await source("lib/notification-center.ts");
  assert.match(notification, /symbol: input.symbol, instrumentKey: input.instrumentKey/);
  assert.match(await source("components/TradingDashboard.tsx"), /symbol: order.symbol, instrumentKey: order.instrumentKey/);
});
