import type { PaperOrder } from "./paper-trading";
import type { ClosedPaperTrade } from "./trade-analytics";
import type { TradeJournalEntry } from "./trading-coach";

export type PnlScope = { period: "all" | "month" | "30d" | "custom"; start: string; end: string; asset: "all" | "stocks" | "fno"; product: "all" | "INTRADAY" | "DELIVERY"; day?: string | null };
export const DEFAULT_PNL_SCOPE: PnlScope = { period: "all", start: "", end: "", asset: "all", product: "all" };
export type PnlDimension = "Symbol" | "Strategy" | "Market" | "Product" | "Direction" | "Entry time" | "Holding duration";
export const PNL_DIMENSIONS: PnlDimension[] = ["Symbol", "Strategy", "Market", "Product", "Direction", "Entry time", "Holding duration"];
export const pnlDay = (time: number) => Number.isFinite(time) && time > 0 ? new Date(time + 19_800_000).toISOString().slice(0, 10) : "";
export const pnlOutcome = (value: number) => Math.round(value * 100) > 0 ? "profit" : Math.round(value * 100) < 0 ? "loss" : "breakeven";
export function validPnlDate(value: string) { const time = Date.parse(`${value}T00:00:00Z`); return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value; }
export function pnlBounds(scope: PnlScope, now: number) {
  const today = pnlDay(now);
  if (scope.period === "custom") return { start: scope.start, end: scope.end, valid: validPnlDate(scope.start) && validPnlDate(scope.end) && scope.start <= scope.end };
  if (scope.period === "month") return { start: `${today.slice(0, 7)}-01`, end: today, valid: true };
  if (scope.period === "30d") return { start: pnlDay(now - 29 * 86400000), end: today, valid: true };
  return { start: "", end: "", valid: true };
}
export function tradeAsset(trade: ClosedPaperTrade, ordersById: Map<string, PaperOrder>) {
  const sources = trade.sourceOrderIds.map(id => ordersById.get(id));
  const asset = sources.map(order => order?.assetType).find(Boolean);
  if (asset) return asset === "OPTION" || asset === "FUTURE" ? "fno" : asset === "EQUITY" ? "stocks" : "unknown";
  // Older orders omit assetType; the exchange segment is still authoritative.
  const key = sources.map(order => order?.instrumentKey).find(Boolean) ?? "";
  return /^(NSE|BSE)_EQ\|/.test(key) ? "stocks" : /^(NSE|BSE)_FO\|/.test(key) ? "fno" : "unknown";
}
export function filterPnlTrades(trades: ClosedPaperTrade[], orders: PaperOrder[], scope: PnlScope, now: number) {
  const bounds = pnlBounds(scope, now), lookup = new Map(orders.map(o => [o.id, o]));
  if (!bounds.valid) return [];
  return trades.filter(t => {
    const day = pnlDay(t.closedAt);
    return Number.isFinite(t.netPnl) && (!bounds.start || day >= bounds.start) && (!bounds.end || Boolean(day) && day <= bounds.end) && (!scope.day || day === scope.day) && (scope.product === "all" || t.product === scope.product) && (scope.asset === "all" || tradeAsset(t, lookup) === scope.asset);
  });
}
export function summarisePnl(trades: ClosedPaperTrade[]) {
  const winners = trades.filter(t => pnlOutcome(t.netPnl) === "profit"), losers = trades.filter(t => pnlOutcome(t.netPnl) === "loss");
  const sum = (items: ClosedPaperTrade[], key: "netPnl" | "grossPnl" | "charges") => items.reduce((total, t) => total + t[key], 0);
  const gains = sum(winners, "netPnl"), losses = -sum(losers, "netPnl"), net = sum(trades, "netPnl");
  const values = trades.map(t => t.netPnl).sort((a, b) => a - b), mid = Math.floor(values.length / 2);
  return { count: trades.length, net, charges: sum(trades, "charges"), wins: winners.length, losses: losers.length, breakevens: trades.length - winners.length - losers.length,
    winRate: trades.length ? winners.length / trades.length * 100 : null,
    profitFactor: losses ? gains / losses : gains ? Infinity : null,
    average: trades.length ? net / trades.length : null, averageWin: winners.length ? gains / winners.length : null, averageLoss: losers.length ? -losses / losers.length : null,
    median: values.length ? values.length % 2 ? values[mid] : (values[mid - 1] + values[mid]) / 2 : null,
    best: trades.length ? trades.reduce((a, b) => a.netPnl >= b.netPnl ? a : b) : null, worst: trades.length ? trades.reduce((a, b) => a.netPnl <= b.netPnl ? a : b) : null,
    grossGains: sum(trades.filter(t => t.grossPnl > 0), "grossPnl"), grossLosses: -sum(trades.filter(t => t.grossPnl < 0), "grossPnl"),
    costReversals: trades.filter(t => t.grossPnl > 0 && pnlOutcome(t.netPnl) === "loss").length };
}
export type PnlPoint = { time: number; value: number; drawdown: number; trade: ClosedPaperTrade };
export function pnlCurve(trades: ClosedPaperTrade[]) {
  const dated = trades.filter(t => pnlDay(t.closedAt)).sort((a, b) => a.closedAt - b.closedAt || a.id.localeCompare(b.id));
  let value = 0, peak = 0, maxDrawdown = 0, peakAt: number | null = null, peakValue = 0, troughIndex = -1, worstPeakAt: number | null = null;
  const points: PnlPoint[] = dated.map((trade, index) => {
    value += trade.netPnl;
    if (value >= peak) { peak = value; peakAt = trade.closedAt; }
    const drawdown = Math.max(0, peak - value);
    if (drawdown > maxDrawdown) { maxDrawdown = drawdown; troughIndex = index; worstPeakAt = peakAt; peakValue = peak; }
    return { time: trade.closedAt, value, drawdown, trade };
  });
  const recoveredAt = troughIndex >= 0 ? points.slice(troughIndex + 1).find(p => p.value >= peakValue)?.time ?? null : null;
  return { points, maxDrawdown, currentDrawdown: points.at(-1)?.drawdown ?? 0, worstPeakAt, troughAt: points[troughIndex]?.time ?? null, recoveredAt, undated: trades.length - dated.length };
}
export function rollingPnl(trades: ClosedPaperTrade[], windowSize = 10) {
  const ordered = pnlCurve(trades).points;
  if (windowSize < 1 || !Number.isInteger(windowSize)) return [];
  return ordered.flatMap((point, i) => i + 1 < windowSize ? [] : [{ ...point, value: ordered.slice(i + 1 - windowSize, i + 1).reduce((sum, p) => sum + p.trade.netPnl, 0) / windowSize, ids: ordered.slice(i + 1 - windowSize, i + 1).map(p => p.trade.id) }]);
}
export function pnlDistribution(trades: ClosedPaperTrade[]) {
  const max = trades.reduce((m, t) => Math.max(m, Math.abs(t.netPnl)), 0);
  const raw = Math.max(.01, max / 4), magnitude = 10 ** Math.floor(Math.log10(raw));
  const step = ([1, 2, 5, 10].find(n => n * magnitude >= raw) ?? 10) * magnitude;
  const min = -4 * step, maxValue = 4 * step;
  const bins = Array.from({ length: 8 }, (_, i) => ({ from: min + i * step, to: min + (i + 1) * step, trades: [] as ClosedPaperTrade[] }));
  for (const trade of trades) bins[Math.min(7, Math.max(0, Math.floor((trade.netPnl - min) / step)))].trades.push(trade);
  return { min, max: maxValue, bins };
}
export function groupPnl(trades: ClosedPaperTrade[], orders: PaperOrder[], journal: Record<string, TradeJournalEntry>, dimension: PnlDimension) {
  const lookup = new Map(orders.map(o => [o.id, o])), groups = new Map<string, ClosedPaperTrade[]>();
  for (const trade of trades) {
    const entry = lookup.get(trade.sourceOrderIds[0]);
    let label: string;
    switch (dimension) {
      case "Strategy": { const plans = new Set(trade.sourceOrderIds.slice(0, -1).map(id => lookup.get(id)?.journalPlan?.strategy?.trim()).filter(Boolean)); label = journal[trade.id]?.strategy?.trim() || (plans.size > 1 ? "Mixed entries" : entry?.journalPlan?.strategy?.trim()) || "Unclassified"; break; }
      case "Market": { const asset = tradeAsset(trade, lookup); label = asset === "stocks" ? "Stocks" : asset === "fno" ? "F&O" : "Unclassified"; break; }
      case "Product": label = trade.product === "INTRADAY" ? "Intraday" : "Delivery / carry forward"; break;
      case "Direction": label = trade.direction === "LONG" ? "Long" : "Short"; break;
      case "Entry time": {
        if (trade.product !== "INTRADAY") label = "Delivery / carry forward (separate)";
        else if (!pnlDay(trade.openedAt)) label = "Time unavailable";
        else { const minutes = Math.floor((trade.openedAt + 19_800_000) / 60000) % 1440; label = minutes < 555 || minutes > 930 ? "Outside regular session" : minutes < 600 ? "09:15–10:00" : minutes < 660 ? "10:00–11:00" : minutes < 720 ? "11:00–12:00" : minutes < 780 ? "12:00–13:00" : minutes < 840 ? "13:00–14:00" : minutes < 900 ? "14:00–15:00" : "15:00–15:30"; }
        break;
      }
      case "Holding duration": { const minutes = (trade.closedAt - trade.openedAt) / 60000; label = !pnlDay(trade.openedAt) || !pnlDay(trade.closedAt) || minutes < 0 ? "Duration unavailable" : minutes < 30 ? "Under 30 minutes" : minutes < 120 ? "30 minutes–2 hours" : minutes < 1440 ? "2 hours–1 day" : minutes < 10080 ? "1–7 days" : "7+ days"; break; }
      default: label = trade.symbol;
    }
    groups.set(label, [...(groups.get(label) ?? []), trade]);
  }
  return [...groups].map(([label, items]) => ({ label, trades: items, ...summarisePnl(items) })).sort((a, b) => b.net - a.net || a.label.localeCompare(b.label));
}
