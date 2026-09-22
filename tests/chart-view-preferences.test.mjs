import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";
import { SMC_LESSONS } from "../lib/smc-learner.ts";
import { DEFAULT_CHART_STYLE, isChartStyle } from "../lib/chart-style.ts";
import { sanitizeComparedSymbols } from "../lib/chart-compare.ts";

const code = ts.transpileModule(await readFile(new URL("../lib/chart-view-preferences.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const KEY = "papertrade-chart-view-v1";
function device(initial = null) {
  let raw = initial;
  let unavailable = false;
  const window = new EventTarget();
  const storage = { getItem: () => { if (unavailable) throw Error("blocked"); return raw; }, setItem: (_, value) => { if (unavailable) throw Error("blocked"); raw = value; } };
  const load = () => {
    const exports = {};
    new Function("require", "exports", "window", "localStorage", code)(id => {
      if (id === "react") return {
        useCallback: callback => callback,
        useSyncExternalStore: (_subscribe, read) => read(),
      };
      if (id === "./smc-learner") return { SMC_LESSONS };
      if (id === "./chart-style") return { DEFAULT_CHART_STYLE, isChartStyle };
      if (id === "./chart-compare") return { sanitizeComparedSymbols };
      return {};
    }, exports, window, storage);
    return exports.useChartPreference;
  };
  return { load, raw: () => raw, block: () => { unavailable = true; }, external: value => { raw = value; } };
}

test("chart view choices survive fresh modules/restarts, including no SMC filters", () => {
  const d = device(), use = d.load();
  use("magnet")[1](true);
  use("hidden")[1](true);
  use("smcFilters")[1]([]);
  use("smcRange")[1](true);
  use("smcLesson")[1]("CHoCH");
  use("drawingFavorites")[1](["long-position", "xabcd-pattern"]);
  use("showDrawingFavorites")[1](false);
  use("chartStyle")[1]("heikin-ashi");
  use("comparedSymbols")[1]([{ instrumentKey: "DELTA|SPYXUSD", symbol: "SPYXUSD", name: "S&P 500", exchange: "DELTA" }]);
  const restarted = d.load();
  assert.equal(restarted("magnet")[0], true);
  assert.equal(restarted("hidden")[0], true);
  assert.deepEqual(restarted("smcFilters")[0], []);
  assert.equal(restarted("smcRange")[0], true);
  assert.equal(restarted("smcLesson")[0], "CHoCH");
  assert.deepEqual(restarted("drawingFavorites")[0], ["long-position", "xabcd-pattern"]);
  assert.equal(restarted("showDrawingFavorites")[0], false);
  assert.equal(restarted("chartStyle")[0], "heikin-ashi");
  assert.equal(restarted("comparedSymbols")[0][0].symbol, "SPYXUSD");
  restarted("drawingFavorites")[1]([]);
  assert.deepEqual(d.load()("drawingFavorites")[0], []);
  restarted("magnet")[1](v => !v);
  assert.equal(d.load()("magnet")[0], false);
  assert.equal(JSON.parse(d.raw()).hidden, true);
});

test("partial and invalid preferences are sanitized; defaults only fill missing fields", () => {
  const d = device(JSON.stringify({ magnet: "false", hidden: true, smcFilters: ["FVG", "unknown", "FVG"], smcLesson: "__proto__", chartStyle: "kagi", comparedSymbols: [{ instrumentKey: "bad", symbol: "X" }] }));
  const use = d.load();
  assert.deepEqual(use("smcFilters")[0], ["FVG"]);
  assert.equal(use("magnet")[0], false);
  assert.equal(use("hidden")[0], true);
  assert.equal(use("smcLesson")[0], "FVG");
  assert.equal(use("chartStyle")[0], "candles");
  assert.deepEqual(use("comparedSymbols")[0], []);
  d.external("bad json");
  assert.equal(use("hidden")[0], false);
  assert.equal(use("smcFilters")[0].length, 5);
});

test("functional updates share current state and blocked storage retains session choices", () => {
  const d = device(), a = d.load(), b = d.load();
  a("magnet")[1](true);
  assert.equal(b("magnet")[0], true);
  b("hidden")[1](true);
  assert.equal(a("hidden")[0], true);
  assert.equal(a("magnet")[0], true);
  d.block();
  a("magnet")[1](false);
  a("smcFilters")[1]([]);
  assert.equal(a("magnet")[0], false);
  assert.deepEqual(a("smcFilters")[0], []);
});
