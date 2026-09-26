import type { Candle } from "./market";

type Bar = Pick<Candle, "open" | "high" | "low" | "close">;
export type StrategyPlots = { entry: number[]; stop: number[]; target: number[]; long: number[]; short: number[] };
type Setup = { index: number; side: "long" | "short"; entry: number; stop: number; target: number };

const blank = (count: number) => Array.from({ length: count }, () => Number.NaN);
const green = (bar: Bar) => bar.close >= bar.open;

function ema(values: number[], length: number) {
  const k = 2 / (length + 1);
  let state = Number.NaN;
  const seed: number[] = [];
  return values.map((value) => {
    if (!Number.isFinite(value)) return Number.NaN;
    if (!Number.isFinite(state)) {
      seed.push(value);
      if (seed.length < length) return Number.NaN;
      state = seed.reduce((sum, item) => sum + item, 0) / length;
      return state;
    }
    state += k * (value - state);
    return state;
  });
}

function sma(values: number[], length: number) {
  return values.map((_, index) => {
    if (index < length - 1) return Number.NaN;
    const window = values.slice(index - length + 1, index + 1);
    return window.every(Number.isFinite) ? window.reduce((sum, item) => sum + item, 0) / length : Number.NaN;
  });
}

function finish(candles: Bar[], setups: Setup[]): StrategyPlots {
  const result: StrategyPlots = { entry: blank(candles.length), stop: blank(candles.length), target: blank(candles.length), long: blank(candles.length), short: blank(candles.length) };
  for (const setup of setups) result[setup.side][setup.index] = setup.entry;
  const latest = setups.at(-1);
  if (!latest) return result;
  for (let index = latest.index; index < candles.length; index += 1) {
    result.entry[index] = latest.entry;
    result.stop[index] = latest.stop;
    result.target[index] = latest.target;
    if (index === latest.index) continue;
    const bar = candles[index];
    const hit = latest.side === "long" ? bar.low <= latest.stop || bar.high >= latest.target : bar.high >= latest.stop || bar.low <= latest.target;
    if (hit) break;
  }
  return result;
}

/** Published marketplace rules. The last, still-forming candle is never a signal. */
export function strategyPlots(candles: Bar[], id: string, inputs: Record<string, number> = {}): StrategyPlots {
  const last = Math.max(0, candles.length - 1);
  const setups: Setup[] = [];
  if (id === "zing-inside") {
    const reward = inputs.reward || 2;
    const chase = (inputs.chase ?? 35) / 100;
    for (let index = 2; index < last; index += 1) {
      const mother = candles[index - 2];
      const baby = candles[index - 1];
      const bar = candles[index];
      const range = mother.high - mother.low;
      const inside = baby.high <= mother.high && baby.low >= mother.low && (baby.high < mother.high || baby.low > mother.low);
      if (!inside || !(range > 0)) continue;
      if (bar.close > mother.high && bar.close <= mother.high + range * chase) setups.push({ index, side: "long", entry: bar.close, stop: mother.low, target: bar.close + reward * (bar.close - mother.low) });
      else if (bar.close < mother.low && bar.close >= mother.low - range * chase) setups.push({ index, side: "short", entry: bar.close, stop: mother.high, target: bar.close - reward * (mother.high - bar.close) });
    }
  } else if (id === "zing-traffic") {
    const reward = inputs.reward || 1.2;
    const buffer = (inputs.buffer ?? 0.01) / 100;
    const average = sma(candles.map((bar) => bar.close), Math.max(2, inputs.length || 15));
    for (let index = 2; index < last; index += 1) {
      const first = candles[index - 2];
      const second = candles[index - 1];
      const bar = candles[index];
      if (green(first) === green(second) || !Number.isFinite(average[index])) continue;
      const top = Math.max(first.high, second.high);
      const bottom = Math.min(first.low, second.low);
      const range = top - bottom;
      if (!(range > 0)) continue;
      if (bar.close > top && bar.close > average[index]) setups.push({ index, side: "long", entry: bar.close, stop: bottom * (1 - buffer), target: bar.close + range * reward });
      else if (bar.close < bottom && bar.close < average[index]) setups.push({ index, side: "short", entry: bar.close, stop: top * (1 + buffer), target: bar.close - range * reward });
    }
  } else if (id === "zing-ema") {
    const fast = ema(candles.map((bar) => bar.close), Math.max(2, inputs.fast || 9));
    const slow = ema(candles.map((bar) => bar.close), Math.max(3, inputs.slow || 21));
    const stopPoints = inputs.stop || 10;
    const targetPoints = inputs.target || 12;
    for (let index = 1; index < last; index += 1) {
      if (![fast[index - 1], slow[index - 1], fast[index], slow[index]].every(Number.isFinite)) continue;
      const bar = candles[index];
      if (fast[index - 1] <= slow[index - 1] && fast[index] > slow[index]) setups.push({ index, side: "long", entry: bar.close, stop: bar.close - stopPoints, target: bar.close + targetPoints });
      else if (fast[index - 1] >= slow[index - 1] && fast[index] < slow[index]) setups.push({ index, side: "short", entry: bar.close, stop: bar.close + stopPoints, target: bar.close - targetPoints });
    }
  }
  return finish(candles, setups);
}
