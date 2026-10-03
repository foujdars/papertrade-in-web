export const BOT_ASSETS = { BTCUSD: "Bitcoin", ETHUSD: "Ethereum", SOLUSD: "Solana", XAUTUSD: "Gold · Tether Gold" } as const;
export type BotSymbol = keyof typeof BOT_ASSETS;
export const BOT_FRAMES = { "1m": 60, "5m": 300, "15m": 900, "1H": 3600 } as const;
export const BOT_STRATEGIES = { ema: "EMA crossover", rsi: "RSI reversal", breakout: "Range breakout" } as const;
export type BotConfig = {
  sizingMode?: "notional" | "risk"; riskPercent?: number; stopMode?: "percent" | "atr"; atrPeriod?: number; atrMultiplier?: number;
  breakEvenR?: number; trailAtr?: number; firstExitPercent?: number; secondExitPercent?: number; firstExitR?: number; secondExitR?: number;
  regimeFilter?: "any" | "trend" | "range";
  symbol: BotSymbol; strategy: keyof typeof BOT_STRATEGIES; timeframe: keyof typeof BOT_FRAMES;
  direction: "both" | "long" | "short"; fast: number; slow: number; period: number;
  oversold: number; overbought: number; notional: number; leverage: number;
  stopPercent: number; targetPercent: number; maxEntries: number; maxDailyLoss: number; cooldown: number;
};
export type PaperBot = BotConfig & { enabled: boolean; startedAt: number; lastCandle: number; lastEntryAt: number; status: string };
export const defaultBot = (symbol: BotSymbol): PaperBot => ({
  symbol, strategy: "ema", timeframe: "5m", direction: "both", fast: 9, slow: 21, period: 14,
  oversold: 30, overbought: 70, notional: 100, leverage: 1, stopPercent: 1, targetPercent: 2,
  maxEntries: 5, maxDailyLoss: 100, cooldown: 1, enabled: false, startedAt: 0, lastCandle: 0, lastEntryAt: 0, status: "Ready to configure",
});
export function validateBotConfig(c: BotConfig) {
  if (!Object.hasOwn(BOT_ASSETS, c.symbol) || !Object.hasOwn(BOT_FRAMES, c.timeframe) || !Object.hasOwn(BOT_STRATEGIES, c.strategy) || !["both", "long", "short"].includes(c.direction)) throw new Error("Choose a supported asset, strategy and timeframe.");
  const bounded = (v: number, lo: number, hi: number, integer = false) => Number.isFinite(v) && v >= lo && v <= hi && (!integer || Number.isSafeInteger(v));
  if (!bounded(c.fast, 2, 99, true) || !bounded(c.slow, 3, 100, true) || c.fast >= c.slow || !bounded(c.period, 2, 100, true)) throw new Error("Periods must be whole numbers from 2 to 100; fast EMA must be below slow EMA.");
  if (!bounded(c.oversold, 1, 49) || !bounded(c.overbought, 51, 99)) throw new Error("RSI thresholds must be 1–49 and 51–99.");
  if (!bounded(c.notional, 1, 100000) || !bounded(c.leverage, 1, 20, true)) throw new Error("Use $1–$100,000 notional and 1–20× leverage.");
  if (!bounded(c.stopPercent, .1, 25) || !bounded(c.targetPercent, .1, 50)) throw new Error("Stop loss must be 0.1–25% and target 0.1–50%.");
  if (c.sizingMode !== undefined && !["notional", "risk"].includes(c.sizingMode) || c.stopMode !== undefined && !["percent", "atr"].includes(c.stopMode) || c.regimeFilter !== undefined && !["any", "trend", "range"].includes(c.regimeFilter)) throw new Error("Choose valid sizing, stop and market filters.");
  for (const [key, lo, hi, integer] of [["riskPercent", .01, 10, false], ["atrPeriod", 2, 100, true], ["atrMultiplier", .1, 10, false], ["breakEvenR", 0, 10, false], ["trailAtr", 0, 10, false], ["firstExitPercent", 0, 90, false], ["secondExitPercent", 0, 90, false], ["firstExitR", .1, 20, false], ["secondExitR", .1, 30, false]] as const) {
    const value = c[key]; if (value !== undefined && !bounded(value, lo, hi, integer)) throw new Error(`Check ${key}.`);
  }
  if ((c.firstExitPercent ?? 0) + (c.secondExitPercent ?? 0) >= 100 || (c.firstExitR ?? 1.5) >= (c.secondExitR ?? 3)) throw new Error("Keep a runner portion and put the second target after the first.");
  if (!bounded(c.maxEntries, 1, 100, true) || !bounded(c.maxDailyLoss, 1, 10000) || !bounded(c.cooldown, 0, 100, true)) throw new Error("Check daily limits and cooldown (0–100 candles).");
}
export function validateSavedBots(bots: PaperBot[] | undefined) {
  if (bots === undefined) return;
  if (!Array.isArray(bots) || bots.length > 4 || new Set(bots.map(b => b?.symbol)).size !== bots.length) throw new Error("Saved bot settings are invalid; data has been preserved.");
  for (const b of bots) {
    validateBotConfig(b);
    if (typeof b.enabled !== "boolean" || typeof b.status !== "string" || b.status.length > 500 || ![b.startedAt, b.lastCandle, b.lastEntryAt].every(v => Number.isFinite(v) && v >= 0)) throw new Error("Saved bot state is invalid; data has been preserved.");
  }
}
export function configureBot(previous: PaperBot | undefined, config: BotConfig, enabled: boolean, now: number): PaperBot {
  validateBotConfig(config);
  const seconds = BOT_FRAMES[config.timeframe];
  return { ...config, enabled, startedAt: now, lastCandle: Math.floor(now / 1000 / seconds) * seconds - seconds, lastEntryAt: previous?.lastEntryAt ?? 0, status: enabled ? "Waiting for the next candle close" : "Paused · existing positions keep their TP/SL" };
}
export const botDay = (at: number) => new Date(at + 330 * 60000).toISOString().slice(0, 10);
