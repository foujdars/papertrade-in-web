import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const source = await readFile(new URL("../app/api/upstox/candles/route.ts", import.meta.url), "utf8");
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;

function route() {
  const paths = [];
  const exports = {};
  const payload = { status: "success", data: { candles: [
    ["2025-01-01T00:00:00+05:30", 100, 110, 90, 105, 10],
    ["2025-02-01T00:00:00+05:30", 105, 115, 101, 111, 20],
    ["2026-01-01T00:00:00+05:30", 111, 120, 108, 118, 30],
  ] } };
  new Function("require", "exports", code)((id) => {
    if (id === "@/lib/upstox") return { isSupportedNseInstrumentKey: () => true };
    if (id === "@/lib/upstox-server") return {
      upstoxFetch: async (path) => { paths.push(path); return payload; },
      upstoxFreshFetch: async (path) => { paths.push(path); return payload; },
      upstoxErrorResponse: (error) => Response.json({ ok: false, error: String(error) }, { status: 502 }),
    };
    throw Error(`Unexpected import ${id}`);
  }, exports);
  return { get: exports.GET, paths };
}

test("1Y candles request only published Upstox history and aggregate monthly bars", async () => {
  const { get, paths } = route();
  const response = await get(new Request("https://example.test/api/upstox/candles?instrumentKey=NSE_EQ%7CINE002A01018&timeframe=1Y"));
  const body = await response.json();
  assert.equal(response.status, 200, JSON.stringify({ body, paths }));
  assert.match(paths[0], /\/months\/1\/\d{4}-\d{2}-\d{2}\/2000-01-01$/);
  assert.equal(body.candles.length, 2);
  assert.deepEqual([body.candles[0].open, body.candles[0].high, body.candles[0].low, body.candles[0].close, body.candles[0].volume], [100, 115, 90, 111, 30]);
});
