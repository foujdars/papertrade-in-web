"use client";

import { Activity, BarChart3, BookOpenText, ChevronRight, Pause, Play, RotateCcw, ShieldCheck, Target, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { StockLogo } from "@/components/StockLogo";
import { formatInr, type Candle, type Instrument } from "@/lib/market";
import type { PaperOrder } from "@/lib/paper-trading";
import type { ClosedPaperTrade } from "@/lib/trade-analytics";
import { buildOptionPayoff, readTradeJournal, writeTradeJournal, writeTradingLimits, type OptionPayoffLeg, type TradeJournalEntry, type TradingLimits } from "@/lib/trading-coach";

type CoachTab = "journal" | "insights" | "replay" | "limits" | "payoff";
const STRATEGIES = ["Breakout", "Pullback", "Reversal", "Trend", "Support / resistance", "News", "Other"];

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
      if (!response.ok || !payload.candles?.length) throw new Error(payload.error?.message || "Replay data unavailable");
      const past = payload.candles.slice(0, -1);
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
    <div className="coach-replay-chart">{visible.map((candle, index) => { const x = 2 + index * 96 / Math.max(1, visible.length); const bodyTop = 4 + (high - Math.max(candle.open, candle.close)) / range * 90; const bodyBottom = 4 + (high - Math.min(candle.open, candle.close)) / range * 90; const wickTop = 4 + (high - candle.high) / range * 90; const wickBottom = 4 + (high - candle.low) / range * 90; const colour = candle.close >= candle.open ? "var(--green)" : "var(--red)"; return <svg key={String(candle.time)} x={`${x}%`} y="0" width={`${90 / Math.max(16, visible.length)}%`} height="100%" viewBox="0 0 10 100" preserveAspectRatio="none"><line x1="5" x2="5" y1={wickTop} y2={wickBottom} stroke={colour} /><rect x="1" width="8" y={bodyTop} height={Math.max(1.5, bodyBottom - bodyTop)} fill={colour} rx=".6" /></svg>; })}{!visible.length && <div className="coach-replay-loading"><Activity size={24} />{message}</div>}{position && current && <span className="coach-replay-entry" style={{ top: `${4 + (high - position.price) / range * 90}%` }}>{position.side} {position.price.toFixed(2)}</span>}</div>
    <p>{message}</p><div className="coach-replay-controls"><button onClick={() => trade("LONG")} disabled={!current || position?.side === "LONG"}>Buy</button><button onClick={() => trade("SHORT")} disabled={!current || position?.side === "SHORT"}>Sell</button><button onClick={() => setPlaying((value) => !value)} disabled={!current || cursor >= candles.length - 1}>{playing ? <Pause size={15} /> : <Play size={15} />}{playing ? "Pause" : "Play"}</button><button onClick={() => setCursor((value) => Math.min(candles.length - 1, value + 1))} disabled={!current || cursor >= candles.length - 1}>Next <ChevronRight size={15} /></button><button onClick={() => { setCursor(Math.min(35, Math.max(0, candles.length - 1))); setPosition(null); setRealized(0); setPlaying(false); }}><RotateCcw size={15} /> Reset</button></div>
  </div>;
}

export function TradingCoach({ selected, orders, trades, limits, proposedOptionLeg, spotPrice, onLimitsChange, onReviewTrade, onClose }: { selected: Instrument; orders: PaperOrder[]; trades: ClosedPaperTrade[]; limits: TradingLimits; proposedOptionLeg: OptionPayoffLeg | null; spotPrice: number; onLimitsChange: (limits: TradingLimits) => void; onReviewTrade: (tradeId: string) => void; onClose: () => void; }) {
  const [tab, setTab] = useState<CoachTab>("journal");
  const [journal, setJournal] = useState<Record<string, TradeJournalEntry>>(() => readTradeJournal());
  const [draftLimits, setDraftLimits] = useState(limits);
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
  function saveLimits() { const sanitized = { ...draftLimits, dailyLossLimit: Math.max(0, draftLimits.dailyLossLimit || 0), maxTradesPerDay: Math.max(0, Math.round(draftLimits.maxTradesPerDay || 0)), cooldownAfterLosses: Math.max(0, Math.round(draftLimits.cooldownAfterLosses || 0)), cooldownMinutes: Math.max(0, Math.round(draftLimits.cooldownMinutes || 0)) }; writeTradingLimits(sanitized); onLimitsChange(sanitized); setDraftLimits(sanitized); }

  return <div className="modal-backdrop coach-backdrop" role="presentation" onMouseDown={onClose}><section className="modal coach-modal" role="dialog" aria-modal="true" aria-label="Trading coach" onMouseDown={(event) => event.stopPropagation()}><div className="modal-head"><div><span className="eyebrow">Practice and improve</span><h2>Trading coach</h2></div><button className="icon-button" onClick={onClose} aria-label="Close trading coach"><X size={20} /></button></div><div className="coach-tabs" role="tablist">{(["journal", "insights", "replay", "limits", "payoff"] as const).map((item) => <button key={item} className={tab === item ? "active" : ""} onClick={() => setTab(item)}>{item === "journal" ? <BookOpenText size={16} /> : item === "insights" ? <BarChart3 size={16} /> : item === "limits" ? <ShieldCheck size={16} /> : item === "payoff" ? <Target size={16} /> : <Play size={16} />}{item}</button>)}</div><div className="coach-content">
    {tab === "journal" && <div className="coach-journal-list">{trades.map((trade) => { const entryOrder = ordersById.get(trade.sourceOrderIds[0]); const entry = journal[trade.id]; return <article key={trade.id} className="coach-journal-card"><header><span className="stock-identity"><StockLogo symbol={trade.symbol} size={30} /><span><b>{trade.symbol}</b><small>{trade.direction} · {trade.quantity} units · {durationLabel(trade.closedAt - trade.openedAt)}</small></span></span><span className="coach-journal-result"><strong className={trade.netPnl >= 0 ? "positive" : "negative"}>{trade.netPnl >= 0 ? "+" : ""}{formatInr(trade.netPnl)}</strong><button type="button" onClick={() => onReviewTrade(trade.id)}>Chart review <ChevronRight size={14} /></button></span></header><div className="coach-journal-fields"><label>Strategy<select value={entry?.strategy || entryOrder?.journalPlan?.strategy || "Other"} onChange={(event) => updateJournal(trade, { strategy: event.target.value })}>{STRATEGIES.map((strategy) => <option key={strategy}>{strategy}</option>)}</select></label><label>Confidence<input type="range" min="1" max="5" value={entry?.confidence ?? entryOrder?.journalPlan?.confidence ?? 3} onChange={(event) => updateJournal(trade, { confidence: Number(event.target.value) })} /><span>{entry?.confidence ?? entryOrder?.journalPlan?.confidence ?? 3}/5</span></label><label className="wide">Entry reason<textarea value={entry?.thesis ?? entryOrder?.journalPlan?.thesis ?? ""} onChange={(event) => updateJournal(trade, { thesis: event.target.value })} placeholder="Why did you enter?" /></label><label className="wide">Review<textarea value={entry?.review ?? ""} onChange={(event) => updateJournal(trade, { review: event.target.value })} placeholder="What worked, and what will you change next time?" /></label><div className="coach-plan-check"><span>Followed your plan?</span><button className={entry?.followedPlan === true ? "active" : ""} onClick={() => updateJournal(trade, { followedPlan: true })}>Yes</button><button className={entry?.followedPlan === false ? "active" : ""} onClick={() => updateJournal(trade, { followedPlan: false })}>No</button></div></div></article>; })}{!trades.length && <div className="coach-empty"><BookOpenText size={30} /><b>No completed trades yet</b><span>Your journal will build automatically as you practise.</span></div>}</div>}
    {tab === "insights" && <div className="coach-insights"><div className="coach-insight-note"><BarChart3 size={20} /><span><b>Find the pattern behind your P&amp;L</b><small>Grouped by strategy, stock, direction, entry time and duration. {chargeReversalCount ? `${chargeReversalCount} gross winner${chargeReversalCount === 1 ? "" : "s"} became a net loss after charges.` : "No gross winners became losses after charges."}</small></span></div><div className="coach-insight-table"><div><b>Pattern</b><b>Trades</b><b>Win rate</b><b>Net P&amp;L</b></div>{insights.map((item) => <div key={item.label}><span>{item.label}</span><span>{item.count}</span><span>{item.winRate.toFixed(0)}%</span><b className={item.pnl >= 0 ? "positive" : "negative"}>{item.pnl >= 0 ? "+" : ""}{formatInr(item.pnl)}</b></div>)}</div>{!insights.length && <div className="coach-empty"><Activity size={30} /><b>More trades needed</b><span>Complete trades and tag their strategies to unlock comparisons.</span></div>}</div>}
    {tab === "replay" && <ReplayPanel instrument={selected} />}
    {tab === "limits" && <div className="coach-limits"><div className="coach-limit-toggle"><span><b>Personal trading limits</b><small>Pause new paper trades when your rules are reached.</small></span><button role="switch" aria-checked={draftLimits.enabled} className={draftLimits.enabled ? "active" : ""} onClick={() => setDraftLimits((value) => ({ ...value, enabled: !value.enabled }))}><i /></button></div><div className="coach-limit-grid"><label>Daily loss limit (₹)<input type="number" min="0" step="500" value={draftLimits.dailyLossLimit} onChange={(event) => setDraftLimits((value) => ({ ...value, dailyLossLimit: Number(event.target.value) }))} /></label><label>Maximum trades per day<input type="number" min="0" max="100" value={draftLimits.maxTradesPerDay} onChange={(event) => setDraftLimits((value) => ({ ...value, maxTradesPerDay: Number(event.target.value) }))} /></label><label>Cooldown after consecutive losses<input type="number" min="0" max="20" value={draftLimits.cooldownAfterLosses} onChange={(event) => setDraftLimits((value) => ({ ...value, cooldownAfterLosses: Number(event.target.value) }))} /></label><label>Cooldown duration (minutes)<input type="number" min="0" step="5" value={draftLimits.cooldownMinutes} onChange={(event) => setDraftLimits((value) => ({ ...value, cooldownMinutes: Number(event.target.value) }))} /></label></div><button className="primary-button" onClick={saveLimits}>Save trading limits</button></div>}
    {tab === "payoff" && <div><div className="coach-payoff-legs"><b>Expiry payoff · {payoffLegs.length} leg{payoffLegs.length === 1 ? "" : "s"}</b>{payoffLegs.map((leg, index) => <span key={`${leg.optionType}-${leg.strike}-${index}`}><i className={leg.side === "BUY" ? "positive" : "negative"}>{leg.side}</i> {leg.quantity} × {leg.strike.toLocaleString("en-IN")} {leg.optionType} @ {formatInr(leg.premium)}</span>)}</div><PayoffChart legs={payoffLegs} spot={spotPrice || selected.price} /></div>}
  </div></section></div>;
}
