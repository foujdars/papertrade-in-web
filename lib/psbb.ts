import type { Candle } from "./market";

type Bar = Pick<Candle, "open" | "high" | "low" | "close">;
export type PsbbPlots = { entry: number[]; stop: number[]; target1: number[]; target2: number[]; long: number[]; short: number[] };
type Setup = { index: number; side: "long" | "short"; entry: number; stop: number; target1: number; target2: number };

const blank = (count: number) => Array.from({ length: count }, () => Number.NaN);

function rma(values: number[], length: number) {
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
}

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

/** Public Bread & Butter rules: RSI divergence, then a closing break of the swing between the two pivots. */
export function psbbFromRsi(candles: Bar[], momentum: number[], inputs: Record<string, number> = {}): PsbbPlots {
  const last = Math.max(0, candles.length - 1);
  const span = Math.max(1, inputs.left || 3);
  const oversold = inputs.oversold ?? 30;
  const overbought = inputs.overbought ?? 70;
  const first = inputs.target1 || 1;
  const second = inputs.target2 || 2;
  const window = Math.max(1, inputs.window || 30);
  const setups: Setup[] = [];
  const lows = pivotIndexes(candles, "low", span, last);
  for (let pair = 1; pair < lows.length; pair += 1) {
    const older = lows[pair - 1];
    const newer = lows[pair];
    if (!(candles[newer].low < candles[older].low) || !(momentum[newer] > momentum[older]) || !(momentum[newer] <= oversold)) continue;
    const swing = Math.max(...candles.slice(older + 1, newer).map((bar) => bar.high));
    if (!Number.isFinite(swing)) continue;
    for (let index = newer + span; index < Math.min(last, newer + span + window); index += 1) {
      if (candles[index].low < candles[newer].low) break;
      if (candles[index].close <= swing) continue;
      const risk = candles[index].close - candles[newer].low;
      if (risk > 0) setups.push({ index, side: "long", entry: candles[index].close, stop: candles[newer].low, target1: candles[index].close + first * risk, target2: candles[index].close + second * risk });
      break;
    }
  }
  const highs = pivotIndexes(candles, "high", span, last);
  for (let pair = 1; pair < highs.length; pair += 1) {
    const older = highs[pair - 1];
    const newer = highs[pair];
    if (!(candles[newer].high > candles[older].high) || !(momentum[newer] < momentum[older]) || !(momentum[newer] >= overbought)) continue;
    const swing = Math.min(...candles.slice(older + 1, newer).map((bar) => bar.low));
    if (!Number.isFinite(swing)) continue;
    for (let index = newer + span; index < Math.min(last, newer + span + window); index += 1) {
      if (candles[index].high > candles[newer].high) break;
      if (candles[index].close >= swing) continue;
      const risk = candles[newer].high - candles[index].close;
      if (risk > 0) setups.push({ index, side: "short", entry: candles[index].close, stop: candles[newer].high, target1: candles[index].close - first * risk, target2: candles[index].close - second * risk });
      break;
    }
  }
  setups.sort((a, b) => a.index - b.index);
  const result: PsbbPlots = { entry: blank(candles.length), stop: blank(candles.length), target1: blank(candles.length), target2: blank(candles.length), long: blank(candles.length), short: blank(candles.length) };
  for (const setup of setups) result[setup.side][setup.index] = setup.entry;
  const latest = setups.at(-1);
  if (!latest) return result;
  for (let index = latest.index; index < candles.length; index += 1) {
    result.entry[index] = latest.entry;
    result.stop[index] = latest.stop;
    result.target1[index] = latest.target1;
    result.target2[index] = latest.target2;
    if (index === latest.index) continue;
    const bar = candles[index];
    const done = latest.side === "long" ? bar.low <= latest.stop || bar.high >= latest.target2 : bar.high >= latest.stop || bar.low <= latest.target2;
    if (done) break;
  }
  return result;
}

export function psbbPlots(candles: Bar[], inputs: Record<string, number> = {}) {
  return psbbFromRsi(candles, rsi(candles.map((bar) => bar.close), Math.max(2, inputs.length || 14)), inputs);
}
