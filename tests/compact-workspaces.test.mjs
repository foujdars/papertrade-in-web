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

test("studio theme covers every workspace without replacing navigation or scroll geometry", async () => {
  const style = await source("app/studio-theme.css");
  const tree = postcss.parse(style);
  const layout = await source("app/layout.tsx");
  assert.ok(layout.indexOf('import "./studio-theme.css"') > layout.indexOf('import "./compact-workspaces.css"'));
  for (const selector of [".home-workspace", ".trade-cockpit", ".fno-focus-workspace", ".market-discovery-panel", ".ipo-workspace", ".holdings-overview-card", ".pnl-calendar-card", ".notification-center-panel", ".more-menu-panel", ".auth-screen"]) {
    assert.ok(style.includes(selector), `Missing themed surface: ${selector}`);
  }
  // This skin must not reintroduce collapsing IPO rows or override fixed overlays.
  tree.walkDecls((decl) => assert.ok(!["position", "z-index", "overflow", "display", "inset"].includes(decl.prop) || decl.parent.selector === ".ipo-updated-caption", `${decl.prop} must stay in the layout styles`));
  assert.match(style, /grid-auto-rows: max-content/);
  assert.match(style, /flex-shrink: 0/);
  assert.match(style, /\.ipo-facts b[^}]*white-space: normal/);
  assert.doesNotMatch(style, /animation:|!important/);
});

test("light and dark studio text meet normal-text contrast on their surfaces", async () => {
  const light = postcss.parse(await source("app/globals.css"));
  const dark = postcss.parse(await source("app/studio-theme.css"));
  const values = (tree, selector) => {
    const result = {};
    tree.walkRules(selector, (rule) => rule.walkDecls((decl) => { result[decl.prop] = decl.value; }));
    return result;
  };
  const luminance = (hex) => {
    const rgb = hex.slice(1).match(/../g).map((pair) => parseInt(pair, 16) / 255).map((c) => c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4);
    return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
  };
  for (const theme of [values(light, ":root"), values(dark, '.terminal-shell[data-theme="neon"]')]) {
    for (const text of ["--ink", "--muted", "--purple"]) {
      for (const surface of ["--studio-canvas", "--studio-panel", "--studio-raised"]) {
        const pair = [luminance(theme[text]), luminance(theme[surface])].sort((a, b) => b - a);
        assert.ok((pair[0] + .05) / (pair[1] + .05) >= 4.5, `${text} on ${surface} must be readable`);
      }
    }
  }
});

test("chart creation and theme changes both use the navy canvas and preserve candle colours", async () => {
  const chart = await source("components/MarketChart.tsx");
  assert.equal(chart.match(/color: neon \? "#0c142b" : "#ffffff"/g)?.length, 2);
  assert.equal(chart.match(/textColor: neon \? "#a4adc7"/g)?.length, 2);
  assert.match(chart, /upColor: "#00a67e"/);
  assert.match(chart, /downColor: "#f04458"/);
});
