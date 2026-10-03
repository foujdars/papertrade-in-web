import type { Candle } from "./market.ts";
import { advanceGlobalAccount, readGlobalAccount } from "./global-order-engine.ts";
import { configureBot, BOT_FRAMES, type BotConfig } from "./paper-bot-state.ts";
import { advancePaperBots } from "./paper-bot-engine.ts";
import { manageBotProtection } from "./bot-protection.ts";
import { closePerp, type PerpQuote, type PerpSpec } from "./global-markets.ts";
import { portfolioRisk, samplePortfolio, type WalletRisk } from "./portfolio-risk.ts";

export type BacktestOptions = { initialEquity: number; spreadBps: number; slippageBps: number; riskLimits?: WalletRisk };
export function backtestBot(config: BotConfig, input: Candle[], rules: PerpSpec, options: BacktestOptions) {
  if (!(options.initialEquity > 0) || !Number.isFinite(options.initialEquity) || ![options.spreadBps, options.slippageBps].every(v => Number.isFinite(v) && v >= 0 && v <= 100)) throw new Error("Check starting equity and execution assumptions.");
  const rows = [...input].sort((a, b) => a.time - b.time), seconds = BOT_FRAMES[config.timeframe];
  if (rows.length < Math.max(config.slow, config.period, config.atrPeriod ?? 14) + 5) throw new Error("Not enough history for these strategy periods.");
  if (rows.length > 10000 || rows.some((c, i) => ![c.time, c.open, c.high, c.low, c.close].every(v => Number.isFinite(v) && v > 0) || c.high < Math.max(c.open, c.close) || c.low > Math.min(c.open, c.close) || c.high < c.low || c.time % seconds || i > 0 && c.time - rows[i - 1].time !== seconds)) throw new Error("Backtest requires valid, contiguous candles at the chosen timeframe.");
  if (rules.symbol !== config.symbol) throw new Error("Contract rules do not match the strategy asset.");
  const start = Math.max(config.slow, config.period, config.atrPeriod ?? 14) + 2;
  let account = { ...readGlobalAccount(null), wallet: options.initialEquity, riskLimits: options.riskLimits, equityPeak: options.initialEquity, bots: [configureBot(undefined, config, true, rows[start - 1].time * 1000)] };
  const curve: { time: number; equity: number; benchmark: number }[] = [], rejected: Record<string, number> = {};
  const feeSpread = (options.spreadBps / 2 + options.slippageBps) / 10000;
  const quote = (price: number, now: number): PerpQuote => ({ symbol: config.symbol, mark: price, last: price, index: price, bid: price * (1 - feeSpread), ask: price * (1 + feeSpread), bidSize: Number.MAX_SAFE_INTEGER, askSize: Number.MAX_SAFE_INTEGER, funding: 0, change: 0, at: now, operational: true });
  let peak = options.initialEquity, maxDrawdownPercent = 0, lastQuote: PerpQuote | undefined;
  const record = (q: PerpQuote, at: number) => { const stats = portfolioRisk(account, { [config.symbol]: q }, at); peak = Math.max(peak, stats.equity); if (peak > 0) maxDrawdownPercent = Math.max(maxDrawdownPercent, (peak - stats.equity) / peak * 100); account = samplePortfolio(account, { [config.symbol]: q }, at) as typeof account; };
  for (let i = start; i < rows.length; i++) {
    const c = rows[i], history = rows.slice(0, i), now = c.time * 1000 + 1, spec = { ...rules, fetchedAt: now };
    lastQuote = quote(c.open, now);
    account = advanceGlobalAccount(account, { [config.symbol]: lastQuote }, { [config.symbol]: spec }, now) as typeof account;
    account = advancePaperBots(account, { [config.symbol]: { quote: lastQuote, spec } }, { [config.symbol]: { candles: history, fetchedAt: now } }, now) as typeof account;
    // Historical funding rates are not available here. Exclude funding explicitly.
    account = { ...account, positions: account.positions.map(p => ({ ...p, nextFunding: Number.MAX_SAFE_INTEGER })) };
    const status = account.bots[0].status;
    if (!status.startsWith("Watching") && !status.includes("paper entry") && !status.includes("already exists")) rejected[status] = (rejected[status] ?? 0) + 1;
    record(lastQuote, now);
    const side = account.positions[0]?.side;
    const path = side === "SELL" ? [c.open, c.high, c.low, c.close] : [c.open, c.low, c.high, c.close];
    for (let segment = 1; segment < path.length; segment++) {
      let from = path[segment - 1]; const to = path[segment];
      for (let step = 0; step < 12; step++) {
        const p = account.positions[0], state = p?.botExit, sign = p?.side === "SELL" ? -1 : 1;
        const levels = [p?.protection?.stopLoss?.trigger, p?.protection?.takeProfit?.trigger,
          state && !state.firstTaken && state.firstPercent > 0 ? p.entry + sign * Math.abs(p.entry - state.initialStop) * state.firstR : undefined,
          state && !state.secondTaken && state.secondPercent > 0 ? p.entry + sign * Math.abs(p.entry - state.initialStop) * state.secondR : undefined];
        const crosses = levels.filter((v): v is number => typeof v === "number" && (to > from ? v > from && v < to : v < from && v > to)).sort((a, b) => to > from ? a - b : b - a);
        const nextPrice = crosses[0] ?? to, at = now + segment * 1000 + step, q = quote(nextPrice, at);
        account = advanceGlobalAccount(account, { [config.symbol]: q }, { [config.symbol]: spec }, at) as typeof account;
        account = manageBotProtection(account, { [config.symbol]: q }, { [config.symbol]: history }, at) as typeof account;
        record(q, at); lastQuote = q; from = nextPrice;
        if (nextPrice === to) break;
      }
    }
    const at = lastQuote!.at, stats = portfolioRisk(account, { [config.symbol]: lastQuote }, at);
    curve.push({ time: c.time, equity: stats.equity, benchmark: options.initialEquity * c.close / rows[start].open });
  }
  if (account.positions.length && lastQuote) account = closePerp(account, config.symbol, lastQuote, account.positions[0].contracts, lastQuote.at, "CLOSE", "Backtest · end of sample") as typeof account;
  if (curve.length) curve[curve.length - 1].equity = account.wallet;
  peak = Math.max(peak, account.wallet); if (peak > 0) maxDrawdownPercent = Math.max(maxDrawdownPercent, (peak - account.wallet) / peak * 100);
  const exits = account.events.filter(e => e.kind === "CLOSE" || e.kind === "LIQUIDATION"), entries = account.events.filter(e => e.kind === "OPEN");
  const costs = account.events.reduce((n, e) => n + e.fee, 0);
  // Group partial exits by entry, so three tranches never become three winning trades.
  const groups: number[] = []; let current: number | null = null;
  for (const e of account.events) { if (e.kind === "OPEN") { if (current !== null) groups.push(current); current = -e.fee; } else if (current !== null) current += e.pnl - e.fee; }
  if (current !== null) groups.push(current);
  const gains = groups.reduce((n, p) => n + Math.max(0, p), 0), losses = -groups.reduce((n, p) => n + Math.min(0, p), 0);
  return { account, curve, trades: entries.length, exits: exits.length, net: account.wallet - options.initialEquity, costs, maxDrawdownPercent, winRate: groups.length ? groups.filter(p => p > 0).length / groups.length * 100 : null, profitFactor: losses > 0 ? gains / losses : null, benchmarkReturnPercent: curve.length ? (curve.at(-1)!.benchmark / options.initialEquity - 1) * 100 : null, rejected, assumptions: "Next-bar open entries; adverse extreme before favorable extreme; assumed spread and slippage; current contract rules; funding excluded. Partial exits count as one trade. Historical depth is unavailable." };
}
