import test from "node:test";
import assert from "node:assert/strict";
import { filterCandlePatterns, findCandlePatterns, spreadPatternTags } from "../lib/candle-patterns.ts";

const bar = (time, open, high, low, close) => ({ time, open, high, low, close });

function drift(start, step, count) {
  return Array.from({ length: count }, (_, index) => {
    const close = start + step * index;
    const open = close - step * 0.7;
    const high = Math.max(open, close) + Math.abs(step) * 0.15;
    const low = Math.min(open, close) - Math.abs(step) * 0.15;
    return bar(index + 1, open, high, low, close);
  });
}

test("names a hammer only after a decline", () => {
  const candles = [...drift(120, -2, 6), bar(7, 108, 108.4, 103, 107.6)];
  const names = findCandlePatterns(candles).map((hit) => hit.name);
  assert.ok(names.includes("Hammer"));
  assert.equal(names.includes("Hanging man"), false);
});

test("names a bearish engulfing after a rise and keeps one label on that candle", () => {
  const rise = drift(100, 2, 6);
  const previous = rise.at(-1);
  const candles = [...rise, bar(7, previous.high + 0.4, previous.high + 0.8, previous.low - 0.8, previous.low - 0.4)];
  const hits = findCandlePatterns(candles);
  const last = hits.filter((hit) => hit.time === 7);
  assert.deepEqual(last.map((hit) => hit.name), ["Bearish engulfing"]);
  assert.equal(last[0].bias, "bearish");
});

test("filter keeps the chosen direction and hides named patterns", () => {
  const hits = [
    { id: "a", name: "Hammer", bias: "bullish", time: 1, index: 0, note: "" },
    { id: "b", name: "Doji", bias: "neutral", time: 2, index: 1, note: "" },
    { id: "c", name: "Shooting star", bias: "bearish", time: 3, index: 2, note: "" },
  ];
  assert.deepEqual(filterCandlePatterns(hits, "bearish", []).map((hit) => hit.name), ["Shooting star"]);
  assert.deepEqual(filterCandlePatterns(hits, "all", ["Doji"]).map((hit) => hit.name), ["Hammer", "Shooting star"]);
});

test("names a morning star and explains it", () => {
  const candles = [...drift(130, -2, 6), bar(7, 120, 120.3, 116, 116.4), bar(8, 116.2, 116.8, 115.6, 116.5), bar(9, 116.6, 120.8, 116.2, 120.2)];
  const hit = findCandlePatterns(candles).find((item) => item.name === "Morning star");
  assert.ok(hit);
  assert.match(hit.note, /pause/);
  assert.equal(hit.bias, "bullish");
});

test("does not invent a pattern on a plain trend", () => {
  assert.deepEqual(findCandlePatterns(drift(100, 1, 12)).map((hit) => hit.name), []);
});

test("moves a second label off a neighbour on the same candles", () => {
  const [first, second] = spreadPatternTags([
    { name: "Hanging man", x: 100, y: 80, above: true },
    { name: "Doji", x: 118, y: 86, above: true },
  ]);
  assert.equal(first.y, 80);
  assert.ok(second.y < first.y);
});
