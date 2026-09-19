import { bollingerBands, ema, macd, rsi, sma, supertrend, vwap, type Candle, type Instrument } from "./market";

export const TECHNICAL_FRAMES = { "1m": 60, "3m": 180, "5m": 300, "15m": 900, "30m": 1800, "1H": 3600, "1D": 86400 } as const;
export type TechnicalFrame = keyof typeof TECHNICAL_FRAMES;
export const TECHNICAL_FAMILIES = { ema: "EMA", sma: "SMA", vwap: "Session VWAP", rsi: "RSI", macd: "MACD", supertrend: "Supertrend", bollinger: "Bollinger Bands", previousDay: "Previous-day levels", volume: "Volume" } as const;
export type TechnicalFamily = keyof typeof TECHNICAL_FAMILIES;
export type TechnicalConfig = { family: TechnicalFamily; timeframe: TechnicalFrame; condition: string; period: number; slow: number; signal: number; threshold: number; multiplier: number; repeat: "once" | "repeat"; cooldown: number; days: number; delivery?: "device" | "server" };
export type TechnicalRule = TechnicalConfig & { id: string; revision: string; instrument: Instrument; createdAt: number; armedAt: number; expiresAt: number; status: "active" | "paused" | "completed" | "expired"; lastBar?: number; lastTriggeredAt?: number };
export type TechnicalEvent = { id: string; ruleId: string; instrument: Instrument; timeframe: TechnicalFrame; description: string; barTime: number; createdAt: number; price: number; detail: string; kind: "trigger" | "expired" };
export type TechnicalStore = { version: 1; rules: TechnicalRule[]; events: TechnicalEvent[] };
export const emptyTechnicalStore = (): TechnicalStore => ({ version: 1, rules: [], events: [] });
export function technicalChoices(family: TechnicalFamily) {
  if (family === "volume") return [{ value: "spike", label: "Volume spike above average" }, { value: "dry", label: "Volume falls below average" }, { value: "bullish", label: "High-volume bullish close" }, { value: "bearish", label: "High-volume bearish close" }];
  if (family === "ema" || family === "sma") return [{ value: "priceUp", label: "Price crosses above" }, { value: "priceDown", label: "Price crosses below" }, { value: "averageUp", label: "Fast average crosses above slow" }, { value: "averageDown", label: "Fast average crosses below slow" }];
  if (family === "bollinger") return [{ value: "upperOut", label: "Close breaks above upper band" }, { value: "lowerOut", label: "Close breaks below lower band" }, { value: "upperIn", label: "Returns inside from above" }, { value: "lowerIn", label: "Returns inside from below" }];
  if (family === "macd") return [{ value: "signalUp", label: "MACD crosses above signal" }, { value: "signalDown", label: "MACD crosses below signal" }, { value: "zeroUp", label: "Histogram crosses above zero" }, { value: "zeroDown", label: "Histogram crosses below zero" }];
  if (family === "supertrend") return [{ value: "up", label: "Turns bullish" }, { value: "down", label: "Turns bearish" }];
  if (family === "previousDay") return [{ value: "up", label: "Close breaks previous-day high" }, { value: "down", label: "Close breaks previous-day low" }];
  return [{ value: "up", label: family === "rsi" ? "Crosses above threshold" : "Price crosses above VWAP" }, { value: "down", label: family === "rsi" ? "Crosses below threshold" : "Price crosses below VWAP" }];
}
export function defaultTechnicalConfig(family: TechnicalFamily = "ema", timeframe: TechnicalFrame = "5m"): TechnicalConfig {
  return { family, timeframe, condition: technicalChoices(family)[0].value, period: family === "rsi" ? 14 : family === "supertrend" ? 10 : family === "macd" ? 12 : 20, slow: family === "macd" ? 26 : 50, signal: 9, threshold: 70, multiplier: family === "supertrend" ? 3 : 2, repeat: "once", cooldown: 0, days: 7 };
}
export function technicalConfigError(c: TechnicalConfig): string | null {
  if (!c || !Object.hasOwn(TECHNICAL_FAMILIES, c.family) || !Object.hasOwn(TECHNICAL_FRAMES, c.timeframe)) return "Choose a supported indicator and timeframe.";
  if (c.delivery !== undefined && !["device", "server"].includes(c.delivery)) return "Choose a valid monitoring mode.";
  if (!technicalChoices(c.family).some(o => o.value === c.condition)) return "Choose a valid condition.";
  if (![c.period, c.slow, c.signal].every(n => Number.isInteger(n) && n >= 2 && n <= 200)) return "Periods must be whole numbers from 2 to 200.";
  if ((c.family === "macd" || c.condition.startsWith("average")) && c.slow <= c.period) return "The slow period must be greater than the fast period.";
  if (!Number.isFinite(c.threshold) || c.threshold <= 0 || c.threshold >= 100) return "RSI threshold must be between 0 and 100.";
  if (!Number.isFinite(c.multiplier) || c.multiplier < 0.1 || c.multiplier > 10) return "Multiplier must be between 0.1 and 10.";
  if (c.family === "volume" && (c.condition === "dry" ? c.multiplier >= 1 : c.multiplier <= 1)) return c.condition === "dry" ? "Low-volume multiplier must be below 1×." : "High-volume multiplier must be above 1×.";
  if (!["once", "repeat"].includes(c.repeat) || !Number.isInteger(c.cooldown) || c.cooldown < 0 || c.cooldown > 1440 || ![1, 7, 30].includes(c.days)) return "Choose a valid repeat, cooldown and expiry.";
  if (c.family === "vwap" && c.timeframe === "1D") return "Session VWAP requires an intraday timeframe and traded volume.";
  return null;
}
export function technicalDescription(c: TechnicalConfig) {
  if (c.family === "volume") return `Volume (${c.period} prior bars · ${c.multiplier}×) · ${technicalChoices(c.family).find(o => o.value === c.condition)?.label ?? ""}`;
  const name = TECHNICAL_FAMILIES[c.family];
  const parameters = ["ema", "sma"].includes(c.family) ? `${c.period}${c.condition.startsWith("average") ? ` / ${c.slow}` : ""}` : c.family === "rsi" ? `${c.period} · ${c.threshold}` : c.family === "macd" ? `${c.period}, ${c.slow}, ${c.signal}` : ["supertrend", "bollinger"].includes(c.family) ? `${c.period}, ${c.multiplier}` : "";
  return `${name}${parameters ? ` (${parameters})` : ""} · ${technicalChoices(c.family).find(o => o.value === c.condition)?.label ?? ""}`;
}
export function parseTechnicalStore(raw: string | null): TechnicalStore {
  if (!raw) return emptyTechnicalStore();
  const value = JSON.parse(raw);
  if (value?.version !== 1 || !Array.isArray(value.rules) || !Array.isArray(value.events)) throw new Error("Saved technical alerts cannot be read. No changes were made.");
  const validInstrument = (i: Instrument) => i && typeof i.instrumentKey === "string" && typeof i.symbol === "string";
  if (value.rules.some((r: TechnicalRule) => !r?.id || !r.revision || !validInstrument(r.instrument) || technicalConfigError(r) || !["active", "paused", "completed", "expired"].includes(r.status) || ![r.createdAt, r.armedAt, r.expiresAt].every(Number.isFinite)) || value.events.some((e: TechnicalEvent) => !e?.id || !validInstrument(e.instrument) || !Object.hasOwn(TECHNICAL_FRAMES, e.timeframe) || ![e.createdAt, e.barTime, e.price].every(Number.isFinite))) throw new Error("Saved technical alerts cannot be read. No changes were made.");
  return { version: 1, rules: value.rules.slice(0, 40), events: value.events.slice(0, 200) };
}
export const technicalGroup = (r: TechnicalRule) => `${r.instrument.instrumentKey}:${r.timeframe}`;
export function technicalLimitError(rules: TechnicalRule[], candidate: TechnicalRule) {
  const others = rules.filter(r => r.id !== candidate.id);
  if (others.length >= 40) return "Delete an old technical alert first (40 saved alerts maximum).";
  const live = [...others, candidate].filter(r => r.status === "active" || r.status === "paused");
  if (live.length > 12) return "Keep at most 12 active or paused technical alerts.";
  if (new Set(live.map(technicalGroup)).size > 6) return "Use at most 6 symbol/timeframe combinations to keep monitoring lightweight.";
  return null;
}
const day = (time: number) => Math.floor((time + 19800) / 86400);
export function technicalBarEnd(time: number, timeframe: TechnicalFrame) {
  const close = day(time) * 86400 - 19800 + 15.5 * 3600;
  return timeframe === "1D" ? close : Math.min(time + TECHNICAL_FRAMES[timeframe], close);
}
export function technicalCheckDue(timeframe: TechnicalFrame, nowMs: number) {
  const now = nowMs / 1000, midnight = day(now) * 86400 - 19800;
  const open = midnight + 33300, close = midnight + 55800;
  if (now < open || now > close + 180) return false;
  const end = timeframe === "1D" || now >= close ? close : open + Math.floor((now - open) / TECHNICAL_FRAMES[timeframe]) * TECHNICAL_FRAMES[timeframe];
  return end > open && now - end >= 5 && now - end <= 180;
}
export function validTechnicalCandles(input: Candle[]) {
  if (!Array.isArray(input)) return [];
  return [...new Map(input.filter(c => c && [c.time, c.open, c.high, c.low, c.close, c.volume].every(Number.isFinite) && c.time > 0 && c.low > 0 && c.volume >= 0 && c.high >= Math.max(c.open, c.close, c.low) && c.low <= Math.min(c.open, c.close)).map(c => [c.time, c])).values()].sort((a, b) => a.time - b.time);
}
export type TechnicalEvaluation = { state: string; barTime?: number; end?: number; price?: number; hit?: boolean; detail?: string };
export function evaluateTechnical(rule: TechnicalConfig, raw: Candle[], daily: Candle[], nowMs: number): TechnicalEvaluation {
  const now = nowMs / 1000;
  // Allow the data provider five seconds to finalise a candle; never evaluate the forming bar.
  const data = validTechnicalCandles(raw).filter(c => (rule.timeframe === "1D" || ((c.time + 19800) % 86400 >= 33300 && (c.time + 19800) % 86400 < 55800)) && technicalBarEnd(c.time, rule.timeframe) + 5 <= now);
  const last = data.at(-1), previous = data.at(-2);
  if (!last || !previous) return { state: "Waiting for closed candles" };
  const end = technicalBarEnd(last.time, rule.timeframe);
  if (now - end > 180) return { state: "Waiting for a fresh candle close" };
  const baseline = { barTime: last.time, end, price: last.close };
  const required = rule.family === "volume" ? rule.period + 2 : rule.family === "macd" ? rule.slow + rule.signal + 1 : rule.family === "rsi" ? rule.period + 2 : ["ema", "sma", "supertrend", "bollinger"].includes(rule.family) ? (rule.condition.startsWith("average") ? rule.slow : rule.period) + 1 : 2;
  if (data.length < required) return { state: `Warming up · ${data.length}/${required} closed candles` };
  if (rule.family === "volume") {
    // Compare each bar with strictly PRIOR bars, never its own volume or future data.
    const window = data.slice(-required);
    if (window.some(c => c.volume <= 0)) return { state: "Waiting for valid traded volume · zero/missing volume is not a low-volume signal" };
    if (rule.timeframe !== "1D" && window.some((c, i) => i > 0 && day(c.time) === day(window[i - 1].time) && c.time - window[i - 1].time !== TECHNICAL_FRAMES[rule.timeframe])) return { state: "Waiting for uninterrupted volume history" };
    const average = (offset: number) => window.slice(offset, offset + rule.period).reduce((sum, c) => sum + c.volume, 0) / rule.period;
    const before = average(0), current = average(1), ratio0 = previous.volume / before, ratio1 = last.volume / current;
    const matches = (c: Candle, ratio: number) => rule.condition === "dry" ? ratio < rule.multiplier : ratio > rule.multiplier && (rule.condition === "bullish" ? c.close > c.open : rule.condition === "bearish" ? c.close < c.open : true);
    return { ...baseline, state: "Watching closed-candle volume", hit: matches(last, ratio1) && !matches(previous, ratio0), detail: `Volume ${last.volume.toLocaleString("en-IN")} · prior ${rule.period}-bar average ${current.toFixed(0)} · ${ratio1.toFixed(2)}×` };
  }
  let left: number[] = [], right: number[] = [], upward = /Up$/.test(rule.condition) || rule.condition === "up";
  if (rule.family === "ema" || rule.family === "sma") {
    const calc = rule.family === "ema" ? ema : sma;
    left = rule.condition.startsWith("average") ? calc(data, rule.period).map(v => v.value) : data.map(c => c.close);
    right = calc(data, rule.condition.startsWith("average") ? rule.slow : rule.period).map(v => v.value);
  } else if (rule.family === "rsi") {
    left = rsi(data, rule.period).map(v => v.value); right = data.map(() => rule.threshold);
  } else if (rule.family === "vwap") {
    const session = data.filter(c => day(c.time) === day(last.time));
    const open = day(last.time) * 86400 - 19800 + 9.25 * 3600;
    if (rule.timeframe === "1D" || session.length < 2 || session[0].time !== open || session.some((c, i) => i > 0 && c.time - session[i - 1].time !== TECHNICAL_FRAMES[rule.timeframe]) || session.slice(0, -1).reduce((n, c) => n + c.volume, 0) <= 0 || day(previous.time) !== day(last.time)) return { state: "Waiting for full session history and traded volume" };
    left = data.map(c => c.close); right = vwap(data).map(v => v.value);
  } else if (rule.family === "macd") {
    const values = macd(data, rule.period, rule.slow, rule.signal);
    left = values.map(v => rule.condition.startsWith("zero") ? v.histogram : v.macd);
    right = values.map(v => rule.condition.startsWith("zero") ? 0 : v.signal);
  } else if (rule.family === "supertrend") {
    const values = supertrend(data, rule.period, rule.multiplier);
    return { ...baseline, state: "Watching closed candles", hit: values.at(-1)!.direction === rule.condition && values.at(-2)!.direction !== rule.condition, detail: `Supertrend turned ${rule.condition === "up" ? "bullish" : "bearish"}` };
  } else if (rule.family === "bollinger") {
    const bands = bollingerBands(data, rule.period, rule.multiplier);
    const upper = rule.condition.startsWith("upper"), inside = rule.condition.endsWith("In");
    const p = previous.close, c = last.close, b0 = bands.at(-2)!, b1 = bands.at(-1)!;
    const hit = inside ? (upper ? p > b0.upper : p < b0.lower) && c >= b1.lower && c <= b1.upper : upper ? p <= b0.upper && c > b1.upper : p >= b0.lower && c < b1.lower;
    return { ...baseline, state: "Watching closed candles", hit, detail: `Close ${last.close.toFixed(2)} · band ${upper ? b1.upper.toFixed(2) : b1.lower.toFixed(2)}` };
  } else {
    const prior = validTechnicalCandles(daily).filter(c => day(c.time) < day(last.time)).at(-1);
    if (!prior || day(last.time) - day(prior.time) > 7) return { state: "Waiting for previous trading-day history" };
    left = data.map(c => c.close); right = data.map(() => rule.condition === "up" ? prior.high : prior.low);
  }
  const a0 = left.at(-2)!, a1 = left.at(-1)!, b0 = right.at(-2)!, b1 = right.at(-1)!;
  if (![a0, a1, b0, b1].every(Number.isFinite)) return { state: "Waiting for valid indicator values" };
  return { ...baseline, state: "Watching closed candles", hit: upward ? a0 <= b0 && a1 > b1 : a0 >= b0 && a1 < b1, detail: `${a0.toFixed(2)} → ${a1.toFixed(2)} · reference ${b1.toFixed(2)}` };
}
/** Pure atomic transition: the persisted cursor prevents duplicate delivery across refreshes/tabs. */
export function advanceTechnical(rule: TechnicalRule, evaluation: TechnicalEvaluation, now: number): { rule: TechnicalRule; event?: TechnicalEvent } {
  if (rule.status !== "active" || rule.expiresAt <= now || evaluation.barTime === undefined || evaluation.end === undefined || evaluation.price === undefined || (rule.lastBar ?? 0) >= evaluation.barTime) return { rule };
  const next = { ...rule, lastBar: evaluation.barTime };
  if (!evaluation.hit || evaluation.end * 1000 <= rule.armedAt || now - evaluation.end * 1000 > 180000 || (rule.lastTriggeredAt && now - rule.lastTriggeredAt < rule.cooldown * 60000)) return { rule: next };
  const event: TechnicalEvent = { id: `technical:${rule.id}:${rule.revision}:${evaluation.barTime}`, ruleId: rule.id, instrument: rule.instrument, timeframe: rule.timeframe, description: technicalDescription(rule), barTime: evaluation.barTime, createdAt: now, price: evaluation.price, detail: evaluation.detail ?? "Confirmed at candle close", kind: "trigger" };
  return { rule: { ...next, status: rule.repeat === "once" ? "completed" : "active", lastTriggeredAt: now }, event };
}
