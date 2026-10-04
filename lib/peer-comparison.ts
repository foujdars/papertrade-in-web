import type { ScreeningResult, StockMetrics } from "./fundamental-screener.ts";
import { metricMedian } from "./fundamental-analysis.ts";
export type PeerMetric = { key: keyof StockMetrics; label: string; group: string; unit: "%" | "×" | "₹ Cr"; direction?: "higher" | "lower"; financialContext?: boolean; positiveOnly?: boolean };
export const PEER_METRICS: PeerMetric[] = [
  { key: "roe", label: "ROE", group: "Quality", unit: "%", direction: "higher" },
  { key: "roe3", label: "Average ROE · 3Y", group: "Quality", unit: "%", direction: "higher" },
  { key: "roce", label: "ROCE", group: "Quality", unit: "%", direction: "higher", financialContext: true },
  { key: "opm", label: "Operating margin", group: "Quality", unit: "%", direction: "higher", financialContext: true },
  { key: "pe", label: "P/E", group: "Valuation", unit: "×", direction: "lower", positiveOnly: true },
  { key: "peg", label: "PEG", group: "Valuation", unit: "×", direction: "lower", positiveOnly: true },
  { key: "industryPe", label: "Reported industry P/E", group: "Valuation", unit: "×", positiveOnly: true },
  { key: "debtEquity", label: "Debt / equity", group: "Balance", unit: "×", direction: "lower", financialContext: true },
  { key: "currentRatio", label: "Current ratio", group: "Balance", unit: "×", financialContext: true },
  { key: "quickRatio", label: "Quick ratio", group: "Balance", unit: "×", financialContext: true },
  { key: "pledged", label: "Promoter pledge", group: "Balance", unit: "%", direction: "lower" },
  { key: "profit3", label: "Profit growth · 3Y", group: "Growth", unit: "%", direction: "higher" },
  { key: "profit5", label: "Profit growth · 5Y", group: "Growth", unit: "%", direction: "higher" },
  { key: "sales3", label: "Sales growth · 3Y", group: "Growth", unit: "%", direction: "higher" },
  { key: "sales5", label: "Sales growth · 5Y", group: "Growth", unit: "%", direction: "higher" },
  { key: "quarterSalesGrowth", label: "Quarterly sales growth", group: "Growth", unit: "%", direction: "higher" },
  { key: "quarterProfitGrowth", label: "Quarterly profit growth", group: "Growth", unit: "%", direction: "higher" },
  { key: "quarterSales", label: "Quarterly sales", group: "Financials", unit: "₹ Cr" },
  { key: "quarterProfit", label: "Quarterly profit", group: "Financials", unit: "₹ Cr" },
  { key: "ttmSales", label: "Sales TTM", group: "Financials", unit: "₹ Cr" },
  { key: "ttmProfit", label: "Profit TTM", group: "Financials", unit: "₹ Cr" },
  { key: "priorYearSales", label: "Prior-year sales", group: "Financials", unit: "₹ Cr" },
  { key: "priorYearProfit", label: "Prior-year profit", group: "Financials", unit: "₹ Cr" },
  { key: "promoter", label: "Promoter holding", group: "Ownership", unit: "%" },
  { key: "fii", label: "FII holding", group: "Ownership", unit: "%" },
  { key: "dii", label: "DII holding", group: "Ownership", unit: "%" },
];
export function peerValue(result: ScreeningResult, field: PeerMetric) {
  const value = result.metrics[field.key];
  return value != null && Number.isFinite(value) && (!field.positiveOnly || value > 0) ? value : null;
}
export function peerMetricSummary(peers: ScreeningResult[], selected: ScreeningResult[], field: PeerMetric) {
  const values = peers.map(p => peerValue(p, field)).filter((v): v is number => v != null);
  const shown = selected.map(p => peerValue(p, field)).filter((v): v is number => v != null);
  const canHighlight = field.direction && !(field.financialContext && selected.some(p => p.isFinancial));
  const best = canHighlight && shown.length >= 2 && new Set(shown).size > 1 ? (field.direction === "higher" ? Math.max(...shown) : Math.min(...shown)) : null;
  return { median: metricMedian(values), count: values.length, best };
}
export const samePeerGroup = (a: ScreeningResult, b: ScreeningResult) => a.industry.trim().toLowerCase() === b.industry.trim().toLowerCase() && a.isFinancial === b.isFinancial;
