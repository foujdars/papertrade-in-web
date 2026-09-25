export type PatternBias = "bullish" | "bearish" | "neutral";

export type CandlePatternHit = {
  id: string;
  name: string;
  bias: PatternBias;
  time: number;
  index: number;
  note: string;
};

type Bar = { open: number; high: number; low: number; close: number; time: number };

const NOTES: Record<string, string> = {
  Doji: "Open and close are almost the same. That candle did not choose a side.",
  Hammer: "A long lower wick after a fall. The close recovered most of the drop.",
  "Hanging man": "A long lower wick after a rise. The same shape is less convincing up here.",
  "Shooting star": "A long upper wick after a rise. The close gave back most of the push.",
  "Inverted hammer": "A long upper wick after a fall. Price was tested higher, then settled.",
  "Bullish engulfing": "A green body fully covers the previous red body.",
  "Bearish engulfing": "A red body fully covers the previous green body.",
  "Morning star": "A fall, a small pause, then a green close back through the first candle.",
  "Evening star": "A rise, a small pause, then a red close back through the first candle.",
  "Three white soldiers": "Three green candles in a row, each closing higher.",
  "Three black crows": "Three red candles in a row, each closing lower.",
  "Piercing line": "A green candle closes back above the middle of the previous red candle.",
  "Dark cloud": "A red candle closes back below the middle of the previous green candle.",
};

const body = (c: Bar) => Math.abs(c.close - c.open);
const span = (c: Bar) => c.high - c.low;
const upper = (c: Bar) => c.high - Math.max(c.open, c.close);
const lower = (c: Bar) => Math.min(c.open, c.close) - c.low;
const bull = (c: Bar) => c.close > c.open;
const bear = (c: Bar) => c.close < c.open;
const top = (c: Bar) => Math.max(c.open, c.close);
const bottom = (c: Bar) => Math.min(c.open, c.close);
const mid = (c: Bar) => (c.open + c.close) / 2;

function trend(bars: Bar[], before: number): "up" | "down" | "flat" {
  const look = 4;
  if (before < look) return "flat";
  const from = bars[before - look].close;
  const to = bars[before - 1].close;
  if (!from) return "flat";
  const change = (to - from) / Math.abs(from);
  if (change >= 0.004) return "up";
  if (change <= -0.004) return "down";
  return "flat";
}

function realBody(c: Bar) {
  const height = span(c);
  return height > 0 && body(c) / height >= 0.45;
}

export function findCandlePatterns(candles: Bar[]): CandlePatternHit[] {
  const hits: CandlePatternHit[] = [];
  const used = new Set<number>();
  const add = (index: number, name: string, bias: PatternBias) => {
    if (used.has(index) || !NOTES[name]) return;
    const bar = candles[index];
    if (!bar || !Number.isFinite(bar.time)) return;
    used.add(index);
    hits.push({ id: `${name}-${bar.time}`, name, bias, time: bar.time, index, note: NOTES[name] });
  };

  for (let i = 0; i < candles.length; i += 1) {
    const current = candles[i];
    const previous = candles[i - 1];
    const older = candles[i - 2];
    if (older && realBody(older)) {
      const before = trend(candles, i - 2);
      const pause = body(previous) <= body(older) * 0.45;
      if (before === "down" && bear(older) && pause && bull(current) && realBody(current) && current.close > mid(older) && current.close > previous.close) add(i, "Morning star", "bullish");
      if (before === "up" && bull(older) && pause && bear(current) && realBody(current) && current.close < mid(older) && current.close < previous.close) add(i, "Evening star", "bearish");
    }
    if (older && previous && bull(older) && bull(previous) && bull(current) && realBody(older) && realBody(previous) && realBody(current) && current.close > previous.close && previous.close > older.close && previous.open >= bottom(older) && previous.open <= top(older) && current.open >= bottom(previous) && current.open <= top(previous) && trend(candles, i - 2) !== "up") add(i, "Three white soldiers", "bullish");
    if (older && previous && bear(older) && bear(previous) && bear(current) && realBody(older) && realBody(previous) && realBody(current) && current.close < previous.close && previous.close < older.close && previous.open <= top(older) && previous.open >= bottom(older) && current.open <= top(previous) && current.open >= bottom(previous) && trend(candles, i - 2) !== "down") add(i, "Three black crows", "bearish");

    if (previous && realBody(previous) && realBody(current)) {
      const before = trend(candles, i - 1);
      const covers = bottom(current) <= bottom(previous) && top(current) >= top(previous) && body(current) > body(previous);
      if (before !== "up" && bear(previous) && bull(current) && covers) add(i, "Bullish engulfing", "bullish");
      if (before !== "down" && bull(previous) && bear(current) && covers) add(i, "Bearish engulfing", "bearish");
      if (before === "down" && bear(previous) && bull(current) && current.open <= previous.close && current.close > mid(previous) && current.close < previous.open) add(i, "Piercing line", "bullish");
      if (before === "up" && bull(previous) && bear(current) && current.open >= previous.close && current.close < mid(previous) && current.close > previous.open) add(i, "Dark cloud", "bearish");
    }

    const height = span(current);
    if (height <= 0 || used.has(i)) continue;
    const before = trend(candles, i);
    const bodyShare = body(current) / height;
    const smallUpper = upper(current) <= Math.max(body(current) * 1.2, height * 0.18);
    const smallLower = lower(current) <= Math.max(body(current) * 1.2, height * 0.18);
    const longLower = lower(current) >= Math.max(body(current) * 2, height * 0.5) && smallUpper && lower(current) / height >= 0.55 && bodyShare <= 0.4;
    const longUpper = upper(current) >= Math.max(body(current) * 2, height * 0.5) && smallLower && upper(current) / height >= 0.55 && bodyShare <= 0.4;
    if (longLower && before === "down") add(i, "Hammer", "bullish");
    else if (longLower && before === "up") add(i, "Hanging man", "bearish");
    else if (longUpper && before === "up") add(i, "Shooting star", "bearish");
    else if (longUpper && before === "down") add(i, "Inverted hammer", "bullish");
    else if (bodyShare <= 0.1) add(i, "Doji", "neutral");
  }
  return hits;
}
