"use client";

import { BarChart3, BookOpenText, ChevronRight, Play, ShieldCheck, Target, X } from "lucide-react";
import { BarReplay } from "@/components/BarReplay";
import { useEffect, useMemo, useRef, useState } from "react";
import { ConfidenceControl, StrategyPicker } from "@/components/TradePlanControls";
import { StockLogo } from "@/components/StockLogo";
import { formatInr, type Instrument } from "@/lib/market";
import type { PaperOrder } from "@/lib/paper-trading";
import type { ClosedPaperTrade } from "@/lib/trade-analytics";
import { buildOptionPayoff, readTradeJournal, writeTradeJournal, writeTradingLimits, type OptionPayoffLeg, type TradeJournalEntry, type TradingLimits } from "@/lib/trading-coach";

export type CoachTab = "journal" | "insights" | "replay" | "limits" | "payoff";


function timestamp(order: PaperOrder) { return order.createdAt ?? (Number(order.id) || 0); }
function durationLabel(milliseconds: number) {
  const minutes = Math.max(0, Math.round(milliseconds / 60_000));
  if (minutes < 60) return `${minutes}m`;
  if (minutes < 1_440) return `${(minutes / 60).toFixed(1)}h`;
  return `${(minutes / 1_440).toFixed(1)}d`;
}

function buildOpenOptionLegs(orders: PaperOrder[], instrument: Instrument) {
  const underlyingKey = instrument.assetType === "OPTION" ? instrument.underlyingKey : instrument.instrumentKey;
  const underlyingSymbol = (instrument.assetType === "OPTION" ? instrument.underlyingSymbol : instrument.symbol)?.toUpperCase();
  const state = new Map<string, { signedQuantity: number; averagePrice: number; order: PaperOrder }>();
  [...orders].sort((a, b) => timestamp(a) - timestamp(b)).forEach((order) => {
    if (order.assetType !== "OPTION" || !order.optionType || !order.strikePrice) return;
    const sameUnderlying = (underlyingKey && order.underlyingKey === underlyingKey)
      || (underlyingSymbol && order.underlyingSymbol?.toUpperCase() === underlyingSymbol);
    if (!sameUnderlying) return;
    const key = order.instrumentKey || order.symbol;
    const direction = order.side === "BUY" ? 1 : -1;
    const previous = state.get(key) ?? { signedQuantity: 0, averagePrice: 0, order };
    if (!previous.signedQuantity || Math.sign(previous.signedQuantity) === direction) {
      const oldQuantity = Math.abs(previous.signedQuantity);
      const nextQuantity = oldQuantity + order.quantity;
      previous.averagePrice = nextQuantity ? (previous.averagePrice * oldQuantity + order.price * order.quantity) / nextQuantity : order.price;
    } else if (order.quantity > Math.abs(previous.signedQuantity)) previous.averagePrice = order.price;
    previous.signedQuantity += direction * order.quantity;
    previous.order = order;
    if (previous.signedQuantity) state.set(key, previous); else state.delete(key);
  });
  return [...state.values()].map<OptionPayoffLeg>((item) => ({ optionType: item.order.optionType!, side: item.signedQuantity > 0 ? "BUY" : "SELL", strike: item.order.strikePrice!, premium: item.averagePrice, quantity: Math.abs(item.signedQuantity) }));
}

function PayoffChart({ legs, spot }: { legs: OptionPayoffLeg[]; spot: number }) {
  const payoff = useMemo(() => buildOptionPayoff(legs, spot), [legs, spot]);
  if (!payoff.points.length) return <div className="coach-empty"><Target size={28} /><b>Select an option contract</b><span>Open an option chart to preview its expiry payoff.</span></div>;
  const min = Math.min(0, ...payoff.points.map((point) => point.pnl));
  const max = Math.max(0, ...payoff.points.map((point) => point.pnl));
  const range = Math.max(1, max - min);
  const points = payoff.points.map((point, index) => `${index / (payoff.points.length - 1) * 100},${38 - (point.pnl - min) / range * 34}`).join(" ");
  const zeroY = 38 - (0 - min) / range * 34;
  return <div className="coach-payoff">
    <div className="coach-metric-grid"><div><span>Breakeven</span><b>{payoff.breakevens.length ? payoff.breakevens.map((value) => formatInr(value)).join(" · ") : "None in range"}</b></div><div><span>Maximum profit</span><b className="positive">{payoff.unboundedProfit ? "Unlimited" : formatInr(payoff.maxProfit)}</b></div><div><span>Maximum loss</span><b className="negative">{payoff.unboundedLoss ? "Unlimited" : formatInr(Math.abs(payoff.maxLoss))}</b></div></div>
    <svg viewBox="0 0 100 42" preserveAspectRatio="none" aria-label="Option payoff at expiry"><line x1="0" x2="100" y1={zeroY} y2={zeroY} /><polyline points={points} /></svg>
    <div className="coach-payoff-range"><span>{formatInr(payoff.points[0].price)}</span><b>Underlying price at expiry</b><span>{formatInr(payoff.points.at(-1)!.price)}</span></div>
  </div>;
}


export function TradingCoach({ selected, orders, trades, limits, proposedOptionLeg, spotPrice, onLimitsChange, onReviewTrade, onClose, initialTab = "journal", timeframe = "5m", theme = "light" }: { selected: Instrument; orders: PaperOrder[]; trades: ClosedPaperTrade[]; limits: TradingLimits; proposedOptionLeg: OptionPayoffLeg | null; spotPrice: number; onLimitsChange: (limits: TradingLimits) => void; onReviewTrade: (tradeId: string) => void; onClose: () => void; initialTab?: CoachTab; timeframe?: string; theme?: "light" | "neon"; }) {
  const [tab, setTab] = useState<CoachTab>(initialTab);
  const [journal, setJournal] = useState<Record<string, TradeJournalEntry>>({});
  const dialogRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const restore = window.setTimeout(() => setJournal(readTradeJournal()), 0);
    const previousFocus = document.activeElement as HTMLElement | null;
    dialogRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
    return () => { window.clearTimeout(restore); previousFocus?.focus(); };
  }, []);
  const [draftLimits, setDraftLimits] = useState(limits);
  const [expandedTrade, setExpandedTrade] = useState<string | null>(trades[0]?.id ?? null);
  const [insightGroup, setInsightGroup] = useState("Strategy");
  const [limitsSaved, setLimitsSaved] = useState(false);
  const openOptionLegs = useMemo(() => buildOpenOptionLegs(orders, selected), [orders, selected]);
  const payoffLegs = useMemo(() => proposedOptionLeg ? [...openOptionLegs, proposedOptionLeg] : openOptionLegs, [openOptionLegs, proposedOptionLeg]);
  const ordersById = useMemo(() => new Map(orders.map((order) => [order.id, order])), [orders]);
  const insights = useMemo(() => {
    const groups = new Map<string, { pnl: number; count: number; wins: number }>();
    const add = (key: string, trade: ClosedPaperTrade) => { const value = groups.get(key) ?? { pnl: 0, count: 0, wins: 0 }; groups.set(key, { pnl: value.pnl + trade.netPnl, count: value.count + 1, wins: value.wins + (trade.netPnl > 0 ? 1 : 0) }); };
    trades.forEach((trade) => { const entry = ordersById.get(trade.sourceOrderIds[0]); const strategy = journal[trade.id]?.strategy || entry?.journalPlan?.strategy || "Unclassified"; const hour = Number(new Date(trade.openedAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", hour12: false })); const session = hour < 11 ? "Opening hour" : hour < 14 ? "Midday" : "Closing session"; add(`Strategy · ${strategy}`, trade); add(`Stock · ${trade.symbol}`, trade); add(`Direction · ${trade.direction}`, trade); add(`Time · ${session}`, trade); const duration = trade.closedAt - trade.openedAt; add(`Duration · ${duration < 30 * 60_000 ? "Under 30m" : duration < 2 * 60 * 60_000 ? "30m–2h" : "Over 2h"}`, trade); });
    return [...groups.entries()].map(([label, value]) => ({ label, ...value, winRate: value.count ? value.wins / value.count * 100 : 0 })).sort((a, b) => b.count - a.count || b.pnl - a.pnl);
  }, [journal, ordersById, trades]);
  const chargeReversalCount = trades.filter((trade) => trade.grossPnl > 0 && trade.netPnl < 0).length;
  function updateJournal(trade: ClosedPaperTrade, patch: Partial<TradeJournalEntry>) {
    const entryOrder = ordersById.get(trade.sourceOrderIds[0]);
    setJournal((current) => {
      const previous = current[trade.id] ?? { tradeId: trade.id, strategy: entryOrder?.journalPlan?.strategy || "Other", thesis: entryOrder?.journalPlan?.thesis || "", confidence: entryOrder?.journalPlan?.confidence ?? 3, review: "", followedPlan: null, updatedAt: Date.now() };
      const nextEntry: TradeJournalEntry = { ...previous, ...patch, tradeId: trade.id, updatedAt: Date.now() };
      const next = { ...current, [trade.id]: nextEntry };
      writeTradeJournal(next);
      return next;
    });
  }
  function saveLimits() { const sanitized = { ...draftLimits, dailyLossLimit: Math.max(0, draftLimits.dailyLossLimit || 0), maxTradesPerDay: Math.max(0, Math.round(draftLimits.maxTradesPerDay || 0)), cooldownAfterLosses: Math.max(0, Math.round(draftLimits.cooldownAfterLosses || 0)), cooldownMinutes: Math.max(0, Math.round(draftLimits.cooldownMinutes || 0)) }; writeTradingLimits(sanitized); onLimitsChange(sanitized); setDraftLimits(sanitized); setLimitsSaved(true); }

  return <div className="modal-backdrop coach-backdrop" role="presentation" onMouseDown={onClose}>
    <section ref={dialogRef} className="modal coach-modal" role="dialog" aria-modal="true" aria-label="Trading coach" onMouseDown={(event) => event.stopPropagation()} onKeyDown={(event) => {
      if (event.key === "Escape") { event.stopPropagation(); onClose(); }
      if (event.key === "Tab") {
        const nodes = [...event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input, textarea, summary, [tabindex="0"]')].filter((element) => element.tabIndex >= 0 && element.getClientRects().length > 0);
        const first = nodes[0], last = nodes.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    }}>
      <header className="coach-header"><span className="coach-title-icon"><BookOpenText size={22} /></span><div><span className="eyebrow">Your trading toolkit</span><h2>Trading coach</h2></div><button className="icon-button" onClick={onClose} aria-label="Close trading coach"><X size={20} /></button></header>
      <div className="coach-tabs" role="tablist" aria-label="Trading tools">
        {(["journal", "insights", "replay", "limits", "payoff"] as const).map((item, index, tabs) => <button type="button" role="tab" aria-selected={tab === item} aria-controls="coach-panel" id={`coach-tab-${item}`} tabIndex={tab === item ? 0 : -1} key={item} className={tab === item ? "active" : ""} onClick={() => setTab(item)} onKeyDown={(event) => { if (event.key === "ArrowRight" || event.key === "ArrowLeft") { event.preventDefault(); const next = tabs[(index + (event.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length]; setTab(next); document.getElementById(`coach-tab-${next}`)?.focus(); } }}>
          {item === "journal" ? <BookOpenText size={18} /> : item === "insights" ? <BarChart3 size={18} /> : item === "limits" ? <ShieldCheck size={18} /> : item === "payoff" ? <Target size={18} /> : <Play size={18} />}<span>{item}</span>
        </button>)}
      </div>
      <div className={`coach-content ${tab === "replay" ? "coach-content-replay" : ""}`} id="coach-panel" role="tabpanel" aria-labelledby={`coach-tab-${tab}`}>
        {tab === "journal" && <div className="coach-journal-list">
          <div className="coach-section-heading"><h3>Trade journal</h3><span>{trades.length} completed</span></div>
          {trades.map((trade) => {
            const entryOrder = ordersById.get(trade.sourceOrderIds[0]);
            const entry = journal[trade.id];
            const expanded = expandedTrade === trade.id;
            return <article key={trade.id} className={`coach-journal-card ${expanded ? "expanded" : ""}`}>
              <button type="button" className="coach-trade-heading" aria-expanded={expanded} onClick={() => setExpandedTrade(expanded ? null : trade.id)}>
                <StockLogo symbol={trade.symbol} size={38} />
                <span className="coach-trade-identity"><b>{trade.symbol}</b><small>{trade.direction} · {trade.quantity} units · {durationLabel(trade.closedAt - trade.openedAt)}</small></span>
                <span className="coach-trade-result"><strong className={trade.netPnl >= 0 ? "positive" : "negative"}>{trade.netPnl >= 0 ? "+" : ""}{formatInr(trade.netPnl)}</strong><small>{new Date(trade.closedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</small></span>
              </button>
              {expanded && <div className="coach-journal-details">
                <button type="button" className="coach-review-link" onClick={() => onReviewTrade(trade.id)}><BarChart3 size={16} />Entry &amp; exit chart<ChevronRight size={16} /></button>
                <div className="coach-journal-fields">
                  <StrategyPicker value={entry?.strategy || entryOrder?.journalPlan?.strategy || "Other"} onChange={(strategy) => updateJournal(trade, { strategy })} />
                  <ConfidenceControl value={entry?.confidence ?? entryOrder?.journalPlan?.confidence ?? 3} onChange={(confidence) => updateJournal(trade, { confidence })} />
                  <label className="wide">Entry reason<textarea value={entry?.thesis ?? entryOrder?.journalPlan?.thesis ?? ""} onChange={(event) => updateJournal(trade, { thesis: event.target.value })} placeholder="What was your setup?" /></label>
                  <label className="wide">Review<textarea value={entry?.review ?? ""} onChange={(event) => updateJournal(trade, { review: event.target.value })} placeholder="What worked? What would you change?" /></label>
                  <div className="coach-plan-check"><span>Followed your plan?</span><button type="button" aria-pressed={entry?.followedPlan === true} className={entry?.followedPlan === true ? "active" : ""} onClick={() => updateJournal(trade, { followedPlan: true })}>Yes</button><button type="button" aria-pressed={entry?.followedPlan === false} className={entry?.followedPlan === false ? "active" : ""} onClick={() => updateJournal(trade, { followedPlan: false })}>No</button></div>
                </div><small className="coach-save-note">Notes saved on this device</small>
              </div>}
            </article>;
          })}
          {!trades.length && <div className="coach-empty"><BookOpenText size={30} /><b>Your journal starts with a trade</b><span>Completed trades and their chart reviews will appear here.</span></div>}
        </div>}
        {tab === "insights" && <div className="coach-insights">
          <div className="coach-section-heading"><h3>Performance breakdown</h3><span>After charges</span></div>
          <div className="coach-group-filters" role="group" aria-label="Group performance">{["Strategy", "Stock", "Direction", "Time", "Duration"].map((group) => <button type="button" key={group} aria-pressed={insightGroup === group} onClick={() => setInsightGroup(group)}>{group}</button>)}</div>
          <div className="coach-insight-cards">{insights.filter((item) => item.label.startsWith(insightGroup + " · ")).map((item) => <article key={item.label}><header><b>{item.label.split(" · ").slice(1).join(" · ")}</b><strong className={item.pnl >= 0 ? "positive" : "negative"}>{item.pnl >= 0 ? "+" : ""}{formatInr(item.pnl)}</strong></header><div><span>{item.count} trades</span><span>{item.winRate.toFixed(0)}% win rate</span></div><progress max="100" value={item.winRate} aria-label={`${item.label} win rate`} /></article>)}</div>
          {chargeReversalCount > 0 && <p className="coach-footnote">{chargeReversalCount} gross winner{chargeReversalCount === 1 ? "" : "s"} became a loss after charges.</p>}
          {!insights.length && <div className="coach-empty"><BarChart3 size={30} /><b>No results yet</b><span>Complete trades to compare your performance.</span></div>}
        </div>}
        {tab === "replay" && <BarReplay key={selected.instrumentKey} instrument={selected} initialTimeframe={timeframe} theme={theme} />}
        {tab === "limits" && <div className="coach-limits" onChange={() => setLimitsSaved(false)}>
          <div className="coach-section-heading"><h3>Your trading rules</h3></div>
          <div className="coach-limit-toggle"><span><b>Enable limits</b><small>Pause new entries when a rule is reached.</small></span><button type="button" role="switch" aria-label="Personal trading limits" aria-checked={draftLimits.enabled} className={draftLimits.enabled ? "active" : ""} onClick={() => { setLimitsSaved(false); setDraftLimits((value) => ({ ...value, enabled: !value.enabled })); }}><span>{draftLimits.enabled ? "ON" : "OFF"}</span><i /></button></div>
          <div className="coach-limit-grid">
            <label>Daily loss limit (₹)<input type="number" inputMode="decimal" min="0" step="500" value={draftLimits.dailyLossLimit} onChange={(event) => setDraftLimits((value) => ({ ...value, dailyLossLimit: Number(event.target.value) }))} /></label>
            <label>Trades per day<input type="number" inputMode="numeric" min="0" max="100" value={draftLimits.maxTradesPerDay} onChange={(event) => setDraftLimits((value) => ({ ...value, maxTradesPerDay: Number(event.target.value) }))} /></label>
            <label>Pause after losses<input type="number" inputMode="numeric" min="0" max="20" value={draftLimits.cooldownAfterLosses} onChange={(event) => setDraftLimits((value) => ({ ...value, cooldownAfterLosses: Number(event.target.value) }))} /><small>Consecutive losing trades</small></label>
            <label>Pause duration<input type="number" inputMode="numeric" min="0" step="5" value={draftLimits.cooldownMinutes} onChange={(event) => setDraftLimits((value) => ({ ...value, cooldownMinutes: Number(event.target.value) }))} /><small>Minutes</small></label>
          </div>
          <p className="coach-footnote">Set a rule to 0 to disable it. Closing a position stays available.</p>
          <button type="button" className="coach-primary" onClick={saveLimits}>{limitsSaved ? "Saved" : "Save trading limits"}</button><span role="status" className="coach-save-note">{limitsSaved ? "Your rules have been updated." : ""}</span>
        </div>}
        {tab === "payoff" && <div>
          <div className="coach-section-heading"><h3>Expiry payoff</h3>{payoffLegs.length > 0 && <span>{payoffLegs.length} legs</span>}</div>
          {!!payoffLegs.length && <div className="coach-payoff-legs">{payoffLegs.map((leg, index) => <span key={`${leg.optionType}-${leg.strike}-${index}`}><i className={leg.side === "BUY" ? "positive" : "negative"}>{leg.side}</i> {leg.quantity} × {leg.strike.toLocaleString("en-IN")} {leg.optionType}<small>@ {formatInr(leg.premium)}</small></span>)}</div>}
          <PayoffChart legs={payoffLegs} spot={spotPrice || selected.price} />
        </div>}
      </div>
    </section>
  </div>;
}
