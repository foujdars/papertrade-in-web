import type { AlgoBacktestOptions, AlgoBacktestResult, AlgoCandle, AlgoEquityPoint, AlgoExitReason, AlgoLeg, AlgoStrategy, AlgoTrade } from "./algo-types.ts";

const IST_SECONDS = 19_800;
const SESSION_OPEN = 9 * 3600 + 15 * 60;
const SESSION_CLOSE = 15 * 3600 + 30 * 60;
const positive = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value > 0;
const nonnegative = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0;
const nonempty = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
const optionalPositive = (value: unknown) => value === null || positive(value);
const round = (value: number) => Math.round((value + Number.EPSILON) * 1e8) / 1e8;

export function algoTimeSeconds(value: string): number | null {
  if (typeof value !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) return null;
  const [hour, minute] = value.split(":").map(Number);
  return hour * 3600 + minute * 60;
}

export function validateAlgoStrategy(strategy: AlgoStrategy): string[] {
  const errors: string[] = [];
  if (!strategy || typeof strategy !== "object") return ["A strategy is required."];
  if (!nonempty(strategy.id) || !nonempty(strategy.name)) errors.push("Strategy ID and name are required.");
  if (!positive(strategy.capital)) errors.push("Starting virtual capital must be a positive number.");
  const entry = algoTimeSeconds(strategy.entryTime);
  const exit = algoTimeSeconds(strategy.exitTime);
  if (entry === null || exit === null || entry < SESSION_OPEN || exit > SESSION_CLOSE || entry >= exit) errors.push("Use IST entry and exit times between 09:15 and 15:30, with entry before exit.");
  if (!nonnegative(strategy.feePerOrder)) errors.push("Fee per order must be a non-negative number.");
  if (!nonnegative(strategy.slippageBps) || strategy.slippageBps > 1000) errors.push("Slippage must be between 0 and 1,000 basis points.");
  if (!optionalPositive(strategy.maxLoss) || !optionalPositive(strategy.profitTarget)) errors.push("Basket loss and profit limits must be positive numbers or disabled (null).");
  if (!Array.isArray(strategy.legs) || strategy.legs.length < 1 || strategy.legs.length > 8) errors.push("Add between 1 and 8 legs.");
  const ids = new Set<string>();
  for (const [index, leg] of (Array.isArray(strategy.legs) ? strategy.legs : []).entries()) {
    const label = `Leg ${index + 1}`;
    if (!leg || typeof leg !== "object") { errors.push(`${label} is invalid.`); continue; }
    if (!nonempty(leg.id) || ids.has(leg.id)) errors.push(`${label} needs a unique ID.`);
    ids.add(leg.id);
    if (!nonempty(leg.name) || !nonempty(leg.instrumentKey)) errors.push(`${label} needs a name and an exact instrument key.`);
    if (leg.side !== "BUY" && leg.side !== "SELL") errors.push(`${label} side must be BUY or SELL.`);
    if (!Number.isSafeInteger(leg.quantity) || leg.quantity < 1 || !Number.isSafeInteger(leg.lotSize) || leg.lotSize < 1 || !Number.isSafeInteger(leg.quantity * leg.lotSize)) errors.push(`${label} requires positive whole lots and a positive whole lot size.`);
    if (!optionalPositive(leg.stopLossPct) || (leg.stopLossPct !== null && leg.stopLossPct >= 100)) errors.push(`${label} stop loss must be greater than 0 and less than 100%, or disabled.`);
    if (!optionalPositive(leg.targetPct) || (leg.side === "SELL" && leg.targetPct !== null && leg.targetPct >= 100)) errors.push(`${label} target must be positive (and below 100% for a short), or disabled.`);
  }
  const condition = strategy.entryCondition;
  if (!condition || (condition.type !== "scheduled" && condition.type !== "ema_cross")) errors.push("Choose a scheduled entry or EMA crossover.");
  else if (condition.type === "ema_cross") {
    if (!Number.isSafeInteger(condition.fastPeriod) || !Number.isSafeInteger(condition.slowPeriod) || condition.fastPeriod < 1 || condition.fastPeriod >= condition.slowPeriod || condition.slowPeriod > 500) errors.push("EMA periods must be whole numbers with 1 ≤ fast < slow ≤ 500.");
    if (!nonempty(condition.signalInstrumentKey)) errors.push("EMA entry needs an exact signal instrument key.");
    if (condition.direction !== "bullish" && condition.direction !== "bearish") errors.push("EMA direction must be bullish or bearish.");
  }
  return errors;
}

/** First-close seed, with a full period of warm-up before publishing a value. */
export function calculateAlgoEma(values: number[], period: number): (number | null)[] {
  if (!Number.isSafeInteger(period) || period < 1 || period > 500) throw new Error("EMA period must be between 1 and 500.");
  if (values.some(value => !Number.isFinite(value))) throw new Error("EMA values must be finite numbers.");
  let ema = 0;
  const multiplier = 2 / (period + 1);
  return values.map((value, index) => {
    ema = index === 0 ? value : value * multiplier + ema * (1 - multiplier);
    return index + 1 >= period ? ema : null;
  });
}

function sessionAt(time: number) {
  const date = new Date((time + IST_SECONDS) * 1000);
  return { date: date.toISOString().slice(0, 10), weekday: date.getUTCDay(), seconds: date.getUTCHours() * 3600 + date.getUTCMinutes() * 60 + date.getUTCSeconds() };
}

function validateCandles(key: string, input: AlgoCandle[] | undefined, warnings: Set<string>): AlgoCandle[] {
  if (!Array.isArray(input) || input.length === 0) throw new Error(`No historical candles were supplied for ${key}. No substitute data was used.`);
  if (input.length > 250_000) throw new Error(`Too many candles for ${key}; use a shorter date range.`);
  const times = new Set<number>();
  let prior = -Infinity;
  for (const bar of input) {
    if (!bar || !Number.isSafeInteger(bar.time) || bar.time <= 0 || bar.time >= 100_000_000_000 || ![bar.open, bar.high, bar.low, bar.close].every(positive) || bar.low > Math.min(bar.open, bar.close) || bar.high < Math.max(bar.open, bar.close) || bar.low > bar.high || (bar.volume !== undefined && !nonnegative(bar.volume))) throw new Error(`Invalid OHLC candle for ${key}; use positive prices and UNIX-second start timestamps.`);
    if (times.has(bar.time)) throw new Error(`Duplicate candle timestamp for ${key}.`);
    times.add(bar.time);
    if (bar.time < prior) warnings.add("Unsorted input candles were ordered chronologically before testing.");
    prior = bar.time;
  }
  return [...input].sort((a, b) => a.time - b.time);
}

type Position = { leg: AlgoLeg; units: number; entryPrice: number; entryTime: number; stop: number | null; target: number | null };
type Marks = Record<string, AlgoCandle>;
const sideSign = (leg: AlgoLeg) => leg.side === "BUY" ? 1 : -1;

/** Independent, deterministic OHLC simulator. It never submits broker orders. */
export function runAlgoBacktest(strategy: AlgoStrategy, candlesByInstrument: Record<string, AlgoCandle[]>, options: AlgoBacktestOptions = {}): AlgoBacktestResult {
  const errors = validateAlgoStrategy(strategy);
  if (errors.length) throw new Error(errors.join(" "));
  const interval = options.barIntervalSeconds ?? 60;
  if (!Number.isSafeInteger(interval) || interval < 1 || interval > 3600) throw new Error("Bar interval must be between 1 and 3,600 seconds.");
  if (options.dataMode !== undefined && options.dataMode !== "demo" && options.dataMode !== "historical") throw new Error("Choose historical or demo data mode.");
  const dataMode = options.dataMode ?? "historical";
  if (!candlesByInstrument || typeof candlesByInstrument !== "object") throw new Error("Supply historical candles for every exact instrument key.");
  const warnings = new Set<string>();
  if (dataMode === "demo") warnings.add("DEMO: all prices in this run are deterministic synthetic examples, not historical market returns.");
  const keys = [...new Set(strategy.legs.map(leg => leg.instrumentKey))];
  const inputKeys = strategy.entryCondition.type === "ema_cross" ? [...new Set([...keys, strategy.entryCondition.signalInstrumentKey])] : keys;
  if (dataMode === "historical" && inputKeys.some(key => key.startsWith("DEMO|"))) throw new Error("Demo instruments cannot be run as historical data.");
  const series = new Map(inputKeys.map(key => [key, validateCandles(key, candlesByInstrument[key], warnings)]));
  for (const [key, bars] of series) {
    if (bars.some((bar, index) => index > 0 && bar.time - bars[index - 1].time < interval)) throw new Error(`Candles for ${key} overlap the configured bar interval. Supply matching-timeframe candles.`);
  }
  const maps = new Map(keys.map(key => [key, new Map(series.get(key)!.map(bar => [bar.time, bar]))]));
  const allTimes = [...new Set(keys.flatMap(key => series.get(key)!.map(bar => bar.time)))].sort((a, b) => a - b);
  const sessions = new Map<string, { time: number; marks: Marks }[]>();
  let missing = 0;
  let zeroVolume = 0;
  let outsideSession = 0;
  for (const time of allTimes) {
    const local = sessionAt(time);
    if (local.weekday === 0 || local.weekday === 6 || local.seconds < SESSION_OPEN || local.seconds > SESSION_CLOSE) { outsideSession++; continue; }
    const marks: Marks = {};
    let complete = true;
    for (const key of keys) {
      const bar = maps.get(key)!.get(time);
      if (!bar) { missing++; complete = false; break; }
      if (bar.volume === 0) { zeroVolume++; complete = false; break; }
      marks[key] = bar;
    }
    if (!complete) continue;
    const day = sessions.get(local.date) ?? [];
    day.push({ time, marks });
    sessions.set(local.date, day);
  }
  if (missing) warnings.add(`${missing} timestamps lacked a candle for every leg and were excluded; prices were never forward-filled.`);
  if (zeroVolume) warnings.add(`${zeroVolume} timestamps had a zero-volume leg and could not execute the basket.`);
  if (outsideSession) warnings.add(`${outsideSession} timestamps outside weekday NSE 09:15–15:30 IST sessions were excluded.`);
  if (keys.some(key => series.get(key)!.some(bar => bar.volume === undefined))) warnings.add("Some bars have no volume information; simulated fills do not establish available liquidity.");
  if (!sessions.size) throw new Error("No shared, tradable timestamps remain for the strategy's exact instruments.");

  // Signals use only completed bars and execute at the immediately following bar's
  // start. A missing execution bar never carries an old crossover into a later fill.
  const signalTimes = new Set<number>();
  if (strategy.entryCondition.type === "ema_cross") {
    const condition = strategy.entryCondition;
    const bars = series.get(condition.signalInstrumentKey)!;
    const closes = bars.map(bar => bar.close);
    const fast = calculateAlgoEma(closes, condition.fastPeriod);
    const slow = calculateAlgoEma(closes, condition.slowPeriod);
    for (let i = 1; i < bars.length; i++) {
      const f0 = fast[i - 1], s0 = slow[i - 1], f1 = fast[i], s1 = slow[i];
      if (f0 === null || s0 === null || f1 === null || s1 === null) continue;
      const crossed = condition.direction === "bullish" ? f0 <= s0 && f1 > s1 : f0 >= s0 && f1 < s1;
      if (crossed) signalTimes.add(bars[i].time + interval);
    }
  }
  const trades: AlgoTrade[] = [];
  const equity: AlgoEquityPoint[] = [];
  let realized = 0;
  let peak = strategy.capital;
  let maxDrawdown = 0;
  let maxDrawdownPct = 0;
  const entrySeconds = algoTimeSeconds(strategy.entryTime)!;
  const exitSeconds = algoTimeSeconds(strategy.exitTime)!;
  const slip = strategy.slippageBps / 10_000;
  const positions: Position[] = [];
  const fill = (price: number, position: Pick<Position, "leg">, entry: boolean) => price * (1 + sideSign(position.leg) * (entry ? 1 : -1) * slip);
  const netAt = (position: Position, price: number) => (price - position.entryPrice) * sideSign(position.leg) * position.units - strategy.feePerOrder;
  const markEquity = (time: number, marks: Marks, field: "open" | "close") => {
    const value = strategy.capital + realized + positions.reduce((sum, position) => sum + netAt(position, marks[position.leg.instrumentKey][field]), 0);
    peak = Math.max(peak, value);
    const drawdown = Math.max(0, peak - value);
    const drawdownPct = peak > 0 ? drawdown / peak * 100 : 0;
    maxDrawdown = Math.max(maxDrawdown, drawdown);
    maxDrawdownPct = Math.max(maxDrawdownPct, drawdownPct);
    const point = { time, equity: round(value), drawdown: round(drawdown), drawdownPct: round(drawdownPct) };
    // Several events can share a boundary. Keep the latest equity for plotting;
    // summary drawdown still includes every observed mark and execution fee.
    if (equity.at(-1)?.time === time) equity[equity.length - 1] = point;
    else equity.push(point);
  };
  const closePosition = (position: Position, rawPrice: number, time: number, sessionDate: string, reason: AlgoExitReason) => {
    const exitPrice = fill(rawPrice, position, false);
    const grossPnl = (exitPrice - position.entryPrice) * sideSign(position.leg) * position.units;
    const fees = strategy.feePerOrder * 2;
    const netPnl = grossPnl - fees;
    realized += netPnl;
    trades.push({ id: `${strategy.id}:${sessionDate}:${position.leg.id}`, sessionDate, legId: position.leg.id, instrumentKey: position.leg.instrumentKey, name: position.leg.name, side: position.leg.side, units: position.units, entryTime: position.entryTime, exitTime: time, entryPrice: round(position.entryPrice), exitPrice: round(exitPrice), grossPnl: round(grossPnl), fees: round(fees), netPnl: round(netPnl), exitReason: reason });
    positions.splice(positions.indexOf(position), 1);
  };
  let enteredSessions = 0;
  for (const [date, bars] of sessions) {
    let entered = false;
    const dayStartRealized = realized;
    const closeBasket = (marks: Marks, field: "open" | "close", time: number, reason: AlgoExitReason) => {
      for (const position of [...positions]) closePosition(position, marks[position.leg.instrumentKey][field], time, date, reason);
    };
    const basketRisk = (marks: Marks, field: "open" | "close", time: number) => {
      if (!positions.length) return;
      // Limits include realized leg results, paid entry costs, estimated exit
      // costs and adverse slippage on the remaining legs.
      const basketNet = realized - dayStartRealized + positions.reduce((sum, position) => sum + netAt(position, fill(marks[position.leg.instrumentKey][field], position, false)) - strategy.feePerOrder, 0);
      if (strategy.maxLoss !== null && basketNet <= -strategy.maxLoss) closeBasket(marks, field, time, "basket_stop");
      else if (strategy.profitTarget !== null && basketNet >= strategy.profitTarget) closeBasket(marks, field, time, "basket_target");
    };
    for (let index = 0; index < bars.length; index++) {
      const { time, marks } = bars[index];
      const seconds = sessionAt(time).seconds;
      if (positions.length && index > 0 && time - bars[index - 1].time > interval) warnings.add("There are gaps while positions are open. Risk limits can only execute at the next shared observed candle and may be exceeded.");
      markEquity(time, marks, "open");
      if (positions.length && seconds >= exitSeconds) {
        closeBasket(marks, "open", time, "session_exit");
        markEquity(time, marks, "open");
        continue;
      }
      if (!entered && seconds >= entrySeconds && seconds < exitSeconds && (strategy.entryCondition.type === "scheduled" || signalTimes.has(time))) {
        if (strategy.capital + realized <= 0) { warnings.add("Further entries were skipped after virtual equity reached zero or below."); continue; }
        const grossNotional = strategy.legs.reduce((sum, leg) => sum + fill(marks[leg.instrumentKey].open, { leg }, true) * leg.quantity * leg.lotSize, 0);
        if (grossNotional + strategy.feePerOrder * strategy.legs.length * 2 > strategy.capital + realized) {
          entered = true;
          warnings.add(`${date}: entry skipped because gross leg notional plus round-trip fees exceeded available virtual capital. No leverage or margin offsets are assumed.`);
          continue;
        }
        for (const leg of strategy.legs) {
          const entryPrice = fill(marks[leg.instrumentKey].open, { leg }, true);
          const sign = sideSign(leg);
          positions.push({ leg, units: leg.quantity * leg.lotSize, entryPrice, entryTime: time, stop: leg.stopLossPct === null ? null : entryPrice * (1 - sign * leg.stopLossPct / 100), target: leg.targetPct === null ? null : entryPrice * (1 + sign * leg.targetPct / 100) });
        }
        entered = true;
        enteredSessions++;
        markEquity(time, marks, "open");
      }
      if (!positions.length) continue;
      basketRisk(marks, "open", time);
      // Gap checks precede intrabar checks. Once a bar opens beyond a threshold,
      // the simulated market order fills at that open (with adverse slippage).
      for (const position of [...positions]) {
        const bar = marks[position.leg.instrumentKey];
        const long = position.leg.side === "BUY";
        if (position.stop !== null && (long ? bar.open <= position.stop : bar.open >= position.stop)) closePosition(position, bar.open, time, date, "stop_loss");
        else if (position.target !== null && (long ? bar.open >= position.target : bar.open <= position.target)) closePosition(position, bar.open, time, date, "target");
      }
      // OHLC cannot reveal which intrabar threshold happened first. If both
      // were touched, stop first is the deliberately conservative assumption.
      for (const position of [...positions]) {
        const bar = marks[position.leg.instrumentKey];
        const long = position.leg.side === "BUY";
        const stopHit = position.stop !== null && (long ? bar.low <= position.stop : bar.high >= position.stop);
        const targetHit = position.target !== null && (long ? bar.high >= position.target : bar.low <= position.target);
        if (stopHit) closePosition(position, position.stop!, time + interval, date, "stop_loss");
        else if (targetHit) closePosition(position, position.target!, time + interval, date, "target");
      }
      basketRisk(marks, "close", time + interval);
      if (positions.length && seconds < exitSeconds && seconds + interval > exitSeconds) warnings.add("A configured exit falls inside a candle; execution waits for the next observed bar open. Use finer candles for closer timing.");
      if (positions.length && index === bars.length - 1) {
        const completeSession = seconds + interval === exitSeconds;
        closeBasket(marks, "close", time + interval, completeSession ? "session_exit" : "data_end");
        if (!completeSession) warnings.add("A session ended without an observed exit bar: open legs were flattened at the last shared candle close and marked data_end.");
      }
      markEquity(time + interval, marks, "close");
    }
  }
  if (enteredSessions === 0) warnings.add("No entry qualified in the supplied data. Try a wider range or review the entry condition and session times.");
  const grossPnl = trades.reduce((sum, trade) => sum + trade.grossPnl, 0);
  const totalFees = trades.reduce((sum, trade) => sum + trade.fees, 0);
  const winningTrades = trades.filter(trade => trade.netPnl > 0).length;
  const losingTrades = trades.filter(trade => trade.netPnl < 0).length;
  return {
    trades, equity,
    summary: { netPnl: round(realized), grossPnl: round(grossPnl), totalFees: round(totalFees), totalTrades: trades.length, winningTrades, losingTrades, winRate: trades.length ? round(winningTrades / trades.length * 100) : 0, finalEquity: round(strategy.capital + realized), maxDrawdown: round(maxDrawdown), maxDrawdownPct: round(maxDrawdownPct) },
    warnings: [...warnings], dataMode,
    assumptions: [
      "One basket entry per weekday NSE session; all configured times are IST. No re-entry or overnight positions.",
      "Quantity is whole lots × lot size. Each leg uses the exact supplied instrument, with no continuous-option or rolling-expiry reconstruction.",
      "Scheduled entries use the first shared tradable bar at or after entry time; EMA entries use a completed signal bar and the immediately next bar's open.",
      "Adverse slippage applies to every entry and exit. Fees are charged once per leg per side; taxes and broker margin are not estimated.",
      "Individual stop wins when both stop and target occur within a candle. Gaps fill at the observed open, so configured loss limits are not guaranteed.",
      "Basket limits use synchronized open/close marks including estimated exit costs; separate legs' intrabar highs and lows are never assumed simultaneous.",
      "Equity drawdown uses observed bar opens, closes and execution costs; it cannot recover the unknown intrabar price path. Win rate counts closed legs, not whole baskets.",
      "Entries require gross notional for every leg plus round-trip fees within virtual equity; no leverage, margin offsets or broker buying power are assumed. No broker orders are sent.",
    ],
  };
}
