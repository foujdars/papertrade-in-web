import { evaluateScreenerCsv, recommendedColumns, type ScreeningResult, type StockMetrics } from "./fundamental-screener.ts";
import type { Instrument } from "./market";

// Company rating weights adapted from stock-scout's company-rater.tsx.
function clamp(value: number) {
  return Math.min(10, Math.max(0, value));
}

function average(values: number[]) {
  return values.length
    ? values.reduce((total, value) => total + value, 0) / values.length
    : 0;
}

function valueOrZero(value: number | null) {
  return value ?? 0;
}

function qualityMetric(value: number | null, strongValue = 20) {
  return clamp((valueOrZero(value) / strongValue) * 10);
}

function growthMetric(value: number | null) {
  return value == null ? 0 : clamp(5 + value / 4);
}

function ttmGrowth(current: number | null, previous: number | null) {
  if (current == null || previous == null || previous <= 0) return null;
  return ((current / previous) - 1) * 100;
}

function peScore(result: ScreeningResult) {
  const { pe, industryPe } = result.metrics;
  if (pe == null || industryPe == null || industryPe <= 0 || pe <= 0) return 0;
  return clamp(15 - (pe / industryPe) * 5);
}

function pegScore(value: number | null) {
  if (value == null || value <= 0) return 0;
  return clamp(12 - value * 4);
}

export function rateFundamentalCompany(result: ScreeningResult) {
  const metrics = result.metrics;
  const gateScore = result.checks.length
    ? (result.checks.filter((check) => check.pass).length / result.checks.length) * 10
    : 0;

  const quality = average([
    qualityMetric(metrics.roe),
    qualityMetric(metrics.roe3),
    qualityMetric(metrics.roe5),
    qualityMetric(metrics.roce),
    qualityMetric(metrics.roce3),
    qualityMetric(metrics.roce5),
    qualityMetric(metrics.opm),
  ]);

  const growth = average([
    growthMetric(metrics.profit3),
    growthMetric(metrics.profit5),
    growthMetric(metrics.sales3),
    growthMetric(metrics.sales5),
    growthMetric(metrics.quarterSalesGrowth),
    growthMetric(metrics.quarterProfitGrowth),
    growthMetric(ttmGrowth(metrics.ttmSales, metrics.priorYearSales)),
    growthMetric(ttmGrowth(metrics.ttmProfit, metrics.priorYearProfit)),
  ]);

  const valuation = average([peScore(result), pegScore(metrics.peg)]);
  const balanceInputs = result.isFinancial
    ? [
        metrics.pledged == null ? 0 : metrics.pledged === 0 ? 10 : clamp(10 - metrics.pledged),
        clamp((valueOrZero(metrics.currentRatio) / 2) * 10),
        clamp((valueOrZero(metrics.quickRatio) / 1.5) * 10),
      ]
    : [
        metrics.pledged == null ? 0 : metrics.pledged === 0 ? 10 : clamp(10 - metrics.pledged),
        metrics.debtEquity == null ? 0 : clamp(10 - metrics.debtEquity * 10),
        clamp((valueOrZero(metrics.currentRatio) / 2) * 10),
        clamp((valueOrZero(metrics.quickRatio) / 1.5) * 10),
      ];
  const balance = average(balanceInputs);

  return {
    result,
    overall: gateScore * 0.5 + quality * 0.15 + growth * 0.15 + valuation * 0.1 + balance * 0.1,
    gateScore,
    quality,
    growth,
    valuation,
    balance,
  };
}


export const companyJsonTemplate = Object.fromEntries([
  ...recommendedColumns.map(column => [column, ["Name", "ISIN Code", "NSE Code", "BSE Code", "Industry"].includes(column) ? "" : null]),
  ["Data as of", "YYYY-MM-DD"],
  ["Source URL", "https://www.screener.in/company/SYMBOL/consolidated/"],
]);

export function evaluateCompanyJson(input: string) {
  const clean = input.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const record: unknown = JSON.parse(clean);
  if (!record || typeof record !== "object" || Array.isArray(record)) throw new Error("Paste one company JSON object.");
  const values = record as Record<string, unknown>;
  if (typeof values.Name !== "string" || !values.Name.trim()) throw new Error('Enter the company name under "Name".');
  const cell = (value: unknown) => {
    if (value != null && !["string", "number"].includes(typeof value)) throw new Error("Company fields must be text, numbers or null.");
    return `"${String(value ?? "").replace(/"/g, '""')}"`;
  };
  const csv = [recommendedColumns.map(cell).join(","), recommendedColumns.map(column => cell(values[column])).join(",")].join("\n");
  return { result: evaluateScreenerCsv(csv).results[0], dataAsOf: typeof values["Data as of"] === "string" ? values["Data as of"] : "" };
}

const usableCode = (value: string) => /^(?:-|na|n\/a|null)$/i.test(value.trim()) ? "" : value.trim().replace(/\.0+$/, "").toUpperCase();
export function resolveFundamentalInstrument(result: ScreeningResult, universe: Instrument[]): Instrument | null {
  const nse = usableCode(result.nseCode), bse = usableCode(result.bseCode), isin = usableCode(result.isin);
  const equities = universe.filter(item => (!item.assetType || item.assetType === "EQUITY") && (item.exchange === "NSE" || item.exchange === "BSE"));
  const found = equities.find(item => item.exchange === "NSE" && nse && item.symbol.toUpperCase() === nse)
    ?? equities.find(item => item.exchange === "BSE" && bse && item.symbol.toUpperCase() === bse)
    ?? (isin ? equities.find(item => item.instrumentKey === `NSE_EQ|${isin}`) ?? equities.find(item => item.instrumentKey === `BSE_EQ|${isin}`) : undefined);
  if (found) return found;
  // Require a valid ISIN for an instrument absent from the loaded directory.
  if (!/^IN[A-Z0-9]{9}[0-9]$/.test(isin) || (!nse && !bse)) return null;
  return { symbol: nse || bse, name: result.name, exchange: nse ? "NSE" : "BSE", instrumentKey: `${nse ? "NSE_EQ" : "BSE_EQ"}|${isin}`, assetType: "EQUITY", price: 0, change: 0, categories: [] };
}

export const peerFields: { key: keyof StockMetrics; label: string; suffix?: string }[] = [
  { key: "roe", label: "ROE", suffix: "%" }, { key: "roce", label: "ROCE", suffix: "%" },
  { key: "pe", label: "P/E" }, { key: "peg", label: "PEG" }, { key: "debtEquity", label: "Debt / equity" },
  { key: "profit3", label: "Profit growth · 3Y", suffix: "%" }, { key: "sales3", label: "Sales growth · 3Y", suffix: "%" },
  { key: "opm", label: "Operating margin", suffix: "%" }, { key: "currentRatio", label: "Current ratio" }, { key: "quickRatio", label: "Quick ratio" },
  { key: "promoter", label: "Promoter holding", suffix: "%" }, { key: "pledged", label: "Promoter pledge", suffix: "%" },
  { key: "fii", label: "FII holding", suffix: "%" }, { key: "dii", label: "DII holding", suffix: "%" },
  { key: "quarterSales", label: "Quarterly sales (₹ Cr)" }, { key: "quarterProfit", label: "Quarterly profit (₹ Cr)" },
  { key: "quarterSalesGrowth", label: "Quarterly sales growth", suffix: "%" }, { key: "quarterProfitGrowth", label: "Quarterly profit growth", suffix: "%" },
  { key: "ttmSales", label: "Sales TTM (₹ Cr)" }, { key: "ttmProfit", label: "Profit TTM (₹ Cr)" },
  { key: "priorYearSales", label: "Prior-year sales (₹ Cr)" }, { key: "priorYearProfit", label: "Prior-year profit (₹ Cr)" },
];
export function metricMedian(values: (number | null)[]): number | null {
  const present = values.filter((v): v is number => v != null && Number.isFinite(v)).sort((a,b) => a-b);
  if (!present.length) return null;
  const middle = Math.floor(present.length / 2);
  return present.length % 2 ? present[middle] : (present[middle-1] + present[middle]) / 2;
}
