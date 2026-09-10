"use client";

import { Activity, BarChart3, BookOpenText, ChevronRight, Pause, Play, RotateCcw, ShieldCheck, Target, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { ConfidenceControl, StrategyPicker } from "@/components/TradePlanControls";
import { StockLogo } from "@/components/StockLogo";
import { formatInr, type Candle, type Instrument } from "@/lib/market";
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

function ReplayPanel({ instrument }: { instrument: Instrument }) {
  const [candles, setCandles] = useState<Candle[]>([]);
  const [cursor, setCursor] = useState(35);
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState<{ side: "LONG" | "SHORT"; price: number } | null>(null);
  const [realized, setRealized] = useState(0);
  const [message, setMessage] = useState("Loading a past market sequence…");

  useEffect(() => {
    const controller = new AbortController();
    const reset = window.setTimeout(() => { setCandles([]); setCursor(35); setPlaying(false); setPosition(null); setRealized(0); setMessage("Loading a past market sequence…"); }, 0);
    const params = new URLSearchParams({ instrumentKey: instrument.instrumentKey, timeframe: "5m", scope: "combined" });
    void fetch(`/api/upstox/candles?${params}`, { cache: "no-store", signal: controller.signal }).then(async (response) => {
      const payload = await response.json() as { candles?: Candle[]; error?: { message?: string } };
      if (!response.ok || !payload.candles?.length) throw new Error("Historical candles are unavailable. Please try again shortly.");
      const past = [...payload.candles].sort((a, b) => a.time - b.time).slice(0, -1);
      if (!past.length) throw new Error("No completed candles available for replay.");
      setCandles(past); setCursor(Math.min(35, Math.max(0, past.length - 1))); setMessage("Future candles are hidden. Advance when you are ready.");
    }).catch((error) => { if (!controller.signal.aborted) setMessage(error instanceof Error ? error.message : "Replay data unavailable"); });
    return () => { controller.abort(); window.clearTimeout(reset); };
  }, [instrument.instrumentKey]);

  useEffect(() => {
    if (!playing || !candles.length || cursor >= candles.length - 1) return;
    const timer = window.setInterval(() => setCursor((value) => Math.min(candles.length - 1, value + 1)), 700);
    return () => window.clearInterval(timer);
  }, [candles.length, cursor, playing]);

  const visible = candles.slice(Math.max(0, cursor - 49), cursor + 1);
  const current = candles[cursor];
  const low = visible.length ? Math.min(...visible.map((candle) => candle.low)) : 0;
  const high = visible.length ? Math.max(...visible.map((candle) => candle.high)) : 1;
  const range = Math.max(.01, high - low);
  const floating = position && current ? (current.close - position.price) * (position.side === "LONG" ? 1 : -1) : 0;
  function trade(nextSide: "LONG" | "SHORT") {
    if (!current) return;
    if (!position) { setPosition({ side: nextSide, price: current.close }); return; }
    if (position.side === nextSide) return;
    setRealized((value) => value + (current.close - position.price) * (position.side === "LONG" ? 1 : -1)); setPosition(null);
  }

  return <div className="coach-replay">
    <div className="coach-replay-head"><span className="stock-identity"><StockLogo {...instrument} size={30} /><span><b>{instrument.symbol}</b><small>5-minute historical replay</small></span></span><strong className={realized + floating >= 0 ? "positive" : "negative"}>{realized + floating >= 0 ? "+" : ""}{formatInr(realized + floating)}</strong></div>
    <div className="coach-replay-chart">
      {visible.length > 0 ? <svg className="coach-candle-canvas" viewBox="0 0 600 330" role="img" aria-label={`${instrument.symbol} historical candles, future candles hidden`}>
        {[0, 1, 2, 3, 4].map((tick) => <g key={tick}><line x1="14" x2="530" y1={24 + tick * 64} y2={24 + tick * 64} className="coach-chart-grid" /><text x="542" y={28 + tick * 64} className="coach-chart-axis">{(high - range * tick / 4).toFixed(2)}</text></g>)}
        {visible.map((candle, index) => {
          const x = 22 + index * 498 / Math.max(1, visible.length - 1);
          const y = (price: number) => 24 + (high - price) / range * 256;
          const colour = candle.close >= candle.open ? "var(--green)" : "var(--red)";
          return <g key={String(candle.time)}><line x1={x} x2={x} y1={y(candle.high)} y2={y(candle.low)} stroke={colour} strokeWidth="1.4" /><rect x={x - 3.4} width="6.8" y={y(Math.max(candle.open, candle.close))} height={Math.max(1.4, Math.abs(y(candle.open) - y(candle.close)))} fill={colour} rx=".6" /></g>;
        })}
        {position && position.price >= low && position.price <= high && <line x1="14" x2="530" y1={24 + (high - position.price) / range * 256} y2={24 + (high - position.price) / range * 256} className="coach-chart-position" />}
        <text x="14" y="316" className="coach-chart-axis">{new Date(visible[0].time * 1000).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</text>
        <text x="525" y="316" textAnchor="end" className="coach-chart-axis">{current && new Date(current.time * 1000).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit" })}</text>
      </svg> : <div className="coach-replay-loading"><Activity size={24} /><span>{message}</span></div>}
    </div>
    <div className="coach-replay-position"><span>{position ? `${position.side} · Entry ${formatInr(position.price)}` : "No practice position"}</span><span>{current ? `Candle ${cursor + 1} / ${candles.length}` : "—"}</span></div>
    <p>{current ? "Practice with one unit. Use the opposite side to close." : message}</p><div className="coach-replay-controls"><button onClick={() => trade("LONG")} disabled={!current || position?.side === "LONG"}>Buy</button><button onClick={() => trade("SHORT")} disabled={!current || position?.side === "SHORT"}>Sell</button><button onClick={() => setPlaying((value) => !value)} disabled={!current || cursor >= candles.length - 1}>{playing ? <Pause size={15} /> : <Play size={15} />}{playing ? "Pause" : "Play"}</button><button onClick={() => setCursor((value) => Math.min(candles.length - 1, value + 1))} disabled={!current || cursor >= candles.length - 1}>Next <ChevronRight size={15} /></button><button onClick={() => { setCursor(Math.min(35, Math.max(0, candles.length - 1))); setPosition(null); setRealized(0); setPlaying(false); }}><RotateCcw size={15} /> Reset</button></div>
  </div>;
}

export function TradingCoach({ selected, orders, trades, limits, proposedOptionLeg, spotPrice, onLimitsChange, onReviewTrade, onClose, initialTab = "journal" }: { selected: Instrument; orders: PaperOrder[]; trades: ClosedPaperTrade[]; limits: TradingLimits; proposedOptionLeg: OptionPayoffLeg | null; spotPrice: number; onLimitsChange: (limits: TradingLimits) => void; onReviewTrade: (tradeId: string) => void; onClose: () => void; initialTab?: CoachTab; }) {
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
      <div className="coach-content" id="coach-panel" role="tabpanel" aria-labelledby={`coach-tab-${tab}`}>
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
        {tab === "replay" && <ReplayPanel instrument={selected} />}
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
