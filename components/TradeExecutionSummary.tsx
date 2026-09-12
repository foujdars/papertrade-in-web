import type { PaperOrder } from "@/lib/paper-trading";
import { getOrderCharges, type ClosedPaperTrade } from "@/lib/trade-analytics";
import { formatInr } from "@/lib/market";

const time = (value: number) => value ? new Date(value).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "Time unavailable";
export function TradeExecutionSummary({ trade, exitOrder, status = "Complete" }: { trade: ClosedPaperTrade; exitOrder?: PaperOrder; status?: string }) {
  // A single fill may close only part of a position, or also open its reverse.
  const exitFees = exitOrder && exitOrder.quantity > 0 ? getOrderCharges(exitOrder).total * trade.quantity / exitOrder.quantity : null;
  const entryFees = exitFees === null ? null : Math.max(0, trade.charges - exitFees);
  return <>
    <div className="pnl-execution-pair">
      <span><b className={trade.direction === "LONG" ? "positive" : "negative"}>{trade.direction === "LONG" ? "BUY" : "SELL"}</b><strong>{trade.quantity} @ {formatInr(trade.entryPrice)}</strong><small>{time(trade.openedAt)}</small></span>
      <i aria-hidden="true">/</i>
      <span><b className={trade.direction === "LONG" ? "negative" : "positive"}>{trade.direction === "LONG" ? "SELL" : "BUY"}</b><strong>{trade.quantity} @ {formatInr(trade.exitPrice)}</strong><small>{time(trade.closedAt)}</small></span>
    </div>
    <div className="pnl-card-fees"><small>Fees</small><b>{formatInr(trade.charges)}</b>{exitFees !== null && entryFees !== null && <small>({formatInr(entryFees)} + {formatInr(exitFees)})</small>}</div>
    <div className="pnl-card-result"><b className={trade.netPnl >= 0 ? "positive" : "negative"}>{trade.netPnl >= 0 ? "+" : ""}{formatInr(trade.netPnl)}</b><small>{status}</small></div>
  </>;
}
