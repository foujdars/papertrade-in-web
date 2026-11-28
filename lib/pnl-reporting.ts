import type { ClosedPaperTrade } from './trade-analytics.ts';
import { USD_INR } from './global-markets.ts';
import type { PnlScope } from './pnl-analytics.ts';

// This is the app's fixed paper-wallet conversion, not a live exchange rate.
export const PNL_REPORTING_USD_INR = USD_INR;
export const isGlobalPnlTrade = (trade: Pick<ClosedPaperTrade, 'id'>) => trade.id.startsWith('global:');

export function pnlHistoryReady(asset: PnlScope["asset"], indiaReady: boolean, globalReady: boolean) {
  if (asset === "all") return indiaReady && globalReady;
  return asset === "global" ? globalReady : indiaReady;
}

export type OpenPnlMark = {
  symbol: string;
  asset: "stocks" | "fno" | "global" | "unknown";
  product: "INTRADAY" | "DELIVERY";
  value: number | null;
};

export function openPnlSummary(marks: OpenPnlMark[], scope: Pick<PnlScope, "asset" | "product">) {
  const positions = marks.filter(mark =>
    (scope.asset === "all" || (scope.asset === "india" ? mark.asset !== "global" : scope.asset === mark.asset)) &&
    (scope.product === "all" || mark.product === scope.product));
  let total = 0, priced = 0;
  for (const mark of positions) {
    if (mark.value === null || !Number.isFinite(mark.value)) continue;
    priced++;
    total += mark.value * (scope.asset === "all" && mark.asset === "global" ? PNL_REPORTING_USD_INR : 1);
  }
  return { positions, priced, total: priced === positions.length ? total : null };
}

/** Analytics can share one unit while the original ledger and trade rows keep theirs. */
export function pnlReportingTrades(trades: ClosedPaperTrade[], combined: boolean): ClosedPaperTrade[] {
  return combined ? trades.map(trade => isGlobalPnlTrade(trade) ? {
    ...trade,
    grossPnl: trade.grossPnl * PNL_REPORTING_USD_INR,
    charges: trade.charges * PNL_REPORTING_USD_INR,
    netPnl: trade.netPnl * PNL_REPORTING_USD_INR,
  } : trade) : trades;
}
