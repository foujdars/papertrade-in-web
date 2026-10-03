import type { PerpAccount, PerpQuote, PerpSpec } from "./global-markets.ts";

export type WalletRisk = { enabled: boolean; maxDailyLoss: number; maxDailyEntries: number; maxOpenRiskPercent: number; maxConcentrationPercent: number; maxDrawdownPercent: number };
export type EquitySample = { day: string; at: number; equity: number; wallet: number; benchmark: number | null };
export const defaultWalletRisk = (): WalletRisk => ({ enabled: false, maxDailyLoss: 200, maxDailyEntries: 10, maxOpenRiskPercent: 5, maxConcentrationPercent: 50, maxDrawdownPercent: 15 });
const day = (at: number) => new Date(at + 19800000).toISOString().slice(0, 10);
export function validateWalletRisk(r: WalletRisk) {
  if (typeof r.enabled !== "boolean" || ![r.maxDailyLoss, r.maxDailyEntries, r.maxOpenRiskPercent, r.maxConcentrationPercent, r.maxDrawdownPercent].every(n => Number.isFinite(n) && n > 0) || !Number.isInteger(r.maxDailyEntries) || r.maxDailyEntries > 1000 || [r.maxOpenRiskPercent, r.maxConcentrationPercent, r.maxDrawdownPercent].some(n => n > 100)) throw new Error("Check wallet risk limits.");
}
export function portfolioRisk(a: PerpAccount, quotes: Partial<Record<string, PerpQuote>>, now: number) {
  let equity = a.wallet, openRisk = 0, unprotected = 0, missing = 0;
  const concentration: Record<string, number> = {};
  for (const p of a.positions) {
    const q = quotes[p.symbol], valid = q && q.at <= now + 5000 && now - q.at <= 30000 && q.mark > 0;
    if (!valid) missing++;
    const price = valid ? q.mark : p.entry, sign = p.side === "BUY" ? 1 : -1;
    equity += Math.max(-p.margin, (price - p.entry) * sign * p.contracts * p.spec.lot);
    concentration[p.symbol] = (concentration[p.symbol] ?? 0) + price * p.contracts * p.spec.lot;
    const stop = p.protection?.stopLoss?.trigger ?? p.stop;
    if (!stop || !Number.isFinite(stop)) unprotected++;
    else openRisk += Math.max(0, (price - stop) * sign) * p.contracts * p.spec.lot + stop * p.contracts * p.spec.lot * p.spec.taker * 1.18;
  }
  // Options need their own fresh marks and risk model; never silently treat them as zero exposure.
  const unsupported = (a.optionPositions?.length ?? 0) + (a.optionOrders?.length ?? 0);
  const events = [...a.events, ...(a.optionEvents ?? [])].filter(e => day(e.at) === day(now));
  const dailyNet = events.reduce((n, e) => n + e.pnl - e.fee, 0), entries = events.filter(e => e.kind === "OPEN").length;
  const peak = Math.max(a.equityPeak ?? equity, equity);
  return { equity, openRisk, unprotected, missing, unsupported, concentration, dailyNet, entries, peak, drawdownPercent: peak > 0 ? Math.max(0, (peak - equity) / peak * 100) : 0 };
}
export function walletEntryReason(a: PerpAccount, quotes: Partial<Record<string, PerpQuote>>, now: number, spec: PerpSpec, price: number, contracts: number, stop: number | undefined) {
  const r = a.riskLimits ?? defaultWalletRisk(); validateWalletRisk(r);
  if (!r.enabled) return null;
  const s = portfolioRisk(a, quotes, now);
  if (s.missing) return "Wallet risk: waiting for fresh prices for every open position";
  if (s.unsupported) return "Wallet risk: review option exposure before adding perpetual trades";
  if (s.unprotected || !stop) return "Wallet risk: every entry needs a stop loss";
  if (s.dailyNet <= -r.maxDailyLoss) return "Wallet daily loss limit reached";
  if (s.entries + a.orders.filter(o => !o.reduceOnly).length >= r.maxDailyEntries) return "Wallet daily entry limit reached";
  if (s.drawdownPercent >= r.maxDrawdownPercent) return "Wallet drawdown pause active";
  if (a.orders.some(o => !o.reduceOnly)) return "Wallet risk: review pending entries before adding exposure";
  const notional = contracts * spec.lot * price, addedRisk = Math.abs(price - stop) * contracts * spec.lot + notional * spec.taker * 1.18 * 2;
  if (s.equity <= 0 || s.openRisk + addedRisk > s.equity * r.maxOpenRiskPercent / 100) return "Wallet aggregate open risk limit reached";
  if ((s.concentration[spec.symbol] ?? 0) + notional > s.equity * r.maxConcentrationPercent / 100) return "Wallet asset concentration limit reached";
  return null;
}
export function samplePortfolio(a: PerpAccount, quotes: Partial<Record<string, PerpQuote>>, now: number): PerpAccount {
  const s = portfolioRisk(a, quotes, now);
  if (s.missing || s.unsupported) return a;
  const previous = a.equitySamples?.at(-1), today = day(now), benchmark = quotes.BTCUSD;
  const validBenchmark = benchmark && now - benchmark.at <= 30000 && benchmark.at <= now + 5000;
  const peak = Math.max(a.equityPeak ?? s.equity, s.equity);
  // Daily observations are saved at most once per minute; missing days stay missing.
  if (previous?.day === today && now - previous.at < 60000 && peak === a.equityPeak) return a;
  const sample = { day: today, at: now, equity: s.equity, wallet: a.wallet, benchmark: validBenchmark ? benchmark.mark : null };
  return { ...a, revision: a.revision + 1, equityPeak: peak, equitySamples: [...(a.equitySamples ?? []).filter(p => p.day !== today), sample].slice(-730) };
}
export function equityMetrics(samples: EquitySample[]) {
  const points = [...samples].sort((a, b) => a.at - b.at);
  let peak = points[0]?.equity ?? 0, maxDrawdownPercent = 0;
  for (const p of points) { peak = Math.max(peak, p.equity); if (peak > 0) maxDrawdownPercent = Math.max(maxDrawdownPercent, (peak - p.equity) / peak * 100); }
  const first = points[0], last = points.at(-1), benchmarkPoints = points.filter(p => p.benchmark !== null), b0 = benchmarkPoints[0], b1 = benchmarkPoints.at(-1);
  const comparable = b0 && b1 && b0.day !== b1.day && b0.benchmark! > 0;
  return { count: points.length, maxDrawdownPercent, returnPercent: first && last && first.equity > 0 ? (last.equity / first.equity - 1) * 100 : null, benchmarkReturn: comparable ? (b1.benchmark! / b0.benchmark! - 1) * 100 : null, comparableReturn: comparable && b0.equity > 0 ? (b1.equity / b0.equity - 1) * 100 : null };
}
