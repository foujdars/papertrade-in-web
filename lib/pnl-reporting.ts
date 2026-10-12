import type { ClosedPaperTrade } from './trade-analytics.ts';
import { USD_INR } from './global-markets.ts';

// This is the app's fixed paper-wallet conversion, not a live exchange rate.
export const PNL_REPORTING_USD_INR = USD_INR;
export const isGlobalPnlTrade = (trade: Pick<ClosedPaperTrade, 'id'>) => trade.id.startsWith('global:');

/** Analytics can share one unit while the original ledger and trade rows keep theirs. */
export function pnlReportingTrades(trades: ClosedPaperTrade[], combined: boolean): ClosedPaperTrade[] {
  return combined ? trades.map(trade => isGlobalPnlTrade(trade) ? {
    ...trade,
    grossPnl: trade.grossPnl * PNL_REPORTING_USD_INR,
    charges: trade.charges * PNL_REPORTING_USD_INR,
    netPnl: trade.netPnl * PNL_REPORTING_USD_INR,
  } : trade) : trades;
}
