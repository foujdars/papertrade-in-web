import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import ts from "typescript";
import { prepareReplayCandles, replayTrade, replayPnl, emptyReplayAccount } from "../lib/bar-replay.ts";

const bar = (time, close) => ({ time, open: close, high: close + 2, low: close - 2, close, volume: 100 });

const require = createRequire(import.meta.url);
function treeElements(view) {
  if (Array.isArray(view)) return view.flatMap(treeElements);
  if (!view || typeof view !== "object") return [];
  return [view, ...treeElements(view.props?.children)];
}

test("replay previews, confirms and starts on the chosen candle without showing future bars", async () => {
  const source = await readFile(new URL("../components/BarReplay.tsx", import.meta.url), "utf8");
  const snapshot = [bar(100, 101), bar(200, 102), bar(300, 103), bar(400, 104)];
  const states = ["5m", snapshot, 0, true, false, false, false];
  let index = 0;
  const react = { ...require("react"), useState(initial) { const key = index++; if (!(key in states)) states[key] = typeof initial === "function" ? initial() : initial; return [states[key], next => { states[key] = typeof next === "function" ? next(states[key]) : next; }]; }, useEffect() {}, useMemo: fn => fn(), useRef: current => ({ current }) };
  const chart = () => null;
  const mocks = {
    react,
    "./CandleLoader": { CandleLoader: () => null },
    "@/components/MarketChart": { MarketChart: chart, DEFAULT_CHART_INDICATORS: {} },
    "@/components/ChartFunctionMenu": {}, "@/components/CompactSelectors": {}, "@/components/StockLogo": {},
    "@/lib/market": { formatInr: String },
    "@/lib/bar-replay": { emptyReplayAccount, replayTrade, prepareReplayCandles, replayPnl },
  };
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const exports = {};
  new Function("require", "exports", compiled)(id => mocks[id] ?? require(id), exports);
  const render = () => { index = 0; return exports.BarReplay({ instrument: { symbol: "DEMO", instrumentKey: "NSE_EQ|DEMO" }, initialTimeframe: "5m", theme: "light" }); };
  const chartProps = () => treeElements(render()).find(node => node.type === chart).props;
  assert.equal(chartProps().replayPrompt, false);
  chartProps().onReplayPreview(300);
  assert.equal(chartProps().replayStartTime, 300);
  assert.equal(chartProps().replayCandles.length, 4, "Preview fades but does not remove future data");
  assert.equal(chartProps().replayPrompt, true);
  chartProps().onReplaySelect(300);
  assert.equal(chartProps().replaySelecting, false);
  assert.deepEqual(chartProps().replayCandles.map(bar => bar.time), [100, 200, 300]);
  chartProps().onReplayPlay();
  assert.equal(chartProps().replayStartTime, null, "Play removes the start line");
  assert.equal(chartProps().replayPrompt, false);
  assert.equal(states[4], true, "Playback starts");
  assert.equal(states[2], 2, "Playback starts on the selected candle, not a later candle");
  assert.doesNotMatch(source, /type="range"|Tap a candle to start|Start here/);
});

test("the chart's actual drag handlers snap, cancel safely and confirm only a tap", async () => {
  const source = await readFile(new URL("../components/MarketChart.tsx", import.meta.url), "utf8");
  const start = source.indexOf('{isReplay && replayMarkerX !== null && <>');
  const end = source.indexOf('<div className="chart-symbol-legend', start);
  assert.ok(start > 0 && end > start);
  const props = {
    isReplay: true, replayMarkerX: 30, replaySelecting: true, replayStartTime: 100, replayPrompt: true,
    replayDrag: { current: null }, dataRef: { current: [bar(100, 1), bar(200, 2), bar(300, 3), bar(400, 4)] },
    chartApi: { current: { timeScale: () => ({ coordinateToLogical: x => x / 10 }) } },
    chartHost: { current: { clientWidth: 360, getBoundingClientRect: () => ({ left: 0 }) } },
    onReplayPreview: time => previews.push(time), onReplaySelect: time => selections.push(time), onReplayPlay() {},
  };
  const compiled = ts.transpileModule(`export function render(props) { const {${Object.keys(props).join(",")}} = props; return <>${source.slice(start, end)}</>; }`, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS }, fileName: "overlay.tsx" }).outputText;
  const exports = {}, previews = [], selections = [];
  new Function("require", "exports", compiled)(require, exports);
  const marker = () => treeElements(exports.render(props)).find(node => node.props?.className === "replay-start-marker replay-drag-marker").props;
  const event = { pointerId: 1, clientX: 0, preventDefault() {}, stopPropagation() {}, currentTarget: { setPointerCapture() {}, hasPointerCapture: () => true, releasePointerCapture() {} } };
  marker().onPointerDown(event);
  marker().onPointerMove({ ...event, clientX: 16 });
  assert.equal(previews.at(-1), 300, "Drag snaps to the nearest candle");
  marker().onPointerMove({ ...event, clientX: 10000 });
  assert.equal(previews.at(-1), 300, "At least one candle remains for playback");
  marker().onPointerUp(event);
  assert.deepEqual(selections, [], "Dragging stops at a preview, not an accidental confirmation");
  marker().onPointerDown(event);
  marker().onPointerMove({ ...event, clientX: 15 });
  marker().onPointerCancel(event);
  assert.equal(previews.at(-1), 100, "Interrupted drags restore their original candle");
  marker().onPointerDown(event); marker().onPointerUp(event);
  assert.deepEqual(selections, [100]);
  marker().onKeyDown({ ...event, key: "ArrowRight" });
  assert.equal(previews.at(-1), 200);
});
test("replay snapshots are sorted, deduplicated, validated and exclude the newest forming candle", () => {
  const input = [bar(300, 103), bar(100, 100), bar(200, 102), bar(200, 102), bar(400, NaN)];
  assert.deepEqual(prepareReplayCandles(input).map(x => x.time), [100, 200]);
  assert.equal(input.length, 5);
});
test("replay long and short fills use only the currently revealed price and selected quantity", () => {
  let account = replayTrade(emptyReplayAccount(), "BUY", bar(100, 100), 50);
  assert.equal(replayPnl(account.position, 103), 150);
  account = replayTrade(account, "CLOSE", bar(200, 103), 1);
  assert.equal(account.realized, 150);
  assert.equal(account.position, null);
  assert.equal(account.fills[1].quantity, 50);
  account = replayTrade(account, "SELL", bar(300, 110), 25);
  account = replayTrade(account, "BUY", bar(400, 108), 999);
  assert.equal(account.realized, 200);
  assert.deepEqual(account.fills.map(x => x.role), ["ENTRY", "EXIT", "ENTRY", "EXIT"]);
});
test("invalid quantities and repeated same-side orders cannot create or enlarge replay exposure", () => {
  const empty = emptyReplayAccount();
  for (const quantity of [0, -1, NaN, Infinity, 1.2]) assert.equal(replayTrade(empty, "BUY", bar(100, 100), quantity), empty);
  assert.equal(replayTrade(empty, "CLOSE", bar(100, 100), 1), empty);
  const open = replayTrade(empty, "SELL", bar(100, 100), 1);
  assert.equal(replayTrade(open, "SELL", bar(200, 99), 1000), open);
  assert.deepEqual(emptyReplayAccount(), { position: null, realized: 0, fills: [] });
});
test("original chart powers replay, hides future bars and never feeds replay prices into portfolio state", async () => {
  const replay = await readFile(new URL("../components/BarReplay.tsx", import.meta.url), "utf8");
  const chart = await readFile(new URL("../components/MarketChart.tsx", import.meta.url), "utf8");
  assert.match(replay, /<MarketChart/);
  assert.match(replay, /candles\.slice\(0, cursor \+ 1\)/);
  assert.match(replay, /instrumentKey: instrument\.instrumentKey, timeframe, scope: "combined"/);
  assert.doesNotMatch(replay, /writePaperOrders|localStorage|onPrice=|onOrderSide=/);
  assert.match(chart, /if \(isReplay\) return;[\s\S]*?async function loadUpstoxCandles/);
  assert.match(chart, /if \(isReplay \|\| !LIVE_TIMEFRAME_SECONDS/);
  assert.match(chart, /if \(isReplay \|\| \(feedMode/);
  assert.match(chart, /const stored = isReplay \? \[\]/);
});
test("chart entry points and header coach use shared replay on the selected timeframe", async () => {
  const dashboard = await readFile(new URL("../components/TradingDashboard.tsx", import.meta.url), "utf8");
  const coach = await readFile(new URL("../components/TradingCoach.tsx", import.meta.url), "utf8");
  const fno = await readFile(new URL("../components/FnoChartWorkspace.tsx", import.meta.url), "utf8");
  const advanced = await readFile(new URL("../components/AdvancedChartWorkspace.tsx", import.meta.url), "utf8");
  assert.match(dashboard, /<NotificationCenter \/>[\s\S]{0,150}header-coach-button/);
  assert.doesNotMatch(dashboard, /className="coach-launch-button"/);
  assert.match(dashboard, /instrument=\{replayInstrument\} timeframe=\{replayReviewTimeframe \?\? timeframe\}/);
  assert.match(dashboard, /setReplayReviewTimeframe\(pnlReviewTimeframe\)/);
  assert.match(coach, /<BarReplay[\s\S]*?initialTimeframe=\{timeframe\}/);
  assert.doesNotMatch(coach, /5-minute historical replay|coach-candle-canvas/);
  assert.match(fno, /onReplay\(topInstrument\)/);
  assert.match(fno, /onReplay\(option\)/);
  assert.match(advanced, /<BarReplayDialog instrument=\{instrument\} timeframe=\{timeframe\}/);
});
