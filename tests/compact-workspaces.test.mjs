import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import test from "node:test";
import ts from "typescript";
import postcss from "postcss";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Markets has Trading, Investment and Watchlist actions with a single active section", async () => {
  const input = await source("components/MarketSectionTabs.tsx");
  const compiled = ts.transpileModule(input, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } });
  const exports = {};
  new Function("require", "exports", compiled.outputText)(createRequire(import.meta.url), exports);
  for (const active of ["TRADING", "INVESTMENT", "WATCHLIST"]) {
    const actions = [];
    const view = exports.MarketSectionTabs({ active, onChange: (section) => actions.push(section) });
    assert.equal(view.props["aria-label"], "Market sections");
    const buttons = view.props.children;
    assert.deepEqual(buttons.map((button) => button.key), ["TRADING", "INVESTMENT", "WATCHLIST"]);
    assert.deepEqual(buttons.filter((button) => button.props["aria-current"] === "page").map((button) => button.key), [active]);
    for (const button of buttons) button.props.onClick();
    assert.deepEqual(actions, ["TRADING", "INVESTMENT", "WATCHLIST"]);
  }
});

test("Watchlist stays in Markets navigation and retains saved-list controls", async () => {
  const dashboard = await source("components/TradingDashboard.tsx");
  const markets = await source("components/MarketsWorkspace.tsx");
  assert.doesNotMatch(dashboard, /top-watchlist-button/);
  assert.match(dashboard, /const marketNavigationActive = activeNavigationSection === "markets" \|\| activeNavigationSection === "watchlist"/);
  assert.match(dashboard, /<MarketSectionTabs active="WATCHLIST"/);
  assert.match(dashboard, /onOpenWatchlist={\(\) => openNavigationSection\("watchlist"\)}/);
  assert.match(dashboard, /marketNavigationActive \? 3/);
  assert.match(dashboard, /setSidebarOpen\(section === "watchlist"\)/);
  assert.match(dashboard, /removeStockFromCustomWatchlist/);
  assert.match(dashboard, /<WatchlistSelector/);
  assert.match(markets, /<MarketSectionTabs active={scannerGroup}/);
  assert.match(markets, /if \(section === "WATCHLIST"\) onOpenWatchlist\(\)/);
});

test("scanner controls have no duplicate hero and keep optional strategy details and refresh", async () => {
  const markets = await source("components/MarketsWorkspace.tsx");
  assert.doesNotMatch(markets, /market-command-hero|scanner-active-story|ACTIVE STRATEGY|Close markets/);
  assert.match(markets, /aria-expanded={showStrategyInfo}/);
  assert.match(markets, /activeStrategyDescription/);
  assert.match(markets, /Auto · 1m/);
  assert.match(markets, /runSelectedScan\(undefined, true\)/);
  assert.match(markets, /onTouchEnd={handlePullEnd}/);
});

test("IPO keeps filters and research links but replaces oversized missing-GMP messages", async () => {
  const ipo = await source("components/IpoWorkspace.tsx");
  assert.doesNotMatch(ipo, /ipo-overview-banner|ipo-source-line|ipo-feed-note|Not available/);
  assert.match(ipo, /<IpoAllotments board={board} directory={directory}/);
  assert.match(ipo, /<IpoResearchLink/);
  assert.match(ipo, /<IpoCompanyLogo/);
  assert.match(ipo, /<span className="ipo-gmp-pending">{gmpFeedConfigured \? "GMP not yet reported" : "GMP feed not connected"}/);
  assert.match(ipo, /gmp === null/);
  assert.match(ipo, /<strong>{gmp}<\/strong>/);
});

test("compact styling uses theme colours and preserves readable, scrollable controls", async () => {
  const style = await source("app/compact-workspaces.css");
  const tree = postcss.parse(style);
  assert.match(await source("app/layout.tsx"), /import "\.\/compact-workspaces.css"/);
  const declarations = (selector) => {
    const result = {};
    tree.walkRules(selector, (rule) => rule.walkDecls((decl) => { result[decl.prop] = decl.value; }));
    return result;
  };
  assert.equal(declarations(".market-section-tabs button")["min-height"], "44px");
  assert.equal(declarations(".ipo-gmp-pending")["font-size"], "11px");
  assert.equal(declarations(".ipo-gmp-pending").color, "var(--muted)");
  assert.match(style, /\.ipo-workspace \.ipo-filter-tabs { width: 100%; display: flex; overflow-x: auto/);
  assert.match(await source("app/globals.css"), /\.ipo-card-list[^}]*grid-auto-rows: max-content/);
});
