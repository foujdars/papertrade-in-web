export type NimbleStrategy =
  | "ema-retest"
  | "ema-breakdown"
  | "rsi-divergence-break"
  | "ema-5-reversal"
  | "weekly-fakeout-mtf"
  | "bollinger-double-reversal"
  | "macd-orb"
  | "adx-golden-cross"
  | "macd-triple-ema"
  | "ema-30-50-100"
  | "rsi-divergence-daily";

export type ScannerTimeframe = 5 | 15 | "1D";

export type NimbleCandle = {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type NimbleMatch = {
  signal: "long" | "short" | "breakdown";
  entry?: number;
  stopLoss?: number;
  target1?: number;
  ema21: number;
  ema5: number;
  rsi14: number;
  setupStatus?: "alert" | "triggered";
  barsSinceCross?: number;
  rangeHigh?: number;
  rangeLow?: number;
  indicatorValue?: number;
};

export type TechnicalScannerRow = {
  symbol: string;
  name: string;
  instrumentKey: string;
  lastPrice: number;
  changePercent: number;
  signal: NimbleMatch["signal"];
  timeframe: ScannerTimeframe;
  setupStatus?: NimbleMatch["setupStatus"];
  entry?: number;
  stopLoss?: number;
  target1?: number;
  indicatorValue?: number;
};

export const NIMBLE_STRATEGIES: Record<NimbleStrategy, { label: string; timeframe: ScannerTimeframe; description: string }> = {
  "ema-retest": { label: "EMA 21 Retest", timeframe: 5, description: "EMA 21 cross, hold and retest confirmation" },
  "ema-breakdown": { label: "EMA 21 Breakdown", timeframe: 5, description: "Completed candle below EMA 21" },
  "rsi-divergence-break": { label: "RSI Divergence", timeframe: 5, description: "RSI divergence with price-structure break" },
  "ema-5-reversal": { label: "5 EMA Reversal", timeframe: 5, description: "5 EMA reversal alert or trigger" },
  "weekly-fakeout-mtf": { label: "Weekly Fakeout MTF", timeframe: 15, description: "Previous-week range fakeout with 15m trigger" },
  "bollinger-double-reversal": { label: "Bollinger Double Reversal", timeframe: 5, description: "Double reversal at a Bollinger band" },
  "macd-orb": { label: "MACD ORB", timeframe: 5, description: "Opening-range breakout confirmed by MACD" },
  "adx-golden-cross": { label: "ADX Golden Cross", timeframe: 15, description: "EMA 50/200 bullish cross with ADX above 25" },
  "macd-triple-ema": { label: "MACD Triple EMA", timeframe: 5, description: "EMA 9/21/50 alignment confirmed by MACD" },
  "ema-30-50-100": { label: "30/50/100 EMA", timeframe: "1D", description: "Daily bullish EMA 30, 50 and 100 alignment" },
  "rsi-divergence-daily": { label: "Daily RSI Divergence", timeframe: "1D", description: "Bullish daily divergence after the first RSI low falls below 30" },
};

export function isBullishOversoldDivergence(
  firstPriceLow: number,
  secondPriceLow: number,
  firstRsiLow: number,
  secondRsiLow: number,
) {
  return [firstPriceLow, secondPriceLow, firstRsiLow, secondRsiLow].every(Number.isFinite)
    && firstRsiLow < 30
    && secondPriceLow < firstPriceLow
    && secondRsiLow > firstRsiLow;
}

export function isActiveBullishOversoldDivergence(
  firstPriceLow: number,
  secondPriceLow: number,
  firstRsiLow: number,
  secondRsiLow: number,
  latestRsi: number,
) {
  return isBullishOversoldDivergence(
    firstPriceLow,
    secondPriceLow,
    firstRsiLow,
    secondRsiLow,
  )
    && Number.isFinite(latestRsi)
    && latestRsi < 50;
}

function emaSeries(values: number[], period: number) {
  const multiplier = 2 / (period + 1);
  const result: number[] = [];
  values.forEach((value, index) => result.push(index === 0 ? value : value * multiplier + result[index - 1] * (1 - multiplier)));
  return result;
}

function rsiSeries(values: number[], period = 14) {
  const result = Array(values.length).fill(50) as number[];
  if (values.length <= period) return result;
  let averageGain = 0;
  let averageLoss = 0;
  for (let index = 1; index <= period; index += 1) {
    const change = values[index] - values[index - 1];
    averageGain += Math.max(change, 0);
    averageLoss += Math.max(-change, 0);
  }
  averageGain /= period;
  averageLoss /= period;
  const calculate = () => averageLoss === 0 ? (averageGain === 0 ? 50 : 100) : 100 - (100 / (1 + averageGain / averageLoss));
  result[period] = calculate();
  for (let index = period + 1; index < values.length; index += 1) {
    const change = values[index] - values[index - 1];
    averageGain = ((averageGain * (period - 1)) + Math.max(change, 0)) / period;
    averageLoss = ((averageLoss * (period - 1)) + Math.max(-change, 0)) / period;
    result[index] = calculate();
  }
  return result;
}

function bollingerSeries(values: number[], period = 20, deviations = 2) {
  return values.map((_, index) => {
    if (index < period - 1) return { upper: Number.NaN, lower: Number.NaN };
    const window = values.slice(index - period + 1, index + 1);
    const middle = window.reduce((sum, value) => sum + value, 0) / period;
    const variance = window.reduce((sum, value) => sum + (value - middle) ** 2, 0) / period;
    const width = Math.sqrt(variance) * deviations;
    return { upper: middle + width, lower: middle - width };
  });
}

function macdSeries(values: number[], fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) {
  const fast = emaSeries(values, fastPeriod);
  const slow = emaSeries(values, slowPeriod);
  const macd = values.map((_, index) => fast[index] - slow[index]);
  const signal = emaSeries(macd, signalPeriod);
  return { macd, signal, histogram: macd.map((value, index) => value - signal[index]) };
}

function adxSeries(candles: NimbleCandle[], period = 14) {
  const result = Array(candles.length).fill(Number.NaN) as number[];
  if (candles.length < period * 2 + 1) return result;
  const trueRanges = Array(candles.length).fill(0) as number[];
  const plusDm = Array(candles.length).fill(0) as number[];
  const minusDm = Array(candles.length).fill(0) as number[];
  for (let index = 1; index < candles.length; index += 1) {
    const upMove = candles[index].high - candles[index - 1].high;
    const downMove = candles[index - 1].low - candles[index].low;
    trueRanges[index] = Math.max(
      candles[index].high - candles[index].low,
      Math.abs(candles[index].high - candles[index - 1].close),
      Math.abs(candles[index].low - candles[index - 1].close),
    );
    plusDm[index] = upMove > downMove && upMove > 0 ? upMove : 0;
    minusDm[index] = downMove > upMove && downMove > 0 ? downMove : 0;
  }
  let smoothedTr = trueRanges.slice(1, period + 1).reduce((sum, value) => sum + value, 0);
  let smoothedPlus = plusDm.slice(1, period + 1).reduce((sum, value) => sum + value, 0);
  let smoothedMinus = minusDm.slice(1, period + 1).reduce((sum, value) => sum + value, 0);
  const dx = Array(candles.length).fill(Number.NaN) as number[];
  for (let index = period; index < candles.length; index += 1) {
    if (index > period) {
      smoothedTr = smoothedTr - smoothedTr / period + trueRanges[index];
      smoothedPlus = smoothedPlus - smoothedPlus / period + plusDm[index];
      smoothedMinus = smoothedMinus - smoothedMinus / period + minusDm[index];
    }
    const plusDi = smoothedTr > 0 ? 100 * smoothedPlus / smoothedTr : 0;
    const minusDi = smoothedTr > 0 ? 100 * smoothedMinus / smoothedTr : 0;
    const denominator = plusDi + minusDi;
    dx[index] = denominator > 0 ? 100 * Math.abs(plusDi - minusDi) / denominator : 0;
  }
  const firstAdxIndex = period * 2 - 1;
  result[firstAdxIndex] = dx.slice(period, firstAdxIndex + 1).reduce((sum, value) => sum + value, 0) / period;
  for (let index = firstAdxIndex + 1; index < candles.length; index += 1) {
    result[index] = ((result[index - 1] * (period - 1)) + dx[index]) / period;
  }
  return result;
}

function recentCrossIndex(left: number[], right: number[], latestIndex: number, lookback: number, direction: "above" | "below") {
  const start = Math.max(1, latestIndex - lookback + 1);
  for (let index = latestIndex; index >= start; index -= 1) {
    const crossed = direction === "above"
      ? left[index - 1] <= right[index - 1] && left[index] > right[index]
      : left[index - 1] >= right[index - 1] && left[index] < right[index];
    if (crossed) return index;
  }
  return -1;
}

function isPivot(values: number[], index: number, kind: "high" | "low") {
  if (index < 2 || index > values.length - 3) return false;
  const neighbours = [values[index - 2], values[index - 1], values[index + 1], values[index + 2]];
  return kind === "high" ? neighbours.every((value) => values[index] > value) : neighbours.every((value) => values[index] < value);
}

function isCandlePivot(candles: NimbleCandle[], index: number, kind: "high" | "low") {
  if (index < 1 || index > candles.length - 2) return false;
  return kind === "high"
    ? candles[index].high > candles[index - 1].high && candles[index].high > candles[index + 1].high
    : candles[index].low < candles[index - 1].low && candles[index].low < candles[index + 1].low;
}

function averageTrueRange(candles: NimbleCandle[], period = 14) {
  const recent = candles.slice(-(period + 1));
  const ranges = recent.slice(1).map((candle, index) => Math.max(
    candle.high - candle.low,
    Math.abs(candle.high - recent[index].close),
    Math.abs(candle.low - recent[index].close),
  ));
  return ranges.reduce((sum, range) => sum + range, 0) / Math.max(1, ranges.length);
}

function istSessionKey(timestamp: number) {
  const shifted = new Date(timestamp + 330 * 60 * 1000);
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}-${String(shifted.getUTCDate()).padStart(2, "0")}`;
}

function istMinuteOfDay(timestamp: number) {
  const shifted = new Date(timestamp + 330 * 60 * 1000);
  return shifted.getUTCHours() * 60 + shifted.getUTCMinutes();
}

function istWeekKey(timestamp: number) {
  const shifted = new Date(timestamp + 330 * 60 * 1000);
  const daysSinceMonday = (shifted.getUTCDay() + 6) % 7;
  return new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate() - daysSinceMonday)).toISOString().slice(0, 10);
}

function aggregateDailyCandles(candles: NimbleCandle[]) {
  const sessions = new Map<string, NimbleCandle[]>();
  candles.forEach((candle) => {
    const key = istSessionKey(candle.timestamp);
    sessions.set(key, [...(sessions.get(key) ?? []), candle]);
  });
  return [...sessions.entries()].map(([key, session]) => {
    const ordered = session.sort((left, right) => left.timestamp - right.timestamp);
    return {
      key,
      weekKey: istWeekKey(ordered[0].timestamp),
      timestamp: ordered[0].timestamp,
      open: ordered[0].open,
      high: Math.max(...ordered.map((candle) => candle.high)),
      low: Math.min(...ordered.map((candle) => candle.low)),
      close: ordered.at(-1)?.close ?? ordered[0].close,
      complete: istMinuteOfDay(ordered.at(-1)?.timestamp ?? 0) >= 915 || key < istSessionKey(Date.now()),
    };
  }).sort((left, right) => left.timestamp - right.timestamp);
}

function baseMatch(closes: number[], ema21s: number[], ema5s: number[], rsi14s: number[]): Pick<NimbleMatch, "ema21" | "ema5" | "rsi14"> {
  const latestIndex = closes.length - 1;
  return { ema21: ema21s[latestIndex], ema5: ema5s[latestIndex], rsi14: rsi14s[latestIndex] };
}

export function analyzeNimbleCandles(candles: NimbleCandle[], strategy: NimbleStrategy, timeframe: ScannerTimeframe): NimbleMatch | null {
  if (candles.length < 25) return null;
  const closes = candles.map((candle) => candle.close);
  const ema21s = emaSeries(closes, 21);
  const ema5s = emaSeries(closes, 5);
  const rsi14s = rsiSeries(closes, 14);
  const latestIndex = candles.length - 1;
  const latest = candles[latestIndex];
  const base = baseMatch(closes, ema21s, ema5s, rsi14s);

  if (strategy === "macd-orb") {
    if (timeframe !== 5) return null;
    const latestSessionKey = istSessionKey(latest.timestamp);
    const sessionIndexes = candles.map((candle, index) => ({ candle, index }))
      .filter(({ candle }) => istSessionKey(candle.timestamp) === latestSessionKey);
    const opening = sessionIndexes.find(({ candle }) => {
      const minute = istMinuteOfDay(candle.timestamp);
      return minute >= 555 && minute < 560;
    });
    if (!opening || sessionIndexes.length < 2) return null;
    const openingHigh = opening.candle.high;
    const openingLow = opening.candle.low;
    const { macd, signal, histogram } = macdSeries(closes);
    const recentSessionIndexes = sessionIndexes.slice(-12).map(({ index }) => index);
    const bullishPriceBreak = recentSessionIndexes.some((index) => index > opening.index
      && closes[index] > openingHigh
      && closes[index - 1] <= openingHigh);
    const bearishPriceBreak = recentSessionIndexes.some((index) => index > opening.index
      && closes[index] < openingLow
      && closes[index - 1] >= openingLow);
    const bullishMacdCross = recentSessionIndexes.some((index) => index > 0
      && macd[index - 1] <= signal[index - 1]
      && macd[index] > signal[index]);
    const bearishMacdCross = recentSessionIndexes.some((index) => index > 0
      && macd[index - 1] >= signal[index - 1]
      && macd[index] < signal[index]);
    if (latest.close > openingHigh && macd[latestIndex] > signal[latestIndex] && bullishPriceBreak && bullishMacdCross) {
      const risk = latest.close - openingLow;
      return risk > 0 ? { ...base, signal: "long", entry: latest.close, stopLoss: openingLow, target1: latest.close + risk * 1.5, setupStatus: "triggered", rangeHigh: openingHigh, rangeLow: openingLow, indicatorValue: histogram[latestIndex] } : null;
    }
    if (latest.close < openingLow && macd[latestIndex] < signal[latestIndex] && bearishPriceBreak && bearishMacdCross) {
      const risk = openingHigh - latest.close;
      return risk > 0 ? { ...base, signal: "short", entry: latest.close, stopLoss: openingHigh, target1: latest.close - risk * 1.5, setupStatus: "triggered", rangeHigh: openingHigh, rangeLow: openingLow, indicatorValue: histogram[latestIndex] } : null;
    }
    return null;
  }

  if (strategy === "adx-golden-cross") {
    if (timeframe !== 15 || candles.length < 220) return null;
    const ema50s = emaSeries(closes, 50);
    const ema200s = emaSeries(closes, 200);
    const adxs = adxSeries(candles, 14);
    const emaCrossIndex = recentCrossIndex(ema50s, ema200s, latestIndex, 12, "above");
    const adxThreshold = candles.map((_, index) => Number.isFinite(adxs[index]) ? 25 : Number.NaN);
    const adxCrossIndex = recentCrossIndex(adxs, adxThreshold, latestIndex, 12, "above");
    if (ema50s[latestIndex] <= ema200s[latestIndex] || adxs[latestIndex] <= 25 || emaCrossIndex < 0 || adxCrossIndex < 0) return null;
    const stopLoss = Math.min(ema200s[latestIndex], ...candles.slice(-12).map((candle) => candle.low));
    const risk = latest.close - stopLoss;
    return risk > 0 ? { ...base, signal: "long", entry: latest.close, stopLoss, target1: latest.close + risk * 1.5, barsSinceCross: latestIndex - Math.max(emaCrossIndex, adxCrossIndex), setupStatus: "triggered", indicatorValue: adxs[latestIndex] } : null;
  }

  if (strategy === "macd-triple-ema") {
    if (timeframe !== 5 || candles.length < 60) return null;
    const ema9s = emaSeries(closes, 9);
    const ema50s = emaSeries(closes, 50);
    const { macd, signal, histogram } = macdSeries(closes);
    const emaCrossIndex = recentCrossIndex(ema9s, ema21s, latestIndex, 5, "above");
    const macdCrossIndex = recentCrossIndex(macd, signal, latestIndex, 5, "above");
    if (emaCrossIndex < 0 || macdCrossIndex < 0 || ema9s[latestIndex] <= ema21s[latestIndex] || latest.close <= ema50s[latestIndex] || macd[latestIndex] <= signal[latestIndex]) return null;
    const stopLoss = Math.min(ema50s[latestIndex], ...candles.slice(-10).map((candle) => candle.low));
    const risk = latest.close - stopLoss;
    return risk > 0 ? { ...base, signal: "long", entry: latest.close, stopLoss, target1: latest.close + risk * 1.5, barsSinceCross: latestIndex - Math.max(emaCrossIndex, macdCrossIndex), setupStatus: "triggered", indicatorValue: histogram[latestIndex] } : null;
  }

  if (strategy === "ema-30-50-100") {
    if (candles.length < 120) return null;
    const ema30s = emaSeries(closes, 30);
    const ema50s = emaSeries(closes, 50);
    const ema100s = emaSeries(closes, 100);
    const slopeIndex = latestIndex - 5;
    const bullishAlignment = latest.close > ema30s[latestIndex]
      && ema30s[latestIndex] > ema50s[latestIndex]
      && ema50s[latestIndex] > ema100s[latestIndex];
    const risingTrend = ema30s[latestIndex] > ema30s[slopeIndex]
      && ema50s[latestIndex] >= ema50s[slopeIndex]
      && ema100s[latestIndex] >= ema100s[slopeIndex];
    return bullishAlignment && risingTrend
      ? { ...base, signal: "long", setupStatus: "triggered", indicatorValue: ema100s[latestIndex] }
      : null;
  }

  if (strategy === "rsi-divergence-daily") {
    const latestRsi = rsi14s[latestIndex];
    // The oversold requirement belongs to the first daily RSI pivot. The
    // second RSI low may already be above 30; it only has to be higher while
    // price prints a lower low.
    if (!Number.isFinite(latestRsi)) return null;
    const pivotLows = candles.map((_, index) => index)
      .filter((index) => isCandlePivot(candles, index, "low"))
      .slice(-16);
    for (let secondPosition = pivotLows.length - 1; secondPosition >= 1; secondPosition -= 1) {
      const second = pivotLows[secondPosition];
      if (latestIndex - second > 15 || !Number.isFinite(rsi14s[second])) continue;
      for (let firstPosition = secondPosition - 1; firstPosition >= 0; firstPosition -= 1) {
        const first = pivotLows[firstPosition];
        if (second - first < 3 || second - first > 60) continue;
        if (!isActiveBullishOversoldDivergence(
          candles[first].low,
          candles[second].low,
          rsi14s[first],
          rsi14s[second],
          latestRsi,
        )) continue;
        // The first daily RSI pivot must be oversold. The second RSI low may
        // recover above 30, but the active setup expires at the neutral 50 line.
        const between = candles.slice(first + 1, second);
        if (!between.length) continue;
        const entry = Math.max(...between.map((candle) => candle.high));
        const stopLoss = Math.min(candles[first].low, candles[second].low);
        const risk = entry - stopLoss;
        if (risk <= 0) continue;
        const invalidated = candles.slice(second + 1).some((candle) => candle.low < stopLoss);
        if (invalidated) continue;
        const confirmationIndex = candles.findIndex((candle, index) => index > second && candle.close > entry);
        const triggered = confirmationIndex >= 0 && latest.close > stopLoss;
        // Keep recent confirmations in the result instead of deleting the
        // setup immediately after its neckline is crossed.
        if (triggered && latestIndex - confirmationIndex > 15) continue;
        return {
          ...base,
          signal: "long",
          entry,
          stopLoss,
          target1: entry + risk * 1.5,
          barsSinceCross: latestIndex - second,
          setupStatus: triggered ? "triggered" : "alert",
          indicatorValue: latestRsi,
        };
      }
    }
    return null;
  }

  if (strategy === "ema-breakdown") {
    return latest.close < ema21s[latestIndex] ? { ...base, signal: "breakdown" } : null;
  }

  if (strategy === "ema-retest") {
    for (let barsSinceCross = 1; barsSinceCross <= 3; barsSinceCross += 1) {
      const crossIndex = latestIndex - barsSinceCross;
      const cross = candles[crossIndex];
      const beforeCross = candles[crossIndex - 1];
      if (!beforeCross) continue;
      const setupCandles = candles.slice(crossIndex + 1, latestIndex + 1);
      const bullishCross = beforeCross.close <= ema21s[crossIndex - 1] && cross.close > ema21s[crossIndex] && cross.close > cross.open;
      const heldAbove = setupCandles.every((candle, offset) => candle.close > ema21s[crossIndex + 1 + offset]);
      if (bullishCross && latest.close < latest.open && heldAbove) {
        const entry = latest.high;
        const stopLoss = Math.min(...setupCandles.map((candle) => candle.low));
        const risk = entry - stopLoss;
        if (risk > 0) return { ...base, signal: "long", entry, stopLoss, target1: entry + risk * 1.5, barsSinceCross };
      }
      const bearishCross = beforeCross.close >= ema21s[crossIndex - 1] && cross.close < ema21s[crossIndex] && cross.close < cross.open;
      const heldBelow = setupCandles.every((candle, offset) => candle.close < ema21s[crossIndex + 1 + offset]);
      if (bearishCross && latest.close > latest.open && heldBelow) {
        const entry = latest.low;
        const stopLoss = Math.max(...setupCandles.map((candle) => candle.high));
        const risk = stopLoss - entry;
        if (risk > 0) return { ...base, signal: "short", entry, stopLoss, target1: entry - risk * 1.5, barsSinceCross };
      }
    }
    return null;
  }

  if (strategy === "ema-5-reversal") {
    const isLongSetup = timeframe === 15;
    const qualifies = (index: number) => isLongSetup
      ? candles[index].close < ema5s[index] && candles[index].high < ema5s[index]
      : candles[index].close > ema5s[index] && candles[index].low > ema5s[index];
    const searchStart = Math.max(0, latestIndex - 10);
    for (let alertIndex = latestIndex - 1; alertIndex >= searchStart; alertIndex -= 1) {
      if (!qualifies(alertIndex)) continue;
      const alert = candles[alertIndex];
      const waiting = candles.slice(alertIndex + 1, latestIndex);
      const remainedUntriggered = isLongSetup ? waiting.every((candle) => candle.high <= alert.high) : waiting.every((candle) => candle.low >= alert.low);
      const triggeredNow = isLongSetup ? latest.high > alert.high : latest.low < alert.low;
      if (!remainedUntriggered || !triggeredNow) break;
      const entry = isLongSetup ? alert.high : alert.low;
      const stopLoss = isLongSetup ? alert.low : alert.high;
      const risk = Math.abs(entry - stopLoss);
      if (risk > 0) return { ...base, signal: isLongSetup ? "long" : "short", entry, stopLoss, target1: isLongSetup ? entry + risk * 3 : entry - risk * 3, barsSinceCross: latestIndex - alertIndex, setupStatus: "triggered" };
    }
    if (!qualifies(latestIndex)) return null;
    const entry = isLongSetup ? latest.high : latest.low;
    const stopLoss = isLongSetup ? latest.low : latest.high;
    const risk = Math.abs(entry - stopLoss);
    return risk > 0 ? { ...base, signal: isLongSetup ? "long" : "short", entry, stopLoss, target1: isLongSetup ? entry + risk * 3 : entry - risk * 3, barsSinceCross: 0, setupStatus: "alert" } : null;
  }

  if (strategy === "rsi-divergence-break") {
    type Candidate = { signal: "long" | "short"; second: number; trigger: number; stopLoss: number };
    const candidates: Candidate[] = [];
    const pivotHighs = closes.map((_, index) => index).filter((index) => isPivot(closes, index, "high"));
    const pivotLows = closes.map((_, index) => index).filter((index) => isPivot(closes, index, "low"));
    for (let secondPosition = pivotHighs.length - 1; secondPosition >= 1; secondPosition -= 1) {
      const second = pivotHighs[secondPosition];
      if (latestIndex - second > 30) break;
      for (let firstPosition = secondPosition - 1; firstPosition >= 0; firstPosition -= 1) {
        const first = pivotHighs[firstPosition];
        if (second - first > 40) break;
        if (closes[second] <= closes[first] || rsi14s[second] >= rsi14s[first] || Math.max(rsi14s[first], rsi14s[second]) < 70) continue;
        const between = candles.slice(first + 1, second);
        if (between.length) candidates.push({ signal: "short", second, trigger: Math.min(...between.map((candle) => candle.low)), stopLoss: Math.max(...candles.slice(second).map((candle) => candle.high)) });
        break;
      }
    }
    for (let secondPosition = pivotLows.length - 1; secondPosition >= 1; secondPosition -= 1) {
      const second = pivotLows[secondPosition];
      if (latestIndex - second > 30) break;
      for (let firstPosition = secondPosition - 1; firstPosition >= 0; firstPosition -= 1) {
        const first = pivotLows[firstPosition];
        if (second - first > 40) break;
        if (closes[second] >= closes[first] || rsi14s[second] <= rsi14s[first] || Math.min(rsi14s[first], rsi14s[second]) > 30) continue;
        const between = candles.slice(first + 1, second);
        if (between.length) candidates.push({ signal: "long", second, trigger: Math.max(...between.map((candle) => candle.high)), stopLoss: Math.min(...candles.slice(second).map((candle) => candle.low)) });
        break;
      }
    }
    candidates.sort((left, right) => right.second - left.second);
    for (const candidate of candidates) {
      const waiting = candles.slice(candidate.second + 1, latestIndex);
      const remainedUntriggered = candidate.signal === "long" ? waiting.every((candle) => candle.close <= candidate.trigger) : waiting.every((candle) => candle.close >= candidate.trigger);
      if (!remainedUntriggered) continue;
      const risk = Math.abs(candidate.trigger - candidate.stopLoss);
      if (risk <= 0) continue;
      const triggered = candidate.signal === "long" ? latest.close > candidate.trigger : latest.close < candidate.trigger;
      return { ...base, signal: candidate.signal, entry: candidate.trigger, stopLoss: candidate.stopLoss, target1: candidate.signal === "long" ? candidate.trigger + risk : candidate.trigger - risk, barsSinceCross: latestIndex - candidate.second, setupStatus: triggered ? "triggered" : "alert" };
    }
    return null;
  }

  if (strategy === "bollinger-double-reversal") {
    const bands = bollingerSeries(closes);
    const atr = averageTrueRange(candles);
    const priceTolerance = Math.max(latest.close * .012, atr * 1.35);
    const pivotLows = candles.map((_, index) => index).filter((index) => index >= 20 && isCandlePivot(candles, index, "low")).slice(-12);
    const pivotHighs = candles.map((_, index) => index).filter((index) => index >= 20 && isCandlePivot(candles, index, "high")).slice(-12);
    type Candidate = { signal: "long" | "short"; second: number; trigger: number; stopLoss: number; band: number };
    const candidates: Candidate[] = [];
    for (let position = pivotLows.length - 1; position >= 1; position -= 1) {
      const first = pivotLows[position - 1]; const second = pivotLows[position];
      if (second - first < 3 || second - first > 45 || latestIndex - second > 12) continue;
      if (Math.abs(candles[second].low - candles[first].low) > priceTolerance || candles[second].low > candles[first].low + priceTolerance * .6) continue;
      if (!(candles[first].low <= bands[first].lower || candles[second].low <= bands[second].lower)) continue;
      if (candles.slice(first + 1, second).some((candle, offset) => candle.high >= bands[first + 1 + offset].upper)) continue;
      candidates.push({ signal: "long", second, trigger: Math.max(...candles.slice(first, second + 1).map((candle) => candle.high)), stopLoss: Math.min(candles[first].low, candles[second].low) - atr * .1, band: bands[second].lower });
      break;
    }
    for (let position = pivotHighs.length - 1; position >= 1; position -= 1) {
      const first = pivotHighs[position - 1]; const second = pivotHighs[position];
      if (second - first < 3 || second - first > 45 || latestIndex - second > 12) continue;
      if (Math.abs(candles[second].high - candles[first].high) > priceTolerance || candles[second].high < candles[first].high - priceTolerance * .6) continue;
      if (!(candles[first].high >= bands[first].upper || candles[second].high >= bands[second].upper)) continue;
      if (candles.slice(first + 1, second).some((candle, offset) => candle.low <= bands[first + 1 + offset].lower)) continue;
      candidates.push({ signal: "short", second, trigger: Math.min(...candles.slice(first, second + 1).map((candle) => candle.low)), stopLoss: Math.max(candles[first].high, candles[second].high) + atr * .1, band: bands[second].upper });
      break;
    }
    candidates.sort((left, right) => right.second - left.second);
    for (const candidate of candidates) {
      const waiting = candles.slice(candidate.second + 1, latestIndex);
      const remainedUntriggered = candidate.signal === "long" ? waiting.every((candle) => candle.close <= candidate.trigger) : waiting.every((candle) => candle.close >= candidate.trigger);
      if (!remainedUntriggered) continue;
      const risk = Math.abs(candidate.trigger - candidate.stopLoss);
      if (risk <= 0) continue;
      const triggered = candidate.signal === "long" ? latest.close > candidate.trigger : latest.close < candidate.trigger;
      return { ...base, signal: candidate.signal, entry: candidate.trigger, stopLoss: candidate.stopLoss, target1: candidate.signal === "long" ? candidate.trigger + risk : candidate.trigger - risk, barsSinceCross: latestIndex - candidate.second, setupStatus: triggered ? "triggered" : "alert", indicatorValue: candidate.band };
    }
    return null;
  }

  const daily = aggregateDailyCandles(candles).filter((candle) => candle.complete);
  const weekKeys = [...new Set(daily.map((candle) => candle.weekKey))];
  if (weekKeys.length < 2) return null;
  const setupWeekKey = weekKeys.at(-1)!;
  const previousWeekKey = weekKeys.at(-2)!;
  const previousWeek = daily.filter((candle) => candle.weekKey === previousWeekKey);
  const setupWeek = daily.filter((candle) => candle.weekKey === setupWeekKey);
  if (!previousWeek.length || !setupWeek.length) return null;
  const rangeHigh = Math.max(...previousWeek.map((candle) => candle.high));
  const rangeLow = Math.min(...previousWeek.map((candle) => candle.low));
  type Fakeout = { signal: "long" | "short"; dayIndex: number };
  const candidates: Fakeout[] = [];
  setupWeek.forEach((day, dayIndex) => {
    const observed = setupWeek.slice(0, dayIndex + 1);
    const earlierDays = setupWeek.slice(0, dayIndex);
    const earlierBearishReturn = earlierDays.some((earlierDay, earlierIndex) => setupWeek.slice(0, earlierIndex + 1).some((candle) => candle.high > rangeHigh) && earlierDay.close < rangeHigh);
    const earlierBullishReturn = earlierDays.some((earlierDay, earlierIndex) => setupWeek.slice(0, earlierIndex + 1).some((candle) => candle.low < rangeLow) && earlierDay.close > rangeLow);
    if (!earlierBearishReturn && observed.some((candle) => candle.high > rangeHigh) && day.close < rangeHigh) candidates.push({ signal: "short", dayIndex });
    if (!earlierBullishReturn && observed.some((candle) => candle.low < rangeLow) && day.close > rangeLow) candidates.push({ signal: "long", dayIndex });
  });
  candidates.sort((left, right) => right.dayIndex - left.dayIndex);
  for (const candidate of candidates) {
    const signalDay = setupWeek[candidate.dayIndex];
    const signalDayCandles = candles.filter((candle) => istSessionKey(candle.timestamp) === signalDay.key);
    const currentWeekCandles = candles.filter((candle) => istWeekKey(candle.timestamp) === setupWeekKey);
    const legCandles = currentWeekCandles.filter((candle) => candle.timestamp <= (signalDayCandles.at(-1)?.timestamp ?? 0));
    if (legCandles.length < 3) continue;
    const extremeInWeek = candidate.signal === "short" ? legCandles.reduce((best, candle) => candle.high > best.high ? candle : best) : legCandles.reduce((best, candle) => candle.low < best.low ? candle : best);
    const extremeIndex = candles.findIndex((candle) => candle.timestamp === extremeInWeek.timestamp);
    if (extremeIndex < 2) continue;
    let triggerIndex = -1;
    for (let index = extremeIndex - 1; index >= Math.max(1, extremeIndex - 80); index -= 1) {
      const validSide = candidate.signal === "short" ? candles[index].low < rangeHigh : candles[index].high > rangeLow;
      if (validSide && isCandlePivot(candles, index, candidate.signal === "short" ? "low" : "high")) { triggerIndex = index; break; }
    }
    if (triggerIndex < 0) continue;
    const trigger = candidate.signal === "short" ? candles[triggerIndex].low : candles[triggerIndex].high;
    const confirmationIndex = candles.findIndex((candle, index) => index > triggerIndex && candle.timestamp >= signalDay.timestamp && (candidate.signal === "short" ? candle.close < trigger : candle.close > trigger));
    if (confirmationIndex >= 0 && latestIndex - confirmationIndex > 40) continue;
    const stopWindow = candles.slice(extremeIndex, Math.max(extremeIndex + 1, confirmationIndex >= 0 ? confirmationIndex + 1 : latestIndex + 1));
    const stopLoss = candidate.signal === "short" ? Math.max(...stopWindow.map((candle) => candle.high)) : Math.min(...stopWindow.map((candle) => candle.low));
    const risk = Math.abs(trigger - stopLoss);
    if (risk > 0) return { ...base, signal: candidate.signal, entry: trigger, stopLoss, target1: candidate.signal === "long" ? trigger + risk : trigger - risk, barsSinceCross: confirmationIndex >= 0 ? latestIndex - confirmationIndex : latestIndex - triggerIndex, setupStatus: confirmationIndex >= 0 ? "triggered" : "alert", rangeHigh, rangeLow };
  }
  return null;
}
