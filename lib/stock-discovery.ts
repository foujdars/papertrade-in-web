import type { Candle, Instrument } from "./market";
import type { ScreeningResult } from "./fundamental-screener.ts";
import { metricMedian, resolveFundamentalInstrument } from "./fundamental-analysis.ts";
import { calculateUpstoxEquityCharges } from "./trading-charges.ts";

export const STOCK_HORIZONS = {
  "1M": { label: "1 month", sessions: 21, weights: [25, 45, 20, 10] },
  "3M": { label: "3 months", sessions: 63, weights: [35, 35, 20, 10] },
  "6M": { label: "6 months", sessions: 126, weights: [50, 25, 15, 10] },
  "12M": { label: "12 months", sessions: 252, weights: [60, 20, 10, 10] },
} as const;
export type StockHorizon = keyof typeof STOCK_HORIZONS;
export const HORIZON_KEYS = Object.keys(STOCK_HORIZONS) as StockHorizon[];
const clamp = (v: number) => Math.max(0, Math.min(100, v));
const mean = (v: number[]) => v.reduce((a, b) => a + b, 0) / (v.length || 1);
const finite = (v: number | null): v is number => v != null && Number.isFinite(v);
const higher = (v: number | null, lo: number, hi: number) => finite(v) ? clamp((v - lo) / (hi - lo) * 100) : 0;
const lower = (v: number | null, lo: number, hi: number) => finite(v) && v >= 0 ? clamp((hi - v) / (hi - lo) * 100) : 0;
export const indiaDay = (ms: number) => new Date(ms + 19800000).toISOString().slice(0, 10);
const growth = (a: number | null, b: number | null) => finite(a) && finite(b) && b > 0 ? (a / b - 1) * 100 : null;
export function discoveryFundamentals(result: ScreeningResult) {
  const m = result.metrics;
  const qualityValues = [m.roe, m.roe3, m.roe5, m.roce, m.roce3, m.roce5];
  const growthValues = [m.profit3, m.profit5, m.sales3, m.sales5, m.quarterProfitGrowth, m.quarterSalesGrowth, growth(m.ttmProfit, m.priorYearProfit), growth(m.ttmSales, m.priorYearSales)];
  const peRelative = finite(m.pe) && m.pe > 0 && finite(m.industryPe) && m.industryPe > 0 ? m.pe / m.industryPe : null;
  const peg = finite(m.peg) && m.peg > 0 ? m.peg : null;
  const quality = mean(qualityValues.map(v => higher(v, 8, 30)));
  const expansion = mean(growthValues.map(v => higher(v, 0, 30)));
  const valuation = mean([lower(peRelative, .5, 2), lower(peg, .4, 2.2)]);
  const balance = mean([lower(m.debtEquity, 0, .5), higher(m.currentRatio, 1, 3), higher(m.quickRatio, .8, 2.2)]);
  const inputs = [...qualityValues, ...growthValues, peRelative, peg, m.debtEquity, m.currentRatio, m.quickRatio];
  return { total: quality * .35 + expansion * .3 + valuation * .2 + balance * .15, quality, growth: expansion, valuation, balance, coverage: inputs.filter(finite).length / inputs.length * 100 };
}
export type DiscoveryCandidate = { result: ScreeningResult; instrument: Instrument; fundamentals: ReturnType<typeof discoveryFundamentals> };
export function discoveryCandidates(results: ScreeningResult[], instruments: Instrument[], limit = 24) {
  const excluded: { name: string; reason: string }[] = [], seen = new Set<string>();
  const pool: DiscoveryCandidate[] = [];
  for (const result of results) {
    const instrument = resolveFundamentalInstrument(result, instruments), fundamentals = discoveryFundamentals(result);
    const reason = result.isFinancial ? "Financial business · separate sector model needed" : result.gateStatus !== "review" ? "Failed screening gates" : result.decision === "rejected" ? "Declined in research review" : !instrument ? "No listed instrument or valid ISIN" : fundamentals.coverage < 70 ? "Less than 70% scoring data coverage" : seen.has(result.isin.trim().toUpperCase() || instrument.instrumentKey) ? "Duplicate instrument" : "";
    if (reason) { excluded.push({ name: result.name, reason }); continue; }
    seen.add(result.isin.trim().toUpperCase() || instrument!.instrumentKey);
    pool.push({ result, instrument: instrument!, fundamentals });
  }
  pool.sort((a, b) => b.fundamentals.total - a.fundamentals.total || a.instrument.instrumentKey.localeCompare(b.instrument.instrumentKey));
  const industryCount = new Map<string, number>();
  const selected = pool.filter(c => { const group = c.result.industry.trim().toLowerCase(), count = industryCount.get(group) ?? 0; industryCount.set(group, count + 1); return count < 6; }).slice(0, limit);
  return { selected, eligible: pool.length, excluded, notScanned: pool.length - selected.length };
}
/** Daily research excludes the forming session and rejects bad OHLC, duplicate days and stale history. */
export function researchCandles(rows: Candle[], now: number) {
  const today = indiaDay(now), minutes = (now / 60000 + 330) % 1440;
  const sorted = rows.filter(c => Number.isFinite(c.time) && c.time > 0 && c.time * 1000 <= now && indiaDay(c.time * 1000) <= today && (indiaDay(c.time * 1000) < today || minutes >= 15 * 60 + 35)).sort((a, b) => a.time - b.time).slice(-320);
  const days = new Set<string>();
  for (const c of sorted) {
    const day = indiaDay(c.time * 1000);
    if (days.has(day) || ![c.open, c.high, c.low, c.close].every(v => Number.isFinite(v) && v > 0) || !Number.isFinite(c.volume) || c.volume < 0 || c.high < Math.max(c.open, c.close) || c.low > Math.min(c.open, c.close)) throw new Error("Invalid or duplicate daily candles");
    days.add(day);
  }
  if (sorted.length < 50) throw new Error("At least 50 completed daily sessions are required");
  if (now - sorted.at(-1)!.time * 1000 > 7 * 86400000) throw new Error("Latest daily close is over seven days old");
  if (sorted.slice(1).some((c, i) => c.time - sorted[i].time > 10 * 86400)) throw new Error("Daily history has a gap longer than ten days");
  return sorted;
}
export type DiscoveryStock = DiscoveryCandidate & { candles: Candle[]; entry: number; stop: number; stopPercent: number; atrPercent: number; turnover: number; asOf: string };
export function analyseDiscovery(candidate: DiscoveryCandidate, rows: Candle[], now: number): DiscoveryStock {
  const candles = researchCandles(rows, now), entry = candles.at(-1)!.close;
  const recent = candles.slice(-21);
  const atr = mean(recent.slice(1).map((c, i) => Math.max(c.high - c.low, Math.abs(c.high - recent[i].close), Math.abs(c.low - recent[i].close))));
  const atrPercent = atr / entry * 100, stopPercent = Math.max(5, atrPercent * 2.5);
  return { ...candidate, candles, entry, stop: Math.floor(entry * (1 - stopPercent / 100) * 100) / 100, stopPercent, atrPercent, turnover: metricMedian(candles.slice(-20).map(c => c.close * c.volume)) ?? 0, asOf: indiaDay(candles.at(-1)!.time * 1000) };
}
export function rankDiscovery(stocks: DiscoveryStock[], horizon: StockHorizon, options: { minTurnover: number; industryCap: number; trendOnly: boolean }, benchmark?: Candle[]) {
  const { sessions, weights } = STOCK_HORIZONS[horizon];
  const asOf = stocks.map(s => s.asOf).sort().at(-1);
  const excluded: { name: string; reason: string }[] = [];
  const usable = stocks.flatMap(stock => {
    const closes = stock.candles.map(c => c.close), last = stock.entry;
    const sma = (n: number) => mean(closes.slice(-n));
    const reason = stock.asOf !== asOf ? "Price date differs from latest scan session" : closes.length <= sessions ? `Needs ${sessions + 1} sessions for ${horizon}` : stock.stopPercent > 10 || stock.stop <= 0 ? "2.5 ATR stop exceeds 10% price distance" : stock.turnover < options.minTurnover ? "Below minimum 20-session median turnover" : options.trendOnly && last <= sma(50) ? "Below 50-session moving average" : "";
    if (reason) { excluded.push({ name: stock.result.name, reason }); return []; }
    const momentum = (last / closes[closes.length - 1 - sessions] - 1) * 100;
    const checks = horizon === "1M" ? [last > sma(20), last > sma(50)] : horizon === "3M" ? [last > sma(20), last > sma(50), sma(20) > sma(50)] : horizon === "6M" ? [last > sma(50), sma(50) > sma(100)] : [last > sma(50), last > sma(200), sma(50) > sma(200)];
    const trend = checks.filter(Boolean).length / checks.length * 100;
    const benchmarkReturn = benchmark && benchmark.length > sessions && indiaDay(benchmark.at(-1)!.time * 1000) === stock.asOf && indiaDay(benchmark[benchmark.length - 1 - sessions].time * 1000) === indiaDay(stock.candles[stock.candles.length - 1 - sessions].time * 1000) ? (benchmark.at(-1)!.close / benchmark[benchmark.length - 1 - sessions].close - 1) * 100 : null;
    return [{ ...stock, momentum, trend, benchmarkReturn, excess: benchmarkReturn == null ? null : momentum - benchmarkReturn }];
  });
  const ranked = usable.map(stock => {
    const n = usable.length;
    const momentumScore = n < 2 ? 50 : (usable.filter(s => s.momentum < stock.momentum).length + (usable.filter(s => s.momentum === stock.momentum).length - 1) / 2) / (n - 1) * 100;
    const riskScore = clamp(100 - stock.atrPercent * 12.5);
    const parts = [stock.fundamentals.total, momentumScore, stock.trend, riskScore];
    return { ...stock, horizon, momentumScore, riskScore, score: parts.reduce((sum, value, i) => sum + value * weights[i] / 100, 0) };
  }).sort((a, b) => b.score - a.score || a.instrument.instrumentKey.localeCompare(b.instrument.instrumentKey));
  const counts = new Map<string, number>();
  const picks = ranked.filter(s => { const industry = s.result.industry.trim().toLowerCase(), count = counts.get(industry) ?? 0; counts.set(industry, count + 1); return count < options.industryCap; }).slice(0, 15);
  return { picks, eligible: ranked.length, excluded, asOf, diversificationOmissions: ranked.length - picks.length };
}
export type RankedDiscovery = ReturnType<typeof rankDiscovery>["picks"][number];
export type ResearchOrderDraft = { instrument: Instrument; quantity: number; stop: number; target: number; budget: number; riskBudget: number; reference: number; asOf: string; thesis: string };
const charges = (quantity: number, price: number, side: "BUY" | "SELL") => quantity ? calculateUpstoxEquityCharges({ quantity, price, side, product: "DELIVERY" }).total : 0;
export function researchTradePlan(entry: number, stop: number, budget: number, riskBudget: number, rewardMultiple: number) {
  if (![entry, stop, budget, riskBudget, rewardMultiple].every(v => Number.isFinite(v) && v > 0) || stop >= entry || budget > 1e8 || riskBudget > 1e8 || rewardMultiple > 10) throw new Error("Enter positive budgets, a stop below entry, and a reward multiple up to 10");
  const target = Math.round((entry + (entry - stop) * rewardMultiple) * 100) / 100;
  let lo = 0, hi = Math.floor(budget / entry);
  while (lo < hi) {
    const qty = Math.ceil((lo + hi) / 2), cost = qty * entry + charges(qty, entry, "BUY"), loss = qty * (entry - stop) + charges(qty, entry, "BUY") + charges(qty, stop, "SELL");
    if (cost <= budget && loss <= riskBudget) lo = qty; else hi = qty - 1;
  }
  const quantity = lo, entryFees = charges(quantity, entry, "BUY"), cost = quantity * entry + entryFees;
  return { quantity, target, cost, entryFees, stopLoss: quantity * (entry - stop) + entryFees + charges(quantity, stop, "SELL"), targetProfit: quantity * (target - entry) - entryFees - charges(quantity, target, "SELL"), pnlAt: (exit: number) => quantity * (exit - entry) - entryFees - charges(quantity, exit, "SELL") };
}
export function researchExecutionError(draft: ResearchOrderDraft, quantity: number, price: number, stop: number, target: number) {
  if (![price, stop, target].every(v => Number.isFinite(v) && v > 0) || stop >= price || target <= price) return "Review the research stop and target against the live price.";
  if (!Number.isSafeInteger(quantity) || quantity < 1) return "Enter a positive whole-share quantity.";
  if (quantity * price + charges(quantity, price, "BUY") > draft.budget) return "Live order cost exceeds the research budget. Reduce quantity or start a new plan.";
  if (quantity * (price - stop) + charges(quantity, price, "BUY") + charges(quantity, stop, "SELL") > draft.riskBudget) return "Live planned loss exceeds the research risk budget. Reduce quantity or review the stop.";
  return null;
}
