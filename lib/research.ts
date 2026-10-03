import type { Candle } from "./market.ts";
export type FundamentalData = { pe: number | null; roe: number | null; debtEquity: number | null; currentRatio: number | null; revenueGrowth: number | null; profitMargin: number | null; sector: string; asOf: number; financialPeriod: number | null; source: string; sourceUrl: string };
export type Headline = { title: string; publishedAt: number; url: string; source: string };
export type ResearchInput = { symbol: string; name: string; sector: string; candles: Candle[]; fundamentals: FundamentalData | null; headlines: Headline[]; errors: string[] };
export type FactorName = "momentum" | "trend" | "volume" | "relativeStrength" | "sentiment";
export type FundamentalResult = { status: "pass" | "flag" | "unknown"; score: number | null; checks: { label: string; value: number | null; state: "pass" | "flag" | "unknown" | "context" }[] };
export type SentimentReading = { score: number | null; count: number; excluded: number; headlines: (Headline & { score: number })[]; coverage: string };
export type ResearchRow = { symbol: string; name: string; sector: string; price: number; priceAsOf: number; score: number; rank: number; factors: Partial<Record<FactorName, number>>; raw: Partial<Record<FactorName, number>>; fundamentalData: FundamentalData | null; fundamental: FundamentalResult; sentiment: SentimentReading; errors: string[] };
export type MarketRegime = { state: "trend" | "range" | "stress" | "unknown"; direction: "up" | "down" | "flat"; breadth: number | null; vix: number | null; reason: string };
export type DailyResearch = { version: 1; generatedAt: number; scanDay: string; source: string; requested: number; scanned: number; partial: boolean; rows: ResearchRow[]; regime: MarketRegime; errors: string[]; benchmark: { symbol: string; price: number; asOf: number } | null };
const validNumber = (v: number | null | undefined): v is number => v !== null && v !== undefined && Number.isFinite(v);
export function screenFundamentals(data: FundamentalData | null, now: number): FundamentalResult {
  const usable = data && data.asOf <= now && now - data.asOf <= 30 * 86400000 && (!data.financialPeriod || data.financialPeriod <= now && now - data.financialPeriod <= 550 * 86400000);
  const financial = /financial|bank|insurance|finance/i.test(data?.sector ?? "");
  const checks: FundamentalResult["checks"] = [
    { label: "P/E", value: usable ? data.pe : null, state: "unknown" },
    { label: "ROE (%)", value: usable ? data.roe : null, state: "unknown" },
    { label: "Debt/equity", value: usable ? data.debtEquity : null, state: "unknown" },
    { label: "Current ratio", value: usable ? data.currentRatio : null, state: "unknown" },
    { label: "Revenue growth (%)", value: usable ? data.revenueGrowth : null, state: "unknown" },
    { label: "Profit margin (%)", value: usable ? data.profitMargin : null, state: "unknown" },
  ];
  checks.forEach((c, i) => { if (!validNumber(c.value)) return; if (i === 0 || financial && (i === 2 || i === 3)) { c.state = "context"; return; } c.state = (i === 1 ? c.value >= 10 : i === 2 ? c.value <= 2 && c.value >= 0 : i === 3 ? c.value >= 1 : c.value > 0) ? "pass" : "flag"; });
  const scored = checks.filter(c => c.state === "pass" || c.state === "flag"), flags = scored.filter(c => c.state === "flag").length;
  return { checks, score: scored.length ? (scored.length - flags) / scored.length * 100 : null, status: flags ? "flag" : scored.length >= 2 ? "pass" : "unknown" };
}
const positive = new Set(["growth", "profit", "profits", "upgrade", "upgraded", "expansion", "record", "beats", "strong", "improved", "wins", "approved", "dividend"]);
const negative = new Set(["loss", "losses", "downgrade", "downgraded", "fraud", "default", "lawsuit", "probe", "decline", "weak", "misses", "penalty", "resigns", "cuts"]);
export function scoreHeadline(title: string) {
  let total = 0, hits = 0;
  for (const clause of title.toLowerCase().split(/[.!?;,:]|\bbut\b/)) {
    const words = clause.match(/[a-z]+/g) ?? [];
    words.forEach((w, i) => { let value = positive.has(w) ? 1 : negative.has(w) ? -1 : 0; if (!value) return; if (words.slice(Math.max(0, i - 3), i).some(v => ["not", "no", "never", "without"].includes(v))) value *= -1; total += value; hits++; });
  }
  return hits ? total / hits : 0;
}
export function datedSentiment(headlines: Headline[], now: number, maxAgeDays = 5): SentimentReading {
  const seen = new Set<string>(); let excluded = 0;
  const usable = headlines.filter(h => {
    const key = h.title.toLowerCase().replace(/[^a-z0-9]/g, "");
    const valid = !!key && h.title.length <= 1000 && Number.isFinite(h.publishedAt) && h.publishedAt > 0 && h.publishedAt <= now && now - h.publishedAt <= maxAgeDays * 86400000 && /^https?:\/\//.test(h.url) && !seen.has(key);
    if (!valid) { excluded++; return false; } seen.add(key); return true;
  }).map(h => ({ ...h, score: scoreHeadline(h.title) })).sort((a, b) => b.publishedAt - a.publishedAt).slice(0, 30);
  const weighted = usable.map(h => ({ score: h.score, weight: Math.exp(-(now - h.publishedAt) / (2 * 86400000)) }));
  const weight = weighted.reduce((n, h) => n + h.weight, 0);
  const score = weight ? weighted.reduce((n, h) => n + h.score * h.weight, 0) / weight * usable.length / (usable.length + 3) : null;
  return { score, count: usable.length, excluded, headlines: usable, coverage: usable.length ? `${usable.length} dated headlines · last ${maxAgeDays} days` : "No fresh dated headlines" };
}
export function validResearchCandles(input: Candle[], now: number) {
  const map = new Map<number, Candle>();
  for (const c of input) if ([c.time, c.open, c.high, c.low, c.close].every(v => Number.isFinite(v) && v > 0) && c.time * 1000 <= now && c.high >= Math.max(c.open, c.close) && c.low <= Math.min(c.open, c.close) && c.high >= c.low) map.set(c.time, c);
  return [...map.values()].sort((a, b) => a.time - b.time);
}
function ema(values: number[], period: number) { if (values.length < period) return null; let value = values.slice(0, period).reduce((a, b) => a + b, 0) / period; for (const v of values.slice(period)) value += 2 / (period + 1) * (v - value); return value; }
function performance(rows: Candle[], days: number) { return rows.length > days ? rows.at(-1)!.close / rows.at(-days - 1)!.close - 1 : null; }
export function researchFactors(candles: Candle[], benchmark: Candle[]) {
  const last = candles.at(-1), values = candles.map(c => c.close), average = ema(values, 20);
  if (!last) return {};
  const momentum = performance(candles, 63), benchmarkByTime = new Map(benchmark.map(c => [c.time, c]));
  const aligned = candles.filter(c => benchmarkByTime.has(c.time));
  const pairedBenchmark = aligned.map(c => benchmarkByTime.get(c.time)!);
  const stockReturn = performance(aligned, 63), indexReturn = performance(pairedBenchmark, 63);
  const priorVolume = candles.slice(-21, -1).map(c => c.volume).filter((v): v is number => validNumber(v) && v >= 0), volumeAvg = priorVolume.length === 20 ? priorVolume.reduce((a, b) => a + b, 0) / 20 : 0;
  return { ...(momentum !== null ? { momentum } : {}), ...(average ? { trend: last.close / average - 1 } : {}), ...(volumeAvg > 0 && validNumber(last.volume) ? { volume: last.volume / volumeAvg } : {}), ...(stockReturn !== null && indexReturn !== null ? { relativeStrength: stockReturn - indexReturn } : {}) };
}
export function rankResearch<T extends { symbol: string; raw: Partial<Record<FactorName, number>> }>(rows: T[]): (T & { rank: number; score: number; factors: Partial<Record<FactorName, number>> })[] {
  const weights: Record<FactorName, number> = { momentum: .3, trend: .25, volume: .2, relativeStrength: .2, sentiment: .05 };
  const factors: FactorName[] = ["momentum", "trend", "volume", "relativeStrength", "sentiment"];
  const ranked = rows.map(row => {
    const scores: Partial<Record<FactorName, number>> = {};
    for (const factor of factors) {
      const value = row.raw[factor]; if (!validNumber(value)) continue;
      const values = rows.map(r => r.raw[factor]).filter(validNumber);
      if (values.length < 2) continue;
      scores[factor] = (values.filter(v => v < value).length + (values.filter(v => v === value).length - 1) / 2) / (values.length - 1) * 100;
    }
    const sum = factors.reduce((n, f) => n + (validNumber(scores[f]) ? weights[f] : 0), 0);
    const score = sum ? factors.reduce((n, f) => n + (scores[f] ?? 0) * weights[f], 0) / sum : 50;
    return { ...row, rank: 0, score, factors: scores };
  }).sort((a, b) => b.score - a.score || a.symbol.localeCompare(b.symbol));
  return ranked.map((r, i) => ({ ...r, rank: i + 1 }));
}
export function marketRegime(index: Candle[], universe: Candle[][], vix: number | null): MarketRegime {
  const last = index.at(-1), average = ema(index.map(c => c.close), 50), short = ema(index.map(c => c.close), 20);
  const usable = universe.filter(rows => rows.length >= 20), advances = usable.filter(rows => rows.at(-1)!.close > ema(rows.map(c => c.close), 20)!).length;
  const breadth = usable.length >= 3 ? advances / usable.length * 100 : null;
  if (!last || !average || !short) return { state: "unknown", direction: "flat", breadth, vix, reason: "Insufficient index history" };
  const direction = last.close > average && short > average ? "up" : last.close < average && short < average ? "down" : "flat";
  const state = vix !== null && vix >= 25 || breadth !== null && breadth < 25 ? "stress" : direction === "flat" ? "range" : "trend";
  return { state, direction, breadth, vix, reason: state === "stress" ? "Elevated volatility or narrow participation" : state === "trend" ? "Index price and moving averages agree" : "Index trend is mixed" };
}
export function buildDailyResearch(inputs: ResearchInput[], index: Candle[], vix: number | null, now: number, requested: number, errors: string[] = []): DailyResearch {
  const benchmark = validResearchCandles(index, now), series: Candle[][] = [];
  const rows = inputs.flatMap(input => {
    const candles = validResearchCandles(input.candles, now), last = candles.at(-1); if (!last || candles.length < 21) return [];
    series.push(candles);
    const sentiment = datedSentiment(input.headlines, now);
    return [{ symbol: input.symbol, name: input.name, sector: input.sector, price: last.close, priceAsOf: last.time * 1000, raw: { ...researchFactors(candles, benchmark), ...(sentiment.score !== null ? { sentiment: sentiment.score } : {}) }, fundamentalData: input.fundamentals, fundamental: screenFundamentals(input.fundamentals, now), sentiment, errors: input.errors }];
  });
  return { version: 1, generatedAt: now, scanDay: new Date(now + 19800000).toISOString().slice(0, 10), source: "Yahoo Finance charts + Screener reports + Google News RSS", requested, scanned: rows.length, partial: rows.length < requested || errors.length > 0 || inputs.some(r => r.errors.length > 0), rows: rankResearch(rows), regime: marketRegime(benchmark, series, vix), errors, benchmark: benchmark.length ? { symbol: "NIFTY 50", price: benchmark.at(-1)!.close, asOf: benchmark.at(-1)!.time * 1000 } : null };
}
