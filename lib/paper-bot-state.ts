export const BOT_ASSETS = { BTCUSD: "Bitcoin", ETHUSD: "Ethereum", SOLUSD: "Solana", XAUTUSD: "Gold · Tether Gold" } as const;
export type BotSymbol = keyof typeof BOT_ASSETS;
export const BOT_FRAMES = { "1m": 60, "3m": 180, "5m": 300, "15m": 900, "30m": 1800, "1H": 3600, "4H": 14400, "1D": 86400 } as const;
export type BotFrame = keyof typeof BOT_FRAMES;
export const BOT_STRATEGIES = { ema21: "My EMA 21 entry", ema5: "My EMA 5 reversal", ema: "EMA crossover", rsi: "RSI reversal", breakout: "Range breakout" } as const;
export const BOT_RULES = {
  ema21: "EMA 21 cross → opposite-colour pullback → break of that candle. Long: bullish cross, red pullback above EMA 21, green trigger breaking its high. Short: the mirrored bearish setup. The bot confirms on candle close.",
  ema5: "Your long reversal: the previous candle touches EMA 5, then a completed candle of either colour has its entire low above EMA 5. Short mode uses the mirrored rule: its entire high below EMA 5 after a touch.",
  ema: "Long when the fast EMA crosses above the slow EMA; short on the opposite crossover.",
  rsi: "Long when RSI crosses back above oversold; short when it crosses back below overbought.",
  breakout: "Long when the candle closes above prior range highs; short below prior range lows.",
} as const;
export type BotConfig = {
  symbol: BotSymbol; strategy: keyof typeof BOT_STRATEGIES; timeframe: BotFrame;
  direction: "both" | "long" | "short"; fast: number; slow: number; period: number;
  oversold: number; overbought: number; notional: number; leverage: number;
  stopPercent: number; targetPercent: number; maxEntries: number; maxDailyLoss: number; cooldown: number;
  // Optional fields preserve existing saved strategies and their percentage exits.
  timeframes?: BotFrame[]; trendTimeframe?: BotFrame | "off"; trendPeriod?: number;
  sizing?: "notional" | "risk"; riskUsd?: number; exitMode?: "percent" | "signal"; riskReward?: number; stopBufferTicks?: number;
};
export type BotDecision = { at: number; timeframe: BotFrame; candle: number; side: "BUY" | "SELL" | null; outcome: "waiting" | "skipped" | "entered"; reason: string };
export type PaperBot = BotConfig & {
  enabled: boolean; startedAt: number; lastCandle: number; lastEntryAt: number; status: string;
  lastCandles?: Partial<Record<BotFrame, number>>; frameStatus?: Partial<Record<BotFrame, string>>; decisions?: BotDecision[];
};
export function botFrames(config: BotConfig): BotFrame[] {
  return [...(config.timeframes ?? [config.timeframe])].sort((a, b) => BOT_FRAMES[a] - BOT_FRAMES[b]);
}
export const botScope = (symbol: string, frame: BotFrame) => `${symbol}:${frame}`;
export const defaultBot = (symbol: BotSymbol): PaperBot => ({
  symbol, strategy: "ema", timeframe: "5m", direction: "both", fast: 9, slow: 21, period: 14,
  oversold: 30, overbought: 70, notional: 100, leverage: 1, stopPercent: 1, targetPercent: 2,
  maxEntries: 5, maxDailyLoss: 100, cooldown: 1, enabled: false, startedAt: 0, lastCandle: 0, lastEntryAt: 0, status: "Ready to configure",
  trendTimeframe: "off", trendPeriod: 21, sizing: "notional", riskUsd: 5, exitMode: "percent", riskReward: 2, stopBufferTicks: 1,
});
export function botPreset(config: BotConfig, strategy: "ema21" | "ema5"): BotConfig {
  return { ...config, strategy, timeframe: "5m", timeframes: ["5m", "15m"], direction: strategy === "ema5" ? "long" : "both", exitMode: "signal", riskReward: 2, stopBufferTicks: 1, trendTimeframe: "off" };
}
export function validateBotConfig(c: BotConfig) {
  if (!Object.hasOwn(BOT_ASSETS, c.symbol) || !Object.hasOwn(BOT_FRAMES, c.timeframe) || !Object.hasOwn(BOT_STRATEGIES, c.strategy) || !["both", "long", "short"].includes(c.direction)) throw new Error("Choose a supported asset, strategy and timeframe.");
  if (c.timeframes !== undefined && (!Array.isArray(c.timeframes) || c.timeframes.length < 1 || c.timeframes.length > 4 || new Set(c.timeframes).size !== c.timeframes.length || c.timeframes.some(f => !Object.hasOwn(BOT_FRAMES, f)) || !c.timeframes.includes(c.timeframe))) throw new Error("Choose one to four distinct entry timeframes including the primary timeframe.");
  const bounded = (v: number, lo: number, hi: number, integer = false) => Number.isFinite(v) && v >= lo && v <= hi && (!integer || Number.isSafeInteger(v));
  if (!bounded(c.fast, 2, 99, true) || !bounded(c.slow, 3, 100, true) || c.fast >= c.slow || !bounded(c.period, 2, 100, true)) throw new Error("Periods must be whole numbers from 2 to 100; fast EMA must be below slow EMA.");
  if (!bounded(c.oversold, 1, 49) || !bounded(c.overbought, 51, 99)) throw new Error("RSI thresholds must be 1–49 and 51–99.");
  if (!bounded(c.notional, 1, 100000) || !bounded(c.leverage, 1, 20, true)) throw new Error("Use $1–$100,000 notional and 1–20× leverage.");
  if (!bounded(c.stopPercent, .1, 25) || !bounded(c.targetPercent, .1, 50)) throw new Error("Stop loss must be 0.1–25% and target 0.1–50%.");
  if (!bounded(c.maxEntries, 1, 100, true) || !bounded(c.maxDailyLoss, 1, 10000) || !bounded(c.cooldown, 0, 100, true)) throw new Error("Check daily limits and cooldown (0–100 candles).");
  if (c.trendTimeframe !== undefined && c.trendTimeframe !== "off" && (!Object.hasOwn(BOT_FRAMES, c.trendTimeframe) || BOT_FRAMES[c.trendTimeframe] <= Math.max(...botFrames(c).map(f => BOT_FRAMES[f])))) throw new Error("The trend filter must use a timeframe higher than every entry timeframe.");
  if (!bounded(c.trendPeriod ?? 21, 2, 100, true) || !bounded(c.riskUsd ?? 5, .1, 10000) || !bounded(c.riskReward ?? 2, .5, 10) || !bounded(c.stopBufferTicks ?? 1, 0, 100, true)) throw new Error("Check trend EMA, risk budget, reward multiple and stop buffer.");
  if (!['notional', 'risk'].includes(c.sizing ?? 'notional') || !['percent', 'signal'].includes(c.exitMode ?? 'percent')) throw new Error("Choose supported trade sizing and exit modes.");
}
export function validateSavedBots(bots: PaperBot[] | undefined) {
  if (bots === undefined) return;
  if (!Array.isArray(bots) || bots.length > 4 || new Set(bots.map(b => b?.symbol)).size !== bots.length) throw new Error("Saved bot settings are invalid; data has been preserved.");
  for (const b of bots) {
    validateBotConfig(b);
    if (typeof b.enabled !== "boolean" || typeof b.status !== "string" || b.status.length > 500 || ![b.startedAt, b.lastCandle, b.lastEntryAt].every(v => Number.isFinite(v) && v >= 0)) throw new Error("Saved bot state is invalid; data has been preserved.");
    for (const [map, numeric] of [[b.lastCandles, true], [b.frameStatus, false]] as const) {
      if (map !== undefined && (!map || typeof map !== "object" || Array.isArray(map) || Object.entries(map).some(([f, v]) => !Object.hasOwn(BOT_FRAMES, f) || (numeric ? typeof v !== "number" || !Number.isSafeInteger(v) || v < 0 : typeof v !== "string" || v.length > 500)))) throw new Error("Saved timeframe state is invalid; data has been preserved.");
    }
    if (b.decisions !== undefined && (!Array.isArray(b.decisions) || b.decisions.length > 40 || b.decisions.some(d => !d || !Object.hasOwn(BOT_FRAMES, d.timeframe) || !['BUY', 'SELL', null].includes(d.side) || !['waiting', 'skipped', 'entered'].includes(d.outcome) || typeof d.reason !== "string" || d.reason.length > 500 || ![d.at, d.candle].every(v => Number.isFinite(v) && v >= 0)))) throw new Error("Saved decision log is invalid; data has been preserved.");
  }
}
export function configureBot(previous: PaperBot | undefined, config: BotConfig, enabled: boolean, now: number): PaperBot {
  validateBotConfig(config);
  const frames = botFrames(config);
  const lastCandles = Object.fromEntries(frames.map(frame => [frame, Math.floor(now / 1000 / BOT_FRAMES[frame]) * BOT_FRAMES[frame] - BOT_FRAMES[frame]]));
  // Copy configuration only; a stale editor must never overwrite consumed candles or logs.
  const { symbol, strategy, timeframe, direction, fast, slow, period, oversold, overbought, notional, leverage, stopPercent, targetPercent, maxEntries, maxDailyLoss, cooldown, trendTimeframe, trendPeriod, sizing, riskUsd, exitMode, riskReward, stopBufferTicks } = config;
  return { symbol, strategy, timeframe, direction, fast, slow, period, oversold, overbought, notional, leverage, stopPercent, targetPercent, maxEntries, maxDailyLoss, cooldown, trendTimeframe, trendPeriod, sizing, riskUsd, exitMode, riskReward, stopBufferTicks,
    timeframes: frames, enabled, startedAt: now, lastCandles, lastCandle: lastCandles[timeframe], lastEntryAt: previous?.lastEntryAt ?? 0,
    decisions: previous?.decisions ?? [], frameStatus: Object.fromEntries(frames.map(f => [f, "Waiting for a new candle close"])),
    status: enabled ? "Waiting for the next candle close" : "Paused · existing positions keep their TP/SL" };
}
export const botDay = (at: number) => new Date(at + 330 * 60000).toISOString().slice(0, 10);
