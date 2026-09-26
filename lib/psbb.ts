import type { Candle } from "./market";

type Bar = Pick<Candle, "time" | "open" | "high" | "low" | "close">;
export type PsbbStatus = "active" | "formed" | "passed" | "failed";
export type PsbbSetup = {
  side: "long" | "short";
  status: PsbbStatus;
  firstTime: number;
  secondTime: number;
  end: number;
  firstPrice: number;
  secondPrice: number;
  firstRsi: number;
  secondRsi: number;
  entry: number;
  stop: number;
  target1: number;
  target2: number;
  shifted: boolean;
};

const rma = (values: number[], length: number) => {
  const alpha = 1 / length;
  let state = Number.NaN;
  const seed: number[] = [];
  return values.map((value) => {
    if (!Number.isFinite(value)) { state = Number.NaN; seed.length = 0; return Number.NaN; }
    if (!Number.isFinite(state)) {
      seed.push(value);
      if (seed.length < length) return Number.NaN;
      state = seed.reduce((sum, item) => sum + item, 0) / length;
      return state;
    }
    state += alpha * (value - state);
    return state;
  });
};

function rsi(closes: number[], length: number) {
  const change = closes.map((value, index) => index ? value - closes[index - 1] : Number.NaN);
  const up = rma(change.map((value) => Number.isFinite(value) ? Math.max(value, 0) : Number.NaN), length);
  const down = rma(change.map((value) => Number.isFinite(value) ? Math.max(-value, 0) : Number.NaN), length);
  return up.map((value, index) => {
    const loss = down[index];
    if (!Number.isFinite(value) || !Number.isFinite(loss)) return Number.NaN;
    if (loss === 0) return value === 0 ? 50 : 100;
    return 100 - 100 / (1 + value / loss);
  });
}

function pivotIndexes(candles: Bar[], side: "low" | "high", span: number, last: number) {
  const indexes: number[] = [];
  for (let index = span; index + span < last; index += 1) {
    const value = candles[index][side];
    let extreme = true;
    for (let cursor = index - span; cursor <= index + span; cursor += 1) {
      if (cursor === index) continue;
      const worse = side === "low" ? candles[cursor].low <= value : candles[cursor].high >= value;
      if (worse) { extreme = false; break; }
    }
    if (extreme) indexes.push(index);
  }
  return indexes;
}

function outcome(candles: Bar[], from: number, side: "long" | "short", entry: number, stop: number, target: number): { status: PsbbStatus; end: number; shifted: boolean } {
  let shifted = false;
  for (let index = from; index < candles.length; index += 1) {
    const bar = candles[index];
    const broke = side === "long" ? bar.close > entry : bar.close < entry;
    const stopped = side === "long" ? bar.low <= stop : bar.high >= stop;
    const won = side === "long" ? bar.high >= target : bar.low <= target;
    if (!shifted) {
      if (!broke) continue;
      shifted = true;
    }
    if (won && !stopped) return { status: "passed", end: index, shifted };
    if (stopped) return { status: "failed", end: index, shifted };
  }
  return { status: shifted ? "formed" : "active", end: candles.length - 1, shifted };
}

/** Positive divergence: price lower low, RSI higher low. Negative: price higher high, RSI lower high. Entry is the structure shift. */
export function psbbSetups(candles: Bar[], momentum: number[], inputs: Record<string, number> = {}): PsbbSetup[] {
  const last = Math.max(0, candles.length - 1);
  const span = Math.max(1, inputs.left || 3);
  const oversold = inputs.oversold ?? 30;
  const overbought = inputs.overbought ?? 70;
  const firstMultiple = inputs.target1 || 1;
  const secondMultiple = inputs.target2 || 1.5;
  const setups: PsbbSetup[] = [];
  const add = (side: "long" | "short", older: number, newer: number, entry: number) => {
    const stop = side === "long" ? candles[newer].low : candles[newer].high;
    if (!(side === "long" ? entry > stop : stop > entry)) return;
    const risk = Math.abs(entry - stop);
    const target1 = side === "long" ? entry + firstMultiple * risk : entry - firstMultiple * risk;
    const target2 = side === "long" ? entry + secondMultiple * risk : entry - secondMultiple * risk;
    const result = outcome(candles, newer + span, side, entry, stop, target1);
    setups.push({
      side, status: result.status, shifted: result.shifted,
      firstTime: candles[older].time, secondTime: candles[newer].time, end: candles[result.end].time,
      firstPrice: side === "long" ? candles[older].low : candles[older].high,
      secondPrice: stop,
      firstRsi: momentum[older], secondRsi: momentum[newer],
      entry, stop, target1, target2,
    });
  };
  const lows = pivotIndexes(candles, "low", span, last);
  const highs = pivotIndexes(candles, "high", span, last);
  for (let pair = 1; pair < lows.length; pair += 1) {
    const older = lows[pair - 1];
    const newer = lows[pair];
    const between = candles.slice(older + 1, newer);
    if (!between.length || !(candles[newer].low < candles[older].low) || !(momentum[newer] > momentum[older]) || !(momentum[older] <= oversold)) continue;
    add("long", older, newer, Math.max(...between.map((bar) => bar.high)));
  }
  for (let pair = 1; pair < highs.length; pair += 1) {
    const older = highs[pair - 1];
    const newer = highs[pair];
    const between = candles.slice(older + 1, newer);
    if (!between.length || !(candles[newer].high > candles[older].high) || !(momentum[newer] < momentum[older]) || !(momentum[older] >= overbought)) continue;
    add("short", older, newer, Math.min(...between.map((bar) => bar.low)));
  }
  return setups.sort((a, b) => a.secondTime - b.secondTime).slice(-4);
}

export function psbbPlots(candles: Bar[], inputs: Record<string, number> = {}) {
  const momentum = rsi(candles.map((bar) => bar.close), Math.max(2, inputs.length || 14));
  return psbbSetups(candles, momentum, inputs);
}
