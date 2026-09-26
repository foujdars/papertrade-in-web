import type { Candle } from "./market";

type Bar = Pick<Candle, "time" | "open" | "high" | "low" | "close">;
export type PsbbStatus = "active" | "formed" | "passed" | "failed";
export const PSBB_TIMEFRAMES = ["1m", "5m", "15m", "1H", "4H", "1D"] as const;
export type PsbbAnchor = { side: "long" | "short"; time: number; price: number; rsi: number };
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
  confirmedTime: number;
  phase: "waiting-structure" | "waiting-mss" | "entered";
  structureCase: "before" | "after" | null;
  entry: number | null;
  entryTime: number | null;
  mssTime: number | null;
  stop: number | null;
  stopTime: number | null;
  target1: number | null;
  target2: number | null;
  target1Hit: boolean;
  shifted: boolean;
  extended: boolean;
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

function isPivot(candles: Bar[], side: "low" | "high", index: number, span: number) {
  if (index < span) return false;
  const value = candles[index][side];
  if (!Number.isFinite(value)) return false;
  for (let cursor = index - span; cursor <= index + span; cursor += 1) {
    if (cursor === index) continue;
    const other = candles[cursor][side];
    if (!Number.isFinite(other) || (side === "low" ? other <= value : other >= value)) return false;
  }
  return true;
}

function updateOutcome(setup: PsbbSetup, bar: Bar) {
  if (setup.status !== "formed" || setup.stop === null || setup.target1 === null || setup.target2 === null) return;
  setup.end = bar.time;
  // Close-confirmed MSS cannot claim a target/stop touched earlier on the entry
  // candle. Later candles that touch both are conservatively stop-first.
  const stopped = setup.side === "long" ? bar.low <= setup.stop : bar.high >= setup.stop;
  if (stopped) { setup.status = "failed"; return; }
  if (setup.side === "long" ? bar.high >= setup.target1 : bar.low <= setup.target1) {
    setup.target1Hit = true;
    setup.status = "passed";
  }
}

type Episode = { first: number; extreme: number; pushes: number; setup?: PsbbSetup; structure?: number };

/**
 * D1 is the first strict RSI threshold crossing, not a price pivot. Divergence
 * tracks a new extreme relative to D1. A newer extreme replaces a pending one.
 * Swings become usable only after `left` closed candles on BOTH sides. Case A
 * uses the most recent opposite swing strictly between D1 and the extreme;
 * Case B waits for the first opposite swing after it. Only a subsequent close
 * through that level confirms MSS. The final (still-forming) candle is excluded.
 */
function scanPsbb(candles: Bar[], momentum: number[], inputs: Record<string, number> = {}, allCandlesClosed = false) {
  const last = Math.max(0, candles.length - (allCandlesClosed ? 0 : 1));
  const span = Math.max(1, Math.floor(inputs.left || 3));
  const oversold = inputs.oversold ?? 30;
  const overbought = inputs.overbought ?? 70;
  const setups: PsbbSetup[] = [];
  const pivots: Record<"low" | "high", number[]> = { low: [], high: [] };
  const episodes: Partial<Record<"long" | "short", Episode>> = {};
  for (let index = 0; index < last; index += 1) {
    const bar = candles[index];
    for (const setup of setups) updateOutcome(setup, bar);
    const confirmed = index - span;
    for (const kind of ["low", "high"] as const) {
      if (isPivot(candles, kind, confirmed, span)) pivots[kind].push(confirmed);
    }
    for (const side of ["long", "short"] as const) {
      const long = side === "long", extremeKind = long ? "low" : "high", structureKind = long ? "high" : "low";
      const previous = momentum[index - 1], current = momentum[index];
      const crossed = Number.isFinite(previous) && Number.isFinite(current) && (long
        ? previous >= oversold && current < oversold
        : previous <= overbought && current > overbought);
      if (!episodes[side] && crossed) episodes[side] = { first: index, extreme: index, pushes: 0 };
      const episode = episodes[side];
      if (!episode) continue;
      const makesExtreme = long ? bar.low < candles[episode.extreme].low : bar.high > candles[episode.extreme].high;
      if (makesExtreme) {
        episode.extreme = index;
        episode.setup = undefined;
        episode.structure = undefined;
      }
      const { first, extreme } = episode;
      if (confirmed === extreme && pivots[extremeKind].at(-1) === extreme) {
        episode.pushes += 1;
        const divergence = extreme > first && Number.isFinite(momentum[extreme]) && (long
          ? momentum[extreme] > momentum[first]
          : momentum[extreme] < momentum[first]);
        if (divergence) {
          episode.structure = pivots[structureKind].findLast((pivot) => pivot > first && pivot < extreme);
          episode.setup = {
            side, status: "active", phase: "waiting-structure", structureCase: null,
            shifted: false, extended: episode.pushes >= 3,
            firstTime: candles[first].time, firstPrice: candles[first][extremeKind], firstRsi: momentum[first],
            secondTime: candles[extreme].time, secondPrice: candles[extreme][extremeKind], secondRsi: momentum[extreme],
            confirmedTime: bar.time, end: bar.time, entry: null, entryTime: null, mssTime: null,
            stop: null, stopTime: null, target1: null, target2: null, target1Hit: false,
          };
        }
      }
      const setup = episode.setup;
      if (!setup) continue;
      setup.end = bar.time;
      // A Case B level is locked to the FIRST new swing, not a later better fit.
      if (episode.structure === undefined) episode.structure = pivots[structureKind].find((pivot) => pivot > extreme);
      const structure = episode.structure;
      if (structure === undefined) continue;
      setup.phase = "waiting-mss";
      setup.structureCase = structure < extreme ? "before" : "after";
      setup.entry = candles[structure][structureKind];
      setup.entryTime = candles[structure].time;
      // The episode extreme is the highest high / lowest low since D1. Keep
      // this full setup swing as the stop, not a later minor retracement pivot.
      const stopIndex = extreme;
      setup.stop = candles[stopIndex][extremeKind];
      setup.stopTime = candles[stopIndex].time;
      const risk = long ? setup.entry - setup.stop : setup.stop - setup.entry;
      if (!(risk > 0)) continue;
      setup.target1 = setup.entry + (long ? 1 : -1) * risk;
      // Retain the old field for saved consumers; PSBB now has ONE 1R target.
      setup.target2 = setup.target1;
      const priorClose = candles[index - 1]?.close;
      const broke = index > extreme && index > structure && (long
        ? priorClose <= setup.entry && bar.close > setup.entry
        : priorClose >= setup.entry && bar.close < setup.entry);
      if (!broke) continue;
      setup.phase = "entered";
      setup.status = "formed";
      setup.shifted = true;
      setup.mssTime = bar.time;
      setups.push(setup);
      delete episodes[side];
    }
  }
  for (const episode of Object.values(episodes)) if (episode?.setup) setups.push(episode.setup);
  const anchors: PsbbAnchor[] = [];
  for (const side of ["long", "short"] as const) {
    const episode = episodes[side];
    if (episode) anchors.push({ side, time: candles[episode.first].time, price: candles[episode.first][side === "long" ? "low" : "high"], rsi: momentum[episode.first] });
  }
  // Monthly statistics need the full history, not just the last four setups.
  return { setups: setups.sort((a, b) => a.secondTime - b.secondTime), anchors };
}

export function psbbSetups(candles: Bar[], momentum: number[], inputs: Record<string, number> = {}): PsbbSetup[] {
  return scanPsbb(candles, momentum, inputs).setups;
}

export function psbbAnalysis(candles: Bar[], inputs: Record<string, number> = {}, timeframe?: string, allCandlesClosed = false) {
  if (timeframe && !PSBB_TIMEFRAMES.some((allowed) => allowed === timeframe)) return { setups: [], anchors: [] };
  const momentum = rsi(candles.map((bar) => bar.close), Math.max(2, inputs.length || 14));
  return scanPsbb(candles, momentum, inputs, allCandlesClosed);
}

export function psbbPlots(candles: Bar[], inputs: Record<string, number> = {}, timeframe?: string) {
  return psbbAnalysis(candles, inputs, timeframe).setups;
}
