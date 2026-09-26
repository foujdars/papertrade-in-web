import type { Candle } from "./market";

type Bar = Pick<Candle, "time" | "open" | "high" | "low" | "close">;
export type PsbbStatus = "formed" | "success" | "failed";
export type PsbbSetup = {
  side: "long" | "short";
  start: number;
  end: number;
  trigger: number;
  stop: number;
  target1: number;
  target2: number;
  status: PsbbStatus;
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

function outcome(candles: Bar[], from: number, side: "long" | "short", stop: number, target: number): { status: PsbbStatus; end: number } {
  for (let index = from; index < candles.length; index += 1) {
    const bar = candles[index];
    const stopped = side === "long" ? bar.low <= stop : bar.high >= stop;
    const won = side === "long" ? bar.high >= target : bar.low <= target;
    if (won && !stopped) return { status: "success", end: index };
    if (stopped) return { status: "failed", end: index };
  }
  return { status: "formed", end: Math.max(from, candles.length - 1) };
}

/** A setup exists as soon as the divergence pivot is confirmed. Later bars mark success or failure. */
export function psbbSetups(candles: Bar[], momentum: number[], inputs: Record<string, number> = {}): PsbbSetup[] {
  const last = Math.max(0, candles.length - 1);
  const span = Math.max(1, inputs.left || 3);
  const oversold = inputs.oversold ?? 30;
  const overbought = inputs.overbought ?? 70;
  const first = inputs.target1 || 1;
  const second = inputs.target2 || 2;
  const setups: PsbbSetup[] = [];
  const add = (side: "long" | "short", newer: number, trigger: number, stop: number) => {
    const formedAt = newer + span;
    if (formedAt >= candles.length || !(side === "long" ? trigger > stop : stop > trigger)) return;
    const risk = Math.abs(trigger - stop);
    const target1 = side === "long" ? trigger + first * risk : trigger - first * risk;
    const target2 = side === "long" ? trigger + second * risk : trigger - second * risk;
    const result = outcome(candles, formedAt, side, stop, target1);
    setups.push({ side, start: candles[newer].time, end: candles[result.end].time, trigger, stop, target1, target2, status: result.status });
  };
  const lows = pivotIndexes(candles, "low", span, last);
  for (let pair = 1; pair < lows.length; pair += 1) {
    const older = lows[pair - 1];
    const newer = lows[pair];
    const swing = Math.max(...candles.slice(older + 1, newer).map((bar) => bar.high));
    if (candles[newer].low < candles[older].low && momentum[newer] > momentum[older] && momentum[newer] <= oversold && Number.isFinite(swing)) add("long", newer, swing, candles[newer].low);
  }
  const highs = pivotIndexes(candles, "high", span, last);
  for (let pair = 1; pair < highs.length; pair += 1) {
    const older = highs[pair - 1];
    const newer = highs[pair];
    const swing = Math.min(...candles.slice(older + 1, newer).map((bar) => bar.low));
    if (candles[newer].high > candles[older].high && momentum[newer] < momentum[older] && momentum[newer] >= overbought && Number.isFinite(swing)) add("short", newer, swing, candles[newer].high);
  }
  return setups.sort((a, b) => a.start - b.start).slice(-8);
}

export function psbbPlots(candles: Bar[], inputs: Record<string, number> = {}) {
  const momentum = rsi(candles.map((bar) => bar.close), Math.max(2, inputs.length || 14));
  return psbbSetups(candles, momentum, inputs);
}
