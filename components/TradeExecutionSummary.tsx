import type { PaperOrder } from "@/lib/paper-trading";
import { getOrderCharges, type ClosedPaperTrade } from "@/lib/trade-analytics";
import { formatInr } from "@/lib/market";
import { CircleCheck, Clock3 } from "lucide-react";

const time = (value: number) => value ? new Date(value).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "Time unavailable";
const compactTime = (value: number) => value ? new Date(value).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit" }) : "—";
export function TradeExecutionSummary({ trade, exitOrder, status = "Complete", currency = "INR" }: { trade: ClosedPaperTrade; exitOrder?: PaperOrder; status?: string; currency?: "INR" | "USD" }) {
  // A single fill may close only part of a position, or also open its reverse.
  const money = (value: number) => currency === "USD" ? `$${Math.abs(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : formatInr(value);
  const signed = (value: number) => `${value < 0 ? "−" : ""}${money(value)}`;
  const exitFees = exitOrder && exitOrder.quantity > 0 ? getOrderCharges(exitOrder).total * trade.quantity / exitOrder.quantity : null;
  const entryFees = exitFees === null ? null : Math.max(0, trade.charges - exitFees);
  return <>
    <div className="pnl-execution-pair">
      <span title={`Entry · ${time(trade.openedAt)}`}><b className={trade.direction === "LONG" ? "positive" : "negative"}>{trade.direction === "LONG" ? "BUY" : "SELL"}</b><strong>{trade.quantity} @ {signed(trade.entryPrice)}</strong><small><Clock3 size={12} />{compactTime(trade.openedAt)}</small></span>
      <span title={`Exit · ${time(trade.closedAt)}`}><b className={trade.direction === "LONG" ? "negative" : "positive"}>{trade.direction === "LONG" ? "SELL" : "BUY"}</b><strong>{trade.quantity} @ {signed(trade.exitPrice)}</strong><small><Clock3 size={12} />{compactTime(trade.closedAt)}</small></span>
    </div>
    <div className="pnl-card-result" title={`Net P&L after fees ${signed(trade.charges)}${exitFees !== null && entryFees !== null ? ` (${signed(entryFees)} + ${signed(exitFees)})` : ""}`}><b className={trade.netPnl >= 0 ? "positive" : "negative"}>{trade.netPnl >= 0 ? "+" : "−"}{money(trade.netPnl)}</b><small>{status}<CircleCheck size={12} className="positive" aria-hidden="true" /></small></div>
  </>;
}
