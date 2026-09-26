import type { Candle } from "./market";

const N = Number.NaN;
const IST = 19_800;
type Bar = Pick<Candle, "time" | "open" | "high" | "low" | "close" | "volume">;

function ema(values: number[], length: number) {
  const alpha = 2 / (length + 1);
  let state = N;
  const seed: number[] = [];
  return values.map((value) => {
    if (!Number.isFinite(value)) return N;
    if (!Number.isFinite(state)) {
      seed.push(value);
      if (seed.length < length) return N;
      state = seed.reduce((sum, item) => sum + item, 0) / length;
      return state;
    }
    state += alpha * (value - state);
    return state;
  });
}

function rma(values: number[], length: number) {
  const alpha = 1 / length;
  let state = N;
  const seed: number[] = [];
  return values.map((value) => {
    if (!Number.isFinite(value)) return N;
    if (!Number.isFinite(state)) {
      seed.push(value);
      if (seed.length < length) return N;
      state = seed.reduce((sum, item) => sum + item, 0) / length;
      return state;
    }
    state += alpha * (value - state);
    return state;
  });
}

function rsi(close: number[], length: number) {
  const change = close.map((value, index) => index ? value - close[index - 1] : N);
  const up = rma(change.map((value) => value > 0 ? value : Number.isFinite(value) ? 0 : N), length);
  const down = rma(change.map((value) => value < 0 ? -value : Number.isFinite(value) ? 0 : N), length);
  return up.map((value, index) => !Number.isFinite(value + down[index]) ? N : down[index] === 0 ? 100 : 100 - 100 / (1 + value / down[index]));
}

function istDate(time: number) {
  return new Date((time + IST) * 1000).toISOString().slice(0, 10);
}

function istMinutes(time: number) {
  const clock = new Date((time + IST) * 1000);
  return clock.getUTCHours() * 60 + clock.getUTCMinutes();
}

export function entryPlots(candles: Bar[], inputs: Record<string, number> = {}) {
  const on = (key: string) => inputs[key] !== 0;
  const close = candles.map((bar) => bar.close);
  const ema21 = ema(close, 21);
  const ema50 = ema(close, 50);
  const fast = ema(close, 12);
  const slow = ema(close, 26);
  const macd = fast.map((value, index) => Number.isFinite(value) && Number.isFinite(slow[index]) ? value - slow[index] : N);
  const signal = ema(macd.map((value) => Number.isFinite(value) ? value : N), 9);
  const histogram = macd.map((value, index) => Number.isFinite(value) && Number.isFinite(signal[index]) ? value - signal[index] : N);
  const strength = rsi(close, 14);
  const tr = candles.map((bar, index) => index ? Math.max(bar.high - bar.low, Math.abs(bar.high - close[index - 1]), Math.abs(bar.low - close[index - 1])) : bar.high - bar.low);
  const averageTrue = rma(tr, 14);
  const mean = close.map((_, index) => {
    if (index < 19) return N;
    const window = close.slice(index - 19, index + 1);
    return window.reduce((sum, value) => sum + value, 0) / 20;
  });
  const deviation = close.map((_, index) => {
    if (!Number.isFinite(mean[index])) return N;
    const window = close.slice(index - 19, index + 1);
    const variance = window.reduce((sum, value) => sum + (value - mean[index]) ** 2, 0) / 20;
    return Math.sqrt(variance);
  });
  const upper = mean.map((value, index) => Number.isFinite(value) ? value + 2 * deviation[index] : N);
  const lower = mean.map((value, index) => Number.isFinite(value) ? value - 2 * deviation[index] : N);
  const width = upper.map((value, index) => Number.isFinite(value) && mean[index] ? (value - lower[index]) / mean[index] : N);
  const gaps = candles.slice(1).map((bar, index) => bar.time - candles[index].time).filter((gap) => gap > 0).sort((a, b) => a - b);
  const step = gaps[Math.floor(gaps.length / 2)] || 86_400;
  const intraday = step < 20 * 3600;
  const openingReady = step <= 15 * 60;
  const vwap = close.map(() => N);
  const long = close.map(() => N);
  const short = close.map(() => N);
  let day = "";
  let dayHigh = N;
  let dayLow = N;
  let previousHigh = N;
  let previousLow = N;
  let volumeSum = 0;
  let priceVolume = 0;
  const opening = new Map<string, { high: number; low: number }>();
  if (openingReady) {
    for (const bar of candles) {
      const minutes = istMinutes(bar.time);
      if (minutes < 9 * 60 + 15 || minutes >= 9 * 60 + 30) continue;
      const date = istDate(bar.time);
      const range = opening.get(date);
      if (!range) opening.set(date, { high: bar.high, low: bar.low });
      else { range.high = Math.max(range.high, bar.high); range.low = Math.min(range.low, bar.low); }
    }
  }
  const opened = new Set<string>();
  for (let index = 0; index < candles.length; index += 1) {
    const bar = candles[index];
    const date = istDate(bar.time);
    if (date !== day) {
      if (day) { previousHigh = dayHigh; previousLow = dayLow; }
      day = date;
      dayHigh = bar.high;
      dayLow = bar.low;
      volumeSum = 0;
      priceVolume = 0;
    } else {
      dayHigh = Math.max(dayHigh, bar.high);
      dayLow = Math.min(dayLow, bar.low);
    }
    const typical = (bar.high + bar.low + bar.close) / 3;
    const volume = Number(bar.volume) > 0 ? Number(bar.volume) : 1;
    priceVolume += typical * volume;
    volumeSum += volume;
    vwap[index] = priceVolume / volumeSum;
    if (index === 0 || index === candles.length - 1) continue;
    const allowedLong = !on("vwap") || !intraday || bar.close >= vwap[index];
    const allowedShort = !on("vwap") || !intraday || bar.close <= vwap[index];
    let buy = false;
    let sell = false;
    if (on("pullback") && Number.isFinite(ema21[index]) && Number.isFinite(ema50[index])) {
      buy ||= ema21[index] > ema50[index] && bar.close > ema50[index] && bar.close > ema21[index] && candles[index - 1].low <= ema21[index - 1] && bar.close > candles[index - 1].close;
      sell ||= ema21[index] < ema50[index] && bar.close < ema50[index] && bar.close < ema21[index] && candles[index - 1].high >= ema21[index - 1] && bar.close < candles[index - 1].close;
    }
    if (on("level") && Number.isFinite(previousHigh) && Number.isFinite(previousLow)) {
      buy ||= bar.close > previousHigh && candles[index - 1].close <= previousHigh;
      sell ||= bar.close < previousLow && candles[index - 1].close >= previousLow;
    }
    if (on("open") && openingReady) {
      const range = opening.get(date);
      const minutes = istMinutes(bar.time);
      if (range && minutes >= 9 * 60 + 30 && !opened.has(date)) {
        if (bar.close > range.high && candles[index - 1].close <= range.high) { buy = true; opened.add(date); }
        else if (bar.close < range.low && candles[index - 1].close >= range.low) { sell = true; opened.add(date); }
      }
    }
    if (on("momentum") && Number.isFinite(strength[index]) && Number.isFinite(histogram[index]) && Number.isFinite(ema50[index])) {
      buy ||= strength[index - 1] < 40 && strength[index] >= 40 && bar.close > ema50[index] && histogram[index] > histogram[index - 1];
      sell ||= strength[index - 1] > 60 && strength[index] <= 60 && bar.close < ema50[index] && histogram[index] < histogram[index - 1];
    }
    if (on("squeeze") && index >= 40 && Number.isFinite(width[index - 1]) && Number.isFinite(averageTrue[index])) {
      const recent = width.slice(Math.max(0, index - 20), index).filter(Number.isFinite);
      const tight = recent.length >= 10 && width[index - 1] < recent.reduce((sum, value) => sum + value, 0) / recent.length * 0.8;
      if (tight && averageTrue[index] > averageTrue[index - 1]) {
        buy ||= bar.close > upper[index];
        sell ||= bar.close < lower[index];
      }
    }
    if (buy && !sell && allowedLong) long[index] = bar.low;
    else if (sell && !buy && allowedShort) short[index] = bar.high;
  }
  return { ema21, ema50, vwap, long, short };
}
