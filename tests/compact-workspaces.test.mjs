import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import test from "node:test";
import ts from "typescript";
import postcss from "postcss";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Back dismisses trade selection before its parent screen, and Done doesn't consume the next Back", async () => {
  const require = createRequire(import.meta.url);
  const compiled = ts.transpileModule(await source("components/useTransientBack.ts"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
  const listeners = new Map();
  const history = [{ original: true }];
  let index = 0, home = 0, deselected = 0;
  const win = {
    addEventListener(type, callback, options) { const entries = listeners.get(type) ?? []; entries.push({ callback, once: options?.once, capture: options === true || options?.capture }); listeners.set(type, entries); },
    removeEventListener(type, callback) { listeners.set(type, (listeners.get(type) ?? []).filter(entry => entry.callback !== callback)); },
    dispatchEvent(event) { let stopped = false; event.stopImmediatePropagation = () => { stopped = true; }; for (const entry of [...(listeners.get(event.type) ?? [])].sort((a, b) => Number(b.capture) - Number(a.capture))) { if (stopped) break; entry.callback(event); if (entry.once) win.removeEventListener(event.type, entry.callback); } return !event.defaultPrevented; },
    history: { get state() { return history[index]; }, pushState(state) { history.splice(++index); history.push(state); }, back() { if (index > 0) index--; queueMicrotask(() => win.dispatchEvent(new Event("popstate"))); } },
  };
  const cleanups = [];
  const fakeReact = { useRef: current => ({ current }), useEffect: fn => { const cleanup = fn(); if (cleanup) cleanups.push(cleanup); } };
  const exports = {};
  new Function("require", "exports", "window", "document", compiled.outputText)(name => name === "react" ? fakeReact : name === "@capacitor/core" ? { Capacitor: { isNativePlatform: () => false } } : require(name), exports, win, { querySelector: () => null });
  exports.useTransientBack(true, () => home++);
  await Promise.resolve();
  exports.useTransientBack(true, () => deselected++);
  await Promise.resolve();
  win.history.back(); await Promise.resolve();
  assert.equal(deselected, 1); assert.equal(home, 0);
  cleanups.pop()();
  win.history.back(); await Promise.resolve();
  assert.equal(home, 1);
  cleanups.pop()();
  exports.useTransientBack(true, () => home++); await Promise.resolve();
  exports.useTransientBack(true, () => deselected++); await Promise.resolve();
  cleanups.pop()(); // Done
  await Promise.resolve();
  assert.equal(home, 1, "Done must not close the parent screen");
  win.history.back(); await Promise.resolve();
  assert.equal(home, 2, "No lingering cleanup listener may swallow the next Back");
  cleanups.pop()();
});

test("holding a trade selects it once, while taps, scrolling and cancelled holds stay safe", async () => {
  const require = createRequire(import.meta.url);
  const compiled = ts.transpileModule(await source("components/LongPressTradeRow.tsx"), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } });
  let pending = null, selected = 0, clicked = 0;
  const effects = [];
  const fakeReact = { useRef: (current) => ({ current }), useEffect: (fn) => { effects.push(fn()); } };
  const exports = {};
  new Function("require", "exports", "setTimeout", "clearTimeout", "navigator", compiled.outputText)((name) => name === "react" ? fakeReact : require(name), exports, (fn, delay) => { assert.equal(delay, 500); pending = fn; return 1; }, () => { pending = null; }, {});
  const row = exports.LongPressTradeRow({ onLongPress: () => selected++, onClick: () => clicked++ });
  const event = { button: 0, isPrimary: true, clientX: 10, clientY: 10, target: { closest: () => null }, preventDefault() {}, stopPropagation() {} };
  row.props.onPointerDown(event);
  pending();
  row.props.onPointerUp(event);
  row.props.onClick(event);
  assert.equal(selected, 1);
  assert.equal(clicked, 0, "Release must not open chart or deselect");
  row.props.onPointerDown(event);
  row.props.onPointerUp(event);
  assert.equal(pending, null);
  row.props.onClick(event);
  assert.equal(clicked, 1);
  row.props.onPointerDown(event);
  row.props.onPointerMove({ ...event, clientY: 30 });
  assert.equal(pending, null, "Scrolling cancels selection");
  row.props.onPointerDown(event);
  row.props.onPointerCancel(event);
  assert.equal(pending, null);
  row.props.onPointerDown({ ...event, target: { closest: () => ({}) } });
  assert.equal(pending, null, "Child controls must not select the parent");
  effects.forEach((cleanup) => cleanup?.());
});

test("chart brackets start with entry only and commit protection only after a completed drag", async () => {
  const [chart, dashboard, layout, css] = await Promise.all([source("components/MarketChart.tsx"), source("components/TradingDashboard.tsx"), source("app/layout.tsx"), source("app/chart-brackets.css")]);
  assert.doesNotMatch(dashboard, /defaultProtectionPrices|automaticProtection/);
  assert.match(dashboard, /activeRiskToolEnabled = selectedPosition.quantity > 0/);
  assert.match(dashboard, /targetPrice: selectedProtection\?\.targetPrice \?\? 0/);
  assert.match(chart, /if \(unset && !branchesOpen\) return null/);
  assert.match(chart, /setExpandedEntry\(branchesOpen \? "" : entryKey\)/);
  assert.match(chart, /setDraftRisk\(\{ key: entryKey, level, price \}\)/);
  assert.match(chart, /event.type !== "pointercancel" && price > 0/);
  assert.doesNotMatch(chart, /onOrderToolChange\?\.\(level, price, false\)/);
  assert.match(dashboard, /if \(!committed \|\| selectedPosition.quantity <= 0/);
  assert.match(dashboard, /paper order placed/);
  assert.match(layout, /chart-brackets.css/);
  assert.match(css, /\.bracket-level-chip/);
});

// Render the real component functions with deterministic hooks. This exercises
// their actual event handlers and state transitions without a browser or feed.
async function componentHarness(path, name, initialStates = []) {
  const require = createRequire(import.meta.url);
  const states = [...initialStates];
  const refs = [];
  let stateIndex = 0;
  let refIndex = 0;
  let effects = [];
  const react = {
    ...require("react"),
    useState(initial) {
      const index = stateIndex++;
      if (!(index in states)) states[index] = typeof initial === "function" ? initial() : initial;
      return [states[index], (next) => { states[index] = typeof next === "function" ? next(states[index]) : next; }];
    },
    useRef(initial) { const index = refIndex++; return refs[index] ??= { current: initial }; },
    useMemo: (callback) => callback(),
    useCallback: (callback) => callback,
    useEffect: (callback) => effects.push(callback),
  };
  const mocks = {
    react,
    "@/components/StockLogo": { StockLogo: () => null },
    "@/components/MarketSectionTabs": { MarketSectionTabs: () => null },
    "@/lib/market": { formatInr: String, deriveNetChange: () => 0, formatSignedMarketMove: String },
    "@/lib/nimble-scanner": { NIMBLE_STRATEGIES: {
      "ema-30-50-100": { label: "EMA", description: "EMA", timeframe: "1D" },
      "rsi-divergence-daily": { label: "RSI", description: "RSI", timeframe: "1D" },
    } },
  };
  const compiled = ts.transpileModule(await source(path), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } });
  const exports = {};
  new Function("require", "exports", compiled.outputText)((id) => mocks[id] ?? require(id), exports);
  return {
    states,
    render(props) { stateIndex = 0; refIndex = 0; effects = []; return exports[name](props); },
    runEffects() { return effects.map((effect) => effect()); },
  };
}

function elements(view) {
  if (Array.isArray(view)) return view.flatMap(elements);
  if (!view || typeof view !== "object") return [];
  return [view, ...elements(view.props?.children)];
}

function viewText(view) {
  if (Array.isArray(view)) return view.map(viewText).join("");
  if (view && typeof view === "object") return viewText(view.props?.children);
  return typeof view === "string" || typeof view === "number" ? String(view) : "";
}

test("each Home market-pulse card opens its own index, not the last chart", async () => {
  const harness = await componentHarness("components/HomeWorkspace.tsx", "HomeWorkspace");
  const selected = [];
  const symbols = ["NIFTY", "BANKNIFTY", "SENSEX"];
  const view = harness.render({
    indices: symbols.map((symbol) => ({ symbol, label: symbol, price: null, points: null, changePercent: null, live: false })),
    stockOptions: [], cards: { market: true, portfolio: false },
    onOpenStock: (symbol) => selected.push(symbol),
  });
  const cards = elements(view).filter((node) => node.props?.className === "home-index-card");
  assert.equal(cards.length, 3);
  cards.forEach((card) => card.props.onClick());
  assert.deepEqual(selected, symbols);
});

test("index row keyboard navigation does not swallow the watchlist-star action", async () => {
  const item = { symbol: "NIFTY", name: "Nifty 50", instrumentKey: "NSE_INDEX|Nifty 50", underlyingType: "INDEX" };
  const harness = await componentHarness("components/FnoListsWorkspace.tsx", "FnoListsWorkspace", ["indices", [item], false]);
  const selected = [];
  const starred = [];
  const view = harness.render({ quotes: {}, starredSymbols: new Set(), onSelect: (value) => selected.push(value), onStar: (value) => starred.push(value) });
  const row = elements(view).find((node) => node.props?.role === "button");
  const star = elements(row).find((node) => node.type === "button");
  const rowTarget = {};
  for (const key of ["Enter", " "]) {
    row.props.onKeyDown({ key, target: star, currentTarget: rowTarget, preventDefault: () => assert.fail("Do not consume the star's key") });
  }
  star.props.onClick({ stopPropagation() {} });
  assert.deepEqual(starred, [item]);
  assert.deepEqual(selected, []);
  let prevented = 0;
  for (const key of ["Enter", " "]) row.props.onKeyDown({ key, target: rowTarget, currentTarget: rowTarget, preventDefault: () => prevented++ });
  assert.deepEqual(selected, [item, item]);
  assert.equal(prevented, 2, "Space should activate without scrolling");
  assert.ok(elements(row).some((node) => node.props?.className === "fno-symbol-identity"));
});

test("scanner OFF never fetches automatically; empty success clears old matches; failure keeps their original date", async (t) => {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const storage = new Map([["papertrade-market-scanner-mode-v1", "manual"]]);
  Object.defineProperty(globalThis, "window", { configurable: true, value: {
    localStorage: { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
    setTimeout, clearTimeout,
  } });
  t.after(() => { if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow); else delete globalThis.window; });
  let payload = { ok: true, rows: [], fetchedAt: "2026-09-07T10:00:00.000Z" };
  const fetchMock = t.mock.method(globalThis, "fetch", async () => ({ ok: payload.ok, json: async () => payload }));
  const props = { group: "TRADING", stockUniverse: [{ symbol: "DEMO", name: "Demo", instrumentKey: "NSE_EQ|INE123", categories: [] }], quotes: {}, onQuoteKeysChange() {} };
  const harness = await componentHarness("components/MarketsWorkspace.tsx", "MarketsWorkspace");
  const render = () => harness.render(props);
  const refresh = async () => {
    elements(render()).find((node) => node.props?.className === "scanner-run-button").props.onClick();
    await new Promise(setImmediate);
  };
  const initial = render();
  assert.equal(elements(initial).find((node) => node.props?.role === "switch").props["aria-checked"], false);
  const cleanups = harness.runEffects();
  assert.equal(fetchMock.mock.callCount(), 0, "OFF must not run an initial scan, even with no saved matches");

  const previous = { rows: [{ symbol: "DEMO", name: "Demo", instrumentKey: "NSE_EQ|INE123", lastPrice: 100, changePercent: 1 }], scannedAt: "2026-09-07T09:00:00.000Z" };
  harness.states[1] = { VOLUME: previous };
  await refresh();
  assert.deepEqual(harness.states[1].VOLUME.rows, []);
  assert.equal(harness.states[1].VOLUME.scannedAt, payload.fetchedAt);
  assert.equal(harness.states[1].VOLUME.error, undefined);
  assert.match(viewText(render()), /0 matches/);

  harness.states[1] = { VOLUME: previous };
  payload = { ok: false, error: { message: "Feed temporarily unavailable" } };
  await refresh();
  assert.deepEqual(harness.states[1].VOLUME.rows, previous.rows);
  assert.equal(harness.states[1].VOLUME.scannedAt, previous.scannedAt);
  assert.equal(harness.states[1].VOLUME.error, payload.error.message);
  assert.match(viewText(render()), /Refresh failed/);
  cleanups.forEach((cleanup) => { if (typeof cleanup === "function") cleanup(); });
});

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

test("scanner controls use one compact automatic switch and refresh", async () => {
  const markets = await source("components/MarketsWorkspace.tsx");
  assert.doesNotMatch(markets, /market-command-hero|scanner-active-story|ACTIVE STRATEGY|Close markets/);
  assert.match(markets, /className={`scanner-auto-switch/);
  assert.match(markets, /role="switch" aria-checked={scanMode === "auto"}/);
  assert.match(markets, /scanMode === "auto" \? "ON" : "OFF"/);
  assert.doesNotMatch(markets, /showStrategyInfo|activeStrategyDescription|scanner-strategy-details|scanner-inline-error/);
  assert.match(markets, /runSelectedScan\(undefined, true\)/);
  assert.match(markets, /onTouchEnd={handlePullEnd}/);
});

test("IPO keeps filters and research links but replaces oversized missing-GMP messages", async () => {
  const ipo = await source("components/IpoWorkspace.tsx");
  const card = await source("components/IpoLifecycleCard.tsx");
  assert.doesNotMatch(ipo, /ipo-overview-banner|ipo-source-line|ipo-feed-note|Not available/);
  assert.match(ipo, /setFilter\("listed"\)/);
  assert.match(ipo, /isRecentListing/);
  assert.match(card, /<IpoResearchLink/);
  assert.match(card, /<IpoCompanyLogo/);
  assert.match(card, /ipo.gmpPercent === null \? "Not reported"/);
  assert.doesNotMatch(ipo, /GMP feed not connected/);
  assert.match(card, /gmpTone\(ipo.gmpPercent\)/);
  assert.match(card, /ipo.gmpPercent.toFixed\(2\)/);
  assert.match(card, /href={ipo.details.registrarUrl}/);
  assert.match(card, /Category-wise valid applications/);
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

test("portfolio exposes complete history filters and a separate open-position exit action", async () => {
  const dashboard = await source("components/TradingDashboard.tsx");
  const home = await source("components/HomeWorkspace.tsx");
  assert.match(home, /Closed trades/);
  assert.match(home, /onOpenTradeHistory/);
  assert.match(dashboard, /setPnlHistoryOnly\(true\)/);
  assert.match(dashboard, /setPnlTradeMenuId\(closedTrades\[0\]\?\.id \?\? null\)/);
  assert.match(dashboard, /pnlHistoryOnly \? "history-only"/);
  assert.match(dashboard, /pnlHistoryFilter === "profit"/);
  assert.match(dashboard, /pnlHistoryFilter === "loss"/);
  assert.match(dashboard, /className="position-exit-button"/);
  assert.match(dashboard, /exitPosition\(position\.quantity, \{ symbol: position\.symbol/);
  assert.match(dashboard, /aria-expanded={selectingTrades \? undefined : menuOpen}/);
  assert.match(dashboard, /role={selectingTrades \? "checkbox" : "button"}/);
  assert.doesNotMatch(dashboard, /selectedPnlDateKey && <div className="pnl-trade-list"/);
});

test("portfolio controls ship styled confirmation, aligned identities and a quantity margin estimate", async () => {
  const [layout, css, dialog, dashboard] = await Promise.all([source("app/layout.tsx"), source("app/portfolio-controls.css"), source("components/TradeDeleteDialog.tsx"), source("components/TradingDashboard.tsx")]);
  assert.match(layout, /import "\.\/portfolio-controls\.css"/);
  assert.match(css, /\.position-chart-link > \.stock-identity\s*\{[^}]*flex-direction: row/s);
  assert.match(css, /\.trade-delete-dialog::backdrop/);
  assert.match(dialog, /showModal\(\)/);
  assert.match(dialog, /cancelRef\.current\?\.focus\(\)/);
  assert.match(dialog, /disabled={Boolean\(error\) \|\| !count}/);
  assert.match(dashboard, /verifiedLivePrice \? formatInr\(estimatedFundsRequired\) : "—"/);
  assert.match(dashboard, /pendingDeleteIds \? \(\) => setPendingDeleteIds\(null\)/);
});

test("cash charts discover F&O eligibility regardless of where a symbol was opened", async () => {
  const dashboard = await source("components/TradingDashboard.tsx");
  assert.match(dashboard, /fetch\("\/api\/upstox\/fno-underlyings"/);
  assert.match(dashboard, /const selectedFnoUnderlying = useMemo/);
  assert.match(dashboard, /item\.instrumentKey === selected\.instrumentKey \|\| item\.symbol === selected\.symbol/);
  assert.match(dashboard, /onClick={\(\) => void openFnoUnderlying\(selectedFnoUnderlying\)}/);
});
