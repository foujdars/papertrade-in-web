"use client";
import { useEffect, useId, useMemo, useState, type CSSProperties } from "react";
import { ArrowDownRight, ChevronLeft, ChevronRight, SlidersHorizontal } from "lucide-react";
import type { ClosedPaperTrade } from "@/lib/trade-analytics";
import type { PaperOrder } from "@/lib/paper-trading";
import { readTradeJournal, type TradeJournalEntry } from "@/lib/trading-coach";
import { CLOUD_CHANGE_EVENT } from "@/lib/cloud-journal";
import { ModernSelect } from "./ModernSelect";
import { PNL_BREAKDOWN_KEY, readPreference, writePreference } from "@/lib/interface-preferences";
import { PNL_DIMENSIONS, groupPnl, pnlBounds, pnlCurve, pnlDay, pnlDistribution, pnlOutcome, rollingPnl, summarisePnl, type PnlDimension, type PnlScope } from "@/lib/pnl-analytics";

export type PnlTab = "overview" | "insights" | "trades";
function readBreakdown() {
  const saved = readPreference(PNL_BREAKDOWN_KEY) as { dimension?: PnlDimension; measure?: string } | null;
  return { dimension: saved && PNL_DIMENSIONS.includes(saved.dimension!) ? saved.dimension! : "Symbol" as PnlDimension, measure: saved?.measure === "average" ? "average" as const : "total" as const };
}
const rupees = (n: number | null) => n === null ? "—" : `${n < -.004 ? "−" : ""}₹${Math.abs(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const compact = (n: number) => `${n < 0 ? "−" : ""}₹${Math.abs(n) >= 100000 ? `${(Math.abs(n) / 100000).toFixed(1)}L` : Math.abs(n) >= 1000 ? `${(Math.abs(n) / 1000).toFixed(1)}k` : Math.abs(n).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const dateText = (time: number | null) => time ? new Date(time).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short" }) : "Period start";
const signClass = (value: number) => pnlOutcome(value) === "profit" ? "positive" : pnlOutcome(value) === "loss" ? "negative" : "";
type Drill = (ids: string[], label: string) => void;
type Point = { time: number; value: number; ids: string[]; label?: string };

function PnlLineChart({ points, label, onSelect, baseline = false, negativeOnly = false, focus = "end" }: { points: Point[]; label: string; onSelect: Drill; baseline?: boolean; negativeOnly?: boolean; focus?: "end" | "largest" }) {
  const uid = useId().replace(/:/g, ""), [selected, setSelected] = useState<number | null>(null);
  useEffect(() => setSelected(null), [points]);
  const left = 60, right = 388, top = 14, bottom = 157;
  const low = Math.min(0, ...points.map(p => p.value)), high = Math.max(0, ...points.map(p => p.value)), span = high - low || 1;
  const y = (value: number) => bottom - (value - low) / span * (bottom - top);
  const first = points[0]?.time ?? 0, last = points.at(-1)?.time ?? first;
  const x = (time: number) => left + (time - first) / (last - first || 1) * (right - left);
  const vertices = points.map(p => `${x(p.time)},${y(p.value)}`).join(" ");
  const path = `${baseline ? `${left},${y(0)} ` : ""}${vertices}`;
  const focused = focus === "largest" ? points.reduce((best, point, index) => Math.abs(point.value - (points[index - 1]?.value ?? 0)) >= Math.abs(points[best].value - (points[best - 1]?.value ?? 0)) ? index : best, Math.max(0, points.length - 1)) : Math.max(0, points.length - 1);
  const active = points[selected ?? focused];
  if (!points.length) return <div className="pnl-chart-empty">No dated completed trades in this period.</div>;
  return <div className="pnl-line-chart">
    <svg viewBox="0 0 400 191" role="img" tabIndex={0} aria-label={`${label}. Use left and right arrow keys to inspect trades.`} onKeyDown={event => { if (event.key === "ArrowRight" || event.key === "ArrowLeft") { event.preventDefault(); setSelected(i => Math.max(0, Math.min(points.length - 1, (i ?? focused) + (event.key === "ArrowRight" ? 1 : -1)))); } }} onPointerDown={event => { const bounds = event.currentTarget.getBoundingClientRect(), value = (event.clientX - bounds.left) / bounds.width * 400; let closest = 0; points.forEach((p, i) => { if (Math.abs(x(p.time) - value) < Math.abs(x(points[closest].time) - value)) closest = i; }); setSelected(closest); }}>
      <defs><clipPath id={`${uid}-up`}><rect x={left} y={0} width={right - left + 1} height={y(0)} /></clipPath><clipPath id={`${uid}-down`}><rect x={left} y={y(0)} width={right - left + 1} height={bottom + 1 - y(0)} /></clipPath></defs>
      {[high, ...(high !== 0 && low !== 0 ? [0] : high === low ? [] : [(high + low) / 2]), ...(high === low ? [] : [low])].map((value, i) => <g key={i}><line className="pnl-gridline" x1={left} x2={right} y1={y(value)} y2={y(value)} /><text x={left - 8} y={y(value) + 3} textAnchor="end">{compact(value)}</text></g>)}
      <line className="pnl-zero-line" x1={left} x2={right} y1={y(0)} y2={y(0)} />
      {["up", "down"].map(side => <g key={side} clipPath={`url(#${uid}-${side})`} style={{ color: negativeOnly || side === "down" ? "var(--red)" : "var(--green)" }}><polygon points={`${left},${y(0)} ${path} ${x(last)},${y(0)}`} fill="currentColor" opacity=".08" /><polyline points={path} fill="none" stroke="currentColor" strokeWidth="2" vectorEffect="non-scaling-stroke" /></g>)}
      <text x={left} y={181}>{dateText(first)}</text><text x={right} y={181} textAnchor="end">{dateText(last)}</text>
      {active && <g><line x1={x(active.time)} x2={x(active.time)} y1={top} y2={bottom} className="pnl-inspect-line" /><circle cx={x(active.time)} cy={y(active.value)} r="4" fill="var(--purple)" /></g>}
    </svg>
    {active && <div className="pnl-chart-readout"><span>{dateText(active.time)}<b className={signClass(active.value)}>{rupees(active.value)}</b></span><button type="button" onClick={() => onSelect(active.ids, active.label ?? `${label} · ${dateText(active.time)}`)}>View {active.ids.length > 1 ? `${active.ids.length} trades` : "trade"}<ChevronRight size={14} /></button></div>}
  </div>;
}

export function PnlBreakdown({ trades, orders, journal, onSelect }: { trades: ClosedPaperTrade[]; orders: PaperOrder[]; journal: Record<string, TradeJournalEntry>; onSelect: Drill }) {
  const [dimension, setDimension] = useState<PnlDimension>(() => readBreakdown().dimension), [measure, setMeasure] = useState<"total" | "average">(() => readBreakdown().measure);
  const groups = useMemo(() => groupPnl(trades, orders, journal, dimension).sort((a, b) => (measure === "total" ? b.net - a.net : (b.average ?? 0) - (a.average ?? 0))), [trades, orders, journal, dimension, measure]);
  const max = Math.max(1, ...groups.map(g => Math.abs(measure === "total" ? g.net : g.average ?? 0)));
  return <section className="pnl-a-card pnl-breakdown"><header><div><span className="pnl-kicker">Where results come from</span><h3>Performance breakdown</h3></div><SlidersHorizontal size={18} /></header>
    <div className="pnl-breakdown-controls"><ModernSelect label="Group by" value={dimension} choices={PNL_DIMENSIONS.map(d => ({ value: d, label: d }))} onChange={value => { setDimension(value); writePreference(PNL_BREAKDOWN_KEY, { dimension: value, measure }); }} /><ModernSelect label="Compare" value={measure} choices={[{ value: "total", label: "Total net P&L", description: "Combined result after charges" }, { value: "average", label: "Average per trade", description: "Net result divided by completed exits" }]} onChange={value => { setMeasure(value); writePreference(PNL_BREAKDOWN_KEY, { dimension, measure: value }); }} /></div>
    {dimension === "Entry time" && <p className="pnl-help">Entry time in IST. Delivery / carry-forward trades stay separate.</p>}
    <div className="pnl-ranked-list">{groups.map(g => { const value = measure === "total" ? g.net : g.average ?? 0; return <button className="pnl-ranked-row" key={g.label} onClick={() => onSelect(g.trades.map(t => t.id), `${dimension}: ${g.label}`)}><span className="pnl-ranked-heading"><b>{g.label}</b><strong className={signClass(value)}>{rupees(value)}</strong></span><span className="pnl-diverging-track"><i style={{ left: `${value >= 0 ? 50 : 50 - Math.abs(value) / max * 50}%`, width: `${Math.abs(value) / max * 50}%`, background: value >= 0 ? "var(--green)" : "var(--red)" }} /></span><small>{g.count} trade{g.count === 1 ? "" : "s"} · Avg {rupees(g.average)}{g.count >= 10 ? ` · ${g.winRate?.toFixed(0)}% wins` : ""}</small></button>; })}</div>
    {!groups.length && <p className="pnl-chart-empty">No trades match these filters.</p>}
    <p className="pnl-help">A group needs 10 exits before its win rate is shown. Position size changes the rupee result.</p>
  </section>;
}

function PnlFindings({ trades, orders, onSelect }: { trades: ClosedPaperTrade[]; orders: PaperOrder[]; onSelect: Drill }) {
  const stats = useMemo(() => summarisePnl(trades), [trades]);
  const auto = useMemo(() => {
    const exits = new Map(orders.map(order => [order.id, order]));
    return trades.filter(trade => { const order = exits.get(trade.id); return Boolean(order?.autoSquareOff || order?.exitReason === "AUTO_SQUARE_OFF"); });
  }, [trades, orders]);
  const autoNet = auto.reduce((sum, trade) => sum + trade.netPnl, 0);
  const worstShare = stats.worst && stats.net < 0 && stats.worst.netPnl < 0 ? Math.abs(stats.worst.netPnl) / Math.abs(stats.net) * 100 : null;
  if (!trades.length) return null;
  return <section className="pnl-a-card pnl-findings"><header><div><span className="pnl-kicker">What changed the result</span></div></header>
    <div className="pnl-finding-list">
      <button type="button" className="is-loss" disabled={!stats.worst} onClick={() => stats.worst && onSelect([stats.worst.id], "Largest loss")}>
        <span className="pnl-finding-copy"><small>Largest loss</small><b>{stats.worst?.symbol ?? "—"}</b></span>
        <span className="pnl-finding-figure"><strong className="negative">{rupees(stats.worst?.netPnl ?? null)}</strong><small>{worstShare === null ? "No net loss" : `${worstShare.toFixed(0)}% of the net loss`}</small></span>
      </button>
      <button type="button" className="is-loss" disabled={!auto.length} onClick={() => auto.length && onSelect(auto.map(trade => trade.id), "Auto exits")}>
        <span className="pnl-finding-copy"><small>Auto exits</small><b>{auto.length ? `${auto.length} of ${trades.length} exits` : "None"}</b></span>
        <span className="pnl-finding-figure"><strong className={signClass(autoNet)}>{auto.length ? rupees(autoNet) : "—"}</strong><small>{auto.length ? "Closed at the session" : "No session auto-exit"}</small></span>
      </button>
      <button type="button" className="is-cost" onClick={() => onSelect(trades.map(trade => trade.id), "Charges")}>
        <span className="pnl-finding-copy"><small>Charges</small><b>{stats.costReversals ? `${stats.costReversals} winner${stats.costReversals === 1 ? "" : "s"} flipped` : "No winner flipped"}</b></span>
        <span className="pnl-finding-figure"><strong>{rupees(stats.charges)}</strong><small>Already inside net P&L</small></span>
      </button>
    </div>
  </section>;
}

function PnlInsights({ trades, orders, journal, onSelect }: { trades: ClosedPaperTrade[]; orders: PaperOrder[]; journal: Record<string, TradeJournalEntry>; onSelect: Drill }) {
  const stats = useMemo(() => summarisePnl(trades), [trades]), distribution = useMemo(() => pnlDistribution(trades), [trades]);
  const rolling = useMemo(() => rollingPnl(trades).map(p => ({ time: p.time, value: p.value, ids: p.ids, label: `10-trade window ending ${dateText(p.time)}` })), [trades]);
  const steps = [
    { label: "Gains", change: stats.grossGains, tone: "gain", ids: trades.filter(t => t.grossPnl > 0).map(t => t.id) },
    { label: "Losses", change: -stats.grossLosses, tone: "loss", ids: trades.filter(t => t.grossPnl < 0).map(t => t.id) },
    { label: "Charges", change: -stats.charges, tone: "cost", ids: trades.map(t => t.id) },
    { label: "Net", change: stats.net, tone: stats.net >= 0 ? "gain" : "loss", ids: trades.map(t => t.id) },
  ];
  const flowMax = Math.max(1, ...steps.map(step => Math.abs(step.change)));
  const maxCount = Math.max(1, ...distribution.bins.map(b => b.trades.length)), hx = (v: number) => 32 + (v - distribution.min) / (distribution.max - distribution.min) * 344;
  const [selectedBin, setSelectedBin] = useState<number | null>(null);
  useEffect(() => setSelectedBin(null), [trades]);
  return <div className="pnl-insight-grid">
    <PnlFindings trades={trades} orders={orders} onSelect={onSelect} />
    <section className="pnl-a-card"><header><div><span className="pnl-kicker">Before costs → after costs</span><h3>How the rupees add up</h3></div></header>
      <div className="pnl-flow">{steps.map(step => <button key={step.label} type="button" onClick={() => onSelect(step.ids, step.label)}><span className="pnl-flow-top"><b>{step.label}</b><strong className={step.tone === "cost" ? "pnl-cost" : signClass(step.change)}>{rupees(step.change)}</strong></span><span className="pnl-flow-track" aria-hidden="true"><i className={step.tone} style={{ width: `${Math.abs(step.change) / flowMax * 100}%` }} /></span></button>)}</div>
      <p className="pnl-help">{stats.costReversals ? `${stats.costReversals} gross winner${stats.costReversals === 1 ? "" : "s"} became a loss after charges.` : "Charges did not turn any winner into a loss."}</p>
    </section>
    <section className="pnl-a-card"><header><div><span className="pnl-kicker">Beyond your win rate</span><h3>Trade-result distribution</h3></div></header>
      <svg className="pnl-distribution" viewBox="0 0 400 188" role="img" aria-label="Number of completed trades in each net profit or loss range"><text x="32" y="14">Trade count · max {maxCount}</text>{distribution.bins.map((bin, i) => { const height = bin.trades.length / maxCount * 112; return <g key={i} role="button" tabIndex={0} aria-label={`${rupees(bin.from)} to ${rupees(bin.to)}: ${bin.trades.length} trades`} onClick={() => setSelectedBin(i)} onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelectedBin(i); } }}><rect x={33 + i * 43} y={146 - height} width="39" height={Math.max(2, height)} rx="3" fill={i < 4 ? "var(--red)" : "var(--green)"} opacity={selectedBin === i ? 1 : .55} /><text x={52 + i * 43} y={138 - height} textAnchor="middle">{bin.trades.length || ""}</text></g>; })}
        {[{ value: stats.averageWin, color: "var(--green)" }, { value: stats.averageLoss, color: "var(--red)" }, { value: stats.median, color: "var(--purple)" }].filter(m => m.value !== null).map((m, i) => <line key={i} x1={hx(m.value!)} x2={hx(m.value!)} y1="24" y2="148" stroke={m.color} strokeDasharray="3 4" />)}
        <text x="32" y="174">{compact(distribution.min)}</text><text x="204" y="174" textAnchor="middle">₹0</text><text x="376" y="174" textAnchor="end">{compact(distribution.max)}</text>
      </svg>
      {selectedBin !== null && <div className="pnl-chart-readout"><span>{rupees(distribution.bins[selectedBin].from)} to {rupees(distribution.bins[selectedBin].to)}</span><button onClick={() => onSelect(distribution.bins[selectedBin].trades.map(t => t.id), "Selected result range")}>View {distribution.bins[selectedBin].trades.length} trades</button></div>}
      <div className="pnl-distribution-markers"><span className="positive">Avg win <b>{rupees(stats.averageWin)}</b></span><span className="negative">Avg loss <b>{rupees(stats.averageLoss)}</b></span><span>Median <b>{rupees(stats.median)}</b></span></div>
      <div className="pnl-extreme-links">{[["Best", stats.best], ["Worst", stats.worst]].map(([title, trade]) => { const t = trade as ClosedPaperTrade | null; return <button key={title as string} disabled={!t} onClick={() => t && onSelect([t.id], `${title} trade`)}><span>{title as string}</span><b className={signClass(t?.netPnl ?? 0)}>{rupees(t?.netPnl ?? null)}</b><ChevronRight size={13} /></button>; })}</div>
      <p className="pnl-help">Tap a bar to see the trades in that range.</p>
    </section>
    <PnlBreakdown trades={trades} orders={orders} journal={journal} onSelect={onSelect} />
    <section className="pnl-a-card"><header><div><span className="pnl-kicker">Recent consistency</span><h3>Average of the last 10 trades</h3></div></header>{rolling.length ? <PnlLineChart points={rolling} label="Rolling 10-trade net average" onSelect={onSelect} /> : <div className="pnl-chart-empty">Needs 10 dated completed trades. {pnlCurve(trades).points.length} available in this selection.</div>}<p className="pnl-help">Each point is the average of 10 exits. Overlapping windows, not a forecast.</p></section>
  </div>;
}

function PnlCalendar({ trades, scope, onScope, now, onSelect }: { trades: ClosedPaperTrade[]; scope: PnlScope; onScope: (s: PnlScope) => void; now: number; onSelect: Drill }) {
  const bounds = pnlBounds(scope, now), [month, setMonth] = useState(() => (scope.day || bounds.end || pnlDay(now)).slice(0, 7));
  useEffect(() => { setMonth((scope.day || bounds.end || pnlDay(now)).slice(0, 7)); }, [scope.period, scope.start, scope.end, scope.day, now, bounds.end]);
  const [year, monthNumber] = month.split("-").map(Number), days = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate(), first = (new Date(Date.UTC(year, monthNumber - 1, 1)).getUTCDay() + 6) % 7;
  const daily = new Map<string, ClosedPaperTrade[]>();
  for (const t of trades) { const key = pnlDay(t.closedAt); if (key.startsWith(month)) daily.set(key, [...(daily.get(key) ?? []), t]); }
  const max = Math.max(1, ...[...daily.values()].map(items => Math.abs(summarisePnl(items).net)));
  const selectMonth = (value: string) => { if (!/^\d{4}-\d{2}$/.test(value)) return; const [y, m] = value.split("-").map(Number); setMonth(value); onScope({ ...scope, period: "custom", start: `${value}-01`, end: `${value}-${new Date(Date.UTC(y, m, 0)).getUTCDate()}`, day: null }); };
  const move = (delta: number) => selectMonth(new Date(Date.UTC(year, monthNumber - 1 + delta, 1)).toISOString().slice(0, 7));
  const selected = scope.day ? daily.get(scope.day) ?? [] : null;
  return <section className="pnl-a-card pnl-calendar-card"><header><div><h3>Calendar</h3></div><div className="pnl-calendar-controls"><button aria-label="Previous P&L month" onClick={() => move(-1)}><ChevronLeft size={16} /></button><input aria-label="Calendar month" type="month" value={month} onChange={e => selectMonth(e.target.value)} /><button aria-label="Next P&L month" onClick={() => move(1)}><ChevronRight size={16} /></button></div></header>
    <div className="pnl-calendar-weekdays">{["M", "T", "W", "T", "F", "S", "S"].map((d, i) => <span key={i}>{d}</span>)}</div>
    <div className="pnl-calendar-grid">{Array.from({ length: first }, (_, i) => <span key={`blank-${i}`} />)}{Array.from({ length: days }, (_, i) => { const key = `${month}-${String(i + 1).padStart(2, "0")}`, items = daily.get(key), net = items ? summarisePnl(items).net : 0, outcome = items ? pnlOutcome(net) : "no-trade"; const excluded = !bounds.valid || Boolean(bounds.start && key < bounds.start || bounds.end && key > bounds.end); return <button key={key} disabled={excluded} className={`pnl-calendar-day ${outcome} ${scope.day === key ? "selected" : ""}`} aria-label={`${key}: ${items ? `${rupees(net)}, ${items.length} trades` : "No trades"}`} aria-pressed={scope.day === key} style={{ "--day-strength": items ? .12 + .48 * Math.abs(net) / max : 0 } as CSSProperties} onClick={() => onScope({ ...scope, day: scope.day === key ? null : key })}><b>{i + 1}</b><small>{items ? compact(net) : ""}</small></button>; })}</div>
    <p className="pnl-help pnl-calendar-legend"><span className="positive">Profit</span><span className="negative">Loss</span><span>Breakeven ₹0</span><span>Blank = no trades</span></p>
    {selected && <div className="pnl-day-detail"><span><b>{scope.day}</b>{selected.length} exits · Net {rupees(summarisePnl(selected).net)} · Charges {rupees(summarisePnl(selected).charges)}</span><button onClick={() => onSelect(selected.map(t => t.id), `Trades on ${scope.day}`)}>View trades<ChevronRight size={14} /></button></div>}
  </section>;
}

export function PnlAnalytics({ trades, calendarTrades, orders, scope, onScope, tab, onTab, onSelect, now }: { trades: ClosedPaperTrade[]; calendarTrades: ClosedPaperTrade[]; orders: PaperOrder[]; scope: PnlScope; onScope: (scope: PnlScope) => void; tab: PnlTab; onTab: (tab: PnlTab) => void; onSelect: Drill; now: number }) {
  const stats = useMemo(() => summarisePnl(trades), [trades]), curve = useMemo(() => pnlCurve(trades), [trades]);
  const points = useMemo(() => curve.points.map(p => ({ time: p.time, value: p.value, ids: [p.trade.id], label: `${p.trade.symbol} · ${dateText(p.time)}` })), [curve]);
  const drawdown = useMemo(() => curve.points.map(p => ({ time: p.time, value: -p.drawdown, ids: [p.trade.id] })), [curve]);
  const [journal, setJournal] = useState<Record<string, TradeJournalEntry>>({});
  useEffect(() => { const refresh = () => setJournal(readTradeJournal()); refresh(); window.addEventListener(CLOUD_CHANGE_EVENT, refresh); window.addEventListener("storage", refresh); return () => { window.removeEventListener(CLOUD_CHANGE_EVENT, refresh); window.removeEventListener("storage", refresh); }; }, []);
  const bounds = pnlBounds(scope, now), allIds = trades.map(t => t.id);
  const setScope = (patch: Partial<PnlScope>) => onScope({ ...scope, ...patch, day: null });
  return <div className="pnl-analytics">
    <div className="pnl-scope-controls">
      <ModernSelect label="Period" ariaLabel="P&L period" value={scope.period} choices={[{ value: "all", label: "All time", description: "Every recorded completed exit" }, { value: "month", label: "This month", description: "From the first of this month, in IST" }, { value: "30d", label: "Last 30 days", description: "A rolling window including today" }, { value: "custom", label: "Custom dates", description: "Choose your own start and end dates" }]} onChange={period => setScope({ period, start: scope.start || `${pnlDay(now).slice(0, 7)}-01`, end: scope.end || pnlDay(now) })} />
      <ModernSelect label="Market" ariaLabel="P&L market" value={scope.asset} choices={[{ value: "all", label: "All markets" }, { value: "stocks", label: "Stocks" }, { value: "fno", label: "F&O", description: "Options and futures" }]} onChange={asset => setScope({ asset })} />
      <ModernSelect label="Product" ariaLabel="P&L product" value={scope.product} choices={[{ value: "all", label: "All products" }, { value: "INTRADAY", label: "Intraday" }, { value: "DELIVERY", label: "Delivery / carry" }]} onChange={product => setScope({ product })} />
    </div>
    {scope.period === "custom" && <div className="pnl-custom-dates"><label>From<input type="date" value={scope.start} onChange={e => setScope({ start: e.target.value })} /></label><label>Through<input type="date" value={scope.end} onChange={e => setScope({ end: e.target.value })} /></label></div>}
    {!bounds.valid && <p role="alert" className="pnl-filter-error">Choose a valid start and end date. The end date must not precede the start.</p>}
    <nav className="pnl-view-tabs" role="tablist" aria-label="P&L views">{(["overview", "insights", "trades"] as const).map((value, i, tabs) => <button key={value} role="tab" tabIndex={tab === value ? 0 : -1} aria-selected={tab === value} onClick={() => onTab(value)} onKeyDown={e => { if (e.key === "ArrowRight" || e.key === "ArrowLeft") { e.preventDefault(); const next = (i + (e.key === "ArrowRight" ? 1 : 2)) % 3; onTab(tabs[next]); (e.currentTarget.parentElement?.children[next] as HTMLElement)?.focus(); } }}>{value[0].toUpperCase() + value.slice(1)}</button>)}</nav>
    {tab === "overview" && <><div className="pnl-summary-six">
      <div><span>Net P&amp;L</span><b data-testid="pnl-net" className={signClass(stats.net)}>{rupees(stats.net)}</b><small>Completed exits only</small></div>
      <button onClick={() => onSelect(allIds, "Completed trades")}><span>Completed trades</span><b data-testid="pnl-count">{stats.count}</b><small>View exits <ChevronRight size={11} /></small></button>
      <div><span>Win rate</span><b>{stats.winRate === null ? "—" : `${stats.winRate.toFixed(1)}%`}</b><small>{stats.wins} W · {stats.losses} L · {stats.breakevens} flat</small></div>
      <div><span>Profit factor</span><b>{stats.profitFactor === null ? "—" : stats.profitFactor === Infinity ? "No losses" : stats.profitFactor.toFixed(2)}</b></div>
      <div><span>Average net P&amp;L / trade</span><b className={signClass(stats.average ?? 0)}>{rupees(stats.average)}</b></div>
      <div><span>Charges</span><b>{rupees(stats.charges)}</b><small>Included in net P&amp;L</small></div>
    </div></>}
    {tab === "overview" && <div className="pnl-overview-grid"><section className="pnl-a-card pnl-performance-card"><header><div><h3>Cumulative realised P&amp;L</h3></div></header><PnlLineChart points={points} label="Cumulative realised P&L" baseline focus="largest" onSelect={onSelect} />
      {curve.undated > 0 && <p className="pnl-help">{curve.undated} undated legacy exits are in the totals, but excluded from dated charts.</p>}
      <div className="pnl-drawdown-heading"><div><ArrowDownRight size={18} /><b>Drawdown from prior peak</b></div><strong className="negative">Max {rupees(curve.maxDrawdown)}</strong></div><PnlLineChart points={drawdown} label="Closed-trade drawdown" negativeOnly onSelect={onSelect} />
      <div className="pnl-drawdown-detail"><span>Current decline <b>{rupees(curve.currentDrawdown)}</b></span>{curve.troughAt ? <span>{dateText(curve.worstPeakAt)} → {dateText(curve.troughAt)}<b>{curve.recoveredAt ? `Recovered ${dateText(curve.recoveredAt)}` : "That peak is not yet recovered"}</b></span> : <span>No closed-trade drawdown in this selection.</span>}</div>
    </section><PnlCalendar trades={calendarTrades} scope={scope} onScope={onScope} now={now} onSelect={onSelect} /></div>}
    {tab === "insights" && <PnlInsights trades={trades} orders={orders} journal={journal} onSelect={onSelect} />}
  </div>;
}
