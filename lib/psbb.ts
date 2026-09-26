import type { Candle } from "./market";

type Bar = Pick<Candle, "time" | "open" | "high" | "low" | "close">;
export type PsbbStatus = "active" | "formed" | "passed" | "failed";
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

function outcome(candles: Bar[], from: number, side: "long" | "short", trigger: number, stop: number, target: number): { status: PsbbStatus; end: number } | null {
  let broken = false;
  for (let index = from; index < candles.length; index += 1) {
    const bar = candles[index];
    const broke = side === "long" ? bar.close > trigger : bar.close < trigger;
    const stopped = side === "long" ? bar.low <= stop : bar.high >= stop;
    const won = side === "long" ? bar.high >= target : bar.low <= target;
    if (!broken) {
      if (!broke) {
        if (stopped) return null;
        continue;
      }
      broken = true;
    }
    if (won && !stopped) return { status: "passed", end: index };
    if (stopped) return { status: "failed", end: index };
  }
  return { status: broken ? "formed" : "active", end: Math.max(from, candles.length - 1) };
}

/** ACTIVE while RSI is beyond 30 or 70. FORMED on the structure break. PASSED if the target is hit, otherwise FAILED. */
export function psbbSetups(candles: Bar[], momentum: number[], inputs: Record<string, number> = {}): PsbbSetup[] {
  const last = Math.max(0, candles.length - 1);
  const span = Math.max(1, inputs.left || 3);
  const oversold = inputs.oversold ?? 30;
  const overbought = inputs.overbought ?? 70;
  const first = inputs.target1 || 1;
  const second = inputs.target2 || 2;
  const setups: PsbbSetup[] = [];
  const add = (side: "long" | "short", newer: number, trigger: number, stop: number, from = newer + span) => {
    const formedAt = Math.max(newer, Math.min(from, candles.length - 1));
    if (!(side === "long" ? trigger > stop : stop > trigger)) return;
    const risk = Math.abs(trigger - stop);
    const target1 = side === "long" ? trigger + first * risk : trigger - first * risk;
    const target2 = side === "long" ? trigger + second * risk : trigger - second * risk;
    const result = outcome(candles, formedAt, side, trigger, stop, target1);
    if (!result) return;
    setups.push({ side, start: candles[newer].time, end: candles[result.end].time, trigger, stop, target1, target2, status: result.status });
  };
  const lows = pivotIndexes(candles, "low", span, last);
  const highs = pivotIndexes(candles, "high", span, last);
  for (const newer of lows) {
    if (!(momentum[newer] <= oversold)) continue;
    const structure = [...highs].reverse().find((index) => index < newer);
    const trigger = structure == null ? Math.max(...candles.slice(Math.max(0, newer - span), newer + 1).map((bar) => bar.high)) : candles[structure].high;
    add("long", newer, trigger, candles[newer].low);
  }
  for (const newer of highs) {
    if (!(momentum[newer] >= overbought)) continue;
    const structure = [...lows].reverse().find((index) => index < newer);
    const trigger = structure == null ? Math.min(...candles.slice(Math.max(0, newer - span), newer + 1).map((bar) => bar.low)) : candles[structure].low;
    add("short", newer, trigger, candles[newer].high);
  }
  const live = momentum[candles.length - 1];
  if (Number.isFinite(live) && (live <= oversold || live >= overbought)) {
    const side = live <= oversold ? "long" : "short";
    let from = candles.length - 1;
    while (from > 0 && (side === "long" ? momentum[from - 1] <= oversold : momentum[from - 1] >= overbought)) from -= 1;
    if (!setups.some((setup) => setup.side === side && setup.status === "active" && setup.start >= candles[from].time)) {
      const zone = candles.slice(from);
      const stop = side === "long" ? Math.min(...zone.map((bar) => bar.low)) : Math.max(...zone.map((bar) => bar.high));
      const structure = candles.slice(Math.max(0, from - span), from + 1);
      const trigger = side === "long" ? Math.max(...structure.map((bar) => bar.high)) : Math.min(...structure.map((bar) => bar.low));
      add(side, from, trigger, stop, from);
    }
  }
  return setups.sort((a, b) => a.start - b.start).slice(-8);
}

export function psbbPlots(candles: Bar[], inputs: Record<string, number> = {}) {
  const momentum = rsi(candles.map((bar) => bar.close), Math.max(2, inputs.length || 14));
  return psbbSetups(candles, momentum, inputs);
}
