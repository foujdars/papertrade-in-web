"use client";
import { useEffect, useId, useMemo, useState, type CSSProperties } from "react";
import { ArrowDownRight, ChevronLeft, ChevronRight, SlidersHorizontal } from "lucide-react";
import type { ClosedPaperTrade } from "@/lib/trade-analytics";
import type { PaperOrder } from "@/lib/paper-trading";
import { readTradeJournal, type TradeJournalEntry } from "@/lib/trading-coach";
import { CLOUD_CHANGE_EVENT } from "@/lib/cloud-journal";
import { DEFAULT_PNL_SCOPE, PNL_DIMENSIONS, groupPnl, pnlBounds, pnlCurve, pnlDay, pnlDistribution, pnlOutcome, rollingPnl, summarisePnl, type PnlDimension, type PnlScope } from "@/lib/pnl-analytics";

export type PnlTab = "overview" | "insights" | "trades";
const rupees = (n: number | null) => n === null ? "—" : `${n < -.004 ? "−" : ""}₹${Math.abs(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const compact = (n: number) => `${n < 0 ? "−" : ""}₹${Math.abs(n) >= 100000 ? `${(Math.abs(n) / 100000).toFixed(1)}L` : Math.abs(n) >= 1000 ? `${(Math.abs(n) / 1000).toFixed(1)}k` : Math.abs(n).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const dateText = (time: number | null) => time ? new Date(time).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short" }) : "Period start";
const signClass = (value: number) => pnlOutcome(value) === "profit" ? "positive" : pnlOutcome(value) === "loss" ? "negative" : "";
type Drill = (ids: string[], label: string) => void;
type Point = { time: number; value: number; ids: string[]; label?: string };

function PnlLineChart({ points, label, onSelect, baseline = false, negativeOnly = false }: { points: Point[]; label: string; onSelect: Drill; baseline?: boolean; negativeOnly?: boolean }) {
  const uid = useId().replace(/:/g, ""), [selected, setSelected] = useState<number | null>(null);
  useEffect(() => setSelected(null), [points]);
  const left = 60, right = 388, top = 14, bottom = 157;
  const low = Math.min(0, ...points.map(p => p.value)), high = Math.max(0, ...points.map(p => p.value)), span = high - low || 1;
  const y = (value: number) => bottom - (value - low) / span * (bottom - top);
  const first = points[0]?.time ?? 0, last = points.at(-1)?.time ?? first;
  const x = (time: number) => left + (time - first) / (last - first || 1) * (right - left);
  const vertices = points.map(p => `${x(p.time)},${y(p.value)}`).join(" ");
  const path = `${baseline ? `${left},${y(0)} ` : ""}${vertices}`;
  const active = points[selected ?? points.length - 1];
  if (!points.length) return <div className="pnl-chart-empty">No dated completed trades in this period.</div>;
  return <div className="pnl-line-chart">
    <svg viewBox="0 0 400 191" role="img" tabIndex={0} aria-label={`${label}. Use left and right arrow keys to inspect trades.`} onKeyDown={event => { if (event.key === "ArrowRight" || event.key === "ArrowLeft") { event.preventDefault(); setSelected(i => Math.max(0, Math.min(points.length - 1, (i ?? points.length - 1) + (event.key === "ArrowRight" ? 1 : -1)))); } }} onPointerDown={event => { const bounds = event.currentTarget.getBoundingClientRect(), value = (event.clientX - bounds.left) / bounds.width * 400; let closest = 0; points.forEach((p, i) => { if (Math.abs(x(p.time) - value) < Math.abs(x(points[closest].time) - value)) closest = i; }); setSelected(closest); }}>
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
  const [dimension, setDimension] = useState<PnlDimension>("Symbol"), [measure, setMeasure] = useState<"total" | "average">("total");
  const groups = useMemo(() => groupPnl(trades, orders, journal, dimension).sort((a, b) => (measure === "total" ? b.net - a.net : (b.average ?? 0) - (a.average ?? 0))), [trades, orders, journal, dimension, measure]);
  const max = Math.max(1, ...groups.map(g => Math.abs(measure === "total" ? g.net : g.average ?? 0)));
  return <section className="pnl-a-card pnl-breakdown"><header><div><span className="pnl-kicker">Where results come from</span><h3>Performance breakdown</h3></div><SlidersHorizontal size={18} /></header>
    <div className="pnl-breakdown-controls"><label>Group by<select value={dimension} onChange={e => setDimension(e.target.value as PnlDimension)}>{PNL_DIMENSIONS.map(d => <option key={d}>{d}</option>)}</select></label><label>Compare<select value={measure} onChange={e => setMeasure(e.target.value as typeof measure)}><option value="total">Total net P&amp;L</option><option value="average">Average per trade</option></select></label></div>
    {dimension === "Entry time" && <p className="pnl-help">Entry time in IST. Delivery / carry-forward trades stay separate.</p>}
    <div className="pnl-ranked-list">{groups.map(g => { const value = measure === "total" ? g.net : g.average ?? 0; return <button className="pnl-ranked-row" key={g.label} onClick={() => onSelect(g.trades.map(t => t.id), `${dimension}: ${g.label}`)}><span className="pnl-ranked-heading"><b>{g.label}</b><strong className={signClass(value)}>{rupees(value)}</strong></span><span className="pnl-diverging-track"><i style={{ left: `${value >= 0 ? 50 : 50 - Math.abs(value) / max * 50}%`, width: `${Math.abs(value) / max * 50}%`, background: value >= 0 ? "var(--green)" : "var(--red)" }} /></span><small>{g.count} trade{g.count === 1 ? "" : "s"} · Avg {rupees(g.average)} · {g.count < 10 ? "Small sample" : `${g.winRate?.toFixed(0)}% wins`}</small></button>; })}</div>
    {!groups.length && <p className="pnl-chart-empty">No trades match these filters.</p>}
    <p className="pnl-help">Groups with fewer than 10 exits are flagged—not reliable rankings. Position size affects ₹ results.</p>
  </section>;
}

function PnlInsights({ trades, orders, journal, onSelect }: { trades: ClosedPaperTrade[]; orders: PaperOrder[]; journal: Record<string, TradeJournalEntry>; onSelect: Drill }) {
  const stats = useMemo(() => summarisePnl(trades), [trades]), distribution = useMemo(() => pnlDistribution(trades), [trades]);
  const rolling = useMemo(() => rollingPnl(trades).map(p => ({ time: p.time, value: p.value, ids: p.ids, label: `10-trade window ending ${dateText(p.time)}` })), [trades]);
  const gross = stats.grossGains - stats.grossLosses;
  const steps = [{ label: "Gains", from: 0, to: stats.grossGains, change: stats.grossGains, ids: trades.filter(t => t.grossPnl > 0).map(t => t.id) }, { label: "Losses", from: stats.grossGains, to: gross, change: -stats.grossLosses, ids: trades.filter(t => t.grossPnl < 0).map(t => t.id) }, { label: "Charges", from: gross, to: gross - stats.charges, change: -stats.charges, ids: trades.map(t => t.id) }, { label: "Net", from: 0, to: stats.net, change: stats.net, ids: trades.map(t => t.id) }];
  const low = Math.min(0, ...steps.flatMap(s => [s.from, s.to])), high = Math.max(0, ...steps.flatMap(s => [s.from, s.to])), y = (v: number) => 146 - (v - low) / (high - low || 1) * 108;
  const maxCount = Math.max(1, ...distribution.bins.map(b => b.trades.length)), hx = (v: number) => 32 + (v - distribution.min) / (distribution.max - distribution.min) * 344;
  const [selectedBin, setSelectedBin] = useState<number | null>(null);
  useEffect(() => setSelectedBin(null), [trades]);
  return <div className="pnl-insight-grid">
    <section className="pnl-a-card"><header><div><span className="pnl-kicker">Before costs → after costs</span><h3>Profit-to-net waterfall</h3></div></header>
      <svg className="pnl-waterfall" viewBox="0 0 400 182" role="img" aria-label="Gross gains minus gross losses and charges equals net P&L"><line x1="18" x2="388" y1={y(0)} y2={y(0)} className="pnl-zero-line" />{steps.map((s, i) => <g key={s.label} role="button" tabIndex={0} aria-label={`${s.label}: ${rupees(s.change)}, view trades`} onClick={() => onSelect(s.ids, s.label)} onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(s.ids, s.label); } }}><rect x={32 + i * 92} y={Math.min(y(s.from), y(s.to))} width="52" height={Math.max(2, Math.abs(y(s.from) - y(s.to)))} rx="4" fill={s.label === "Charges" ? "var(--purple)" : s.change >= 0 ? "var(--green)" : "var(--red)"} opacity=".8" /><text x={58 + i * 92} y={Math.max(15, Math.min(y(s.from), y(s.to)) - 8)} textAnchor="middle">{compact(s.change)}</text><text x={58 + i * 92} y="173" textAnchor="middle">{s.label}</text>{i < 2 && <line x1={84 + i * 92} x2={124 + i * 92} y1={y(s.to)} y2={y(s.to)} className="pnl-inspect-line" />}</g>)}</svg>
      <div className="pnl-waterfall-values">{steps.map(s => <button key={s.label} onClick={() => onSelect(s.ids, s.label)}><span>{s.label}</span><b className={s.label === "Charges" ? "" : signClass(s.change)}>{rupees(s.change)}</b></button>)}</div>
      <p className="pnl-help">{stats.costReversals} gross winner{stats.costReversals === 1 ? "" : "s"} became a loss after charges. Costs are deducted once.</p>
    </section>
    <section className="pnl-a-card"><header><div><span className="pnl-kicker">Beyond your win rate</span><h3>Trade-result distribution</h3></div></header>
      <svg className="pnl-distribution" viewBox="0 0 400 188" role="img" aria-label="Number of completed trades in each net profit or loss range"><text x="32" y="14">Trade count · max {maxCount}</text>{distribution.bins.map((bin, i) => { const height = bin.trades.length / maxCount * 112; return <g key={i} role="button" tabIndex={0} aria-label={`${rupees(bin.from)} to ${rupees(bin.to)}: ${bin.trades.length} trades`} onClick={() => setSelectedBin(i)} onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelectedBin(i); } }}><rect x={33 + i * 43} y={146 - height} width="39" height={Math.max(2, height)} rx="3" fill={i < 4 ? "var(--red)" : "var(--green)"} opacity={selectedBin === i ? 1 : .55} /><text x={52 + i * 43} y={138 - height} textAnchor="middle">{bin.trades.length || ""}</text></g>; })}
        {[{ value: stats.averageWin, color: "var(--green)" }, { value: stats.averageLoss, color: "var(--red)" }, { value: stats.median, color: "var(--purple)" }].filter(m => m.value !== null).map((m, i) => <line key={i} x1={hx(m.value!)} x2={hx(m.value!)} y1="24" y2="148" stroke={m.color} strokeDasharray="3 4" />)}
        <text x="32" y="174">{compact(distribution.min)}</text><text x="204" y="174" textAnchor="middle">₹0</text><text x="376" y="174" textAnchor="end">{compact(distribution.max)}</text>
      </svg>
      {selectedBin !== null && <div className="pnl-chart-readout"><span>{rupees(distribution.bins[selectedBin].from)} to {rupees(distribution.bins[selectedBin].to)}</span><button onClick={() => onSelect(distribution.bins[selectedBin].trades.map(t => t.id), "Selected result range")}>View {distribution.bins[selectedBin].trades.length} trades</button></div>}
      <div className="pnl-distribution-markers"><span className="positive">Avg win <b>{rupees(stats.averageWin)}</b></span><span className="negative">Avg loss <b>{rupees(stats.averageLoss)}</b></span><span>Median <b>{rupees(stats.median)}</b></span></div>
      <div className="pnl-extreme-links">{[["Best", stats.best], ["Worst", stats.worst]].map(([title, trade]) => { const t = trade as ClosedPaperTrade | null; return <button key={title as string} disabled={!t} onClick={() => t && onSelect([t.id], `${title} trade`)}><span>{title as string}</span><b className={signClass(t?.netPnl ?? 0)}>{rupees(t?.netPnl ?? null)}</b><ChevronRight size={13} /></button>; })}</div>
      <p className="pnl-help">{stats.breakevens} breakeven exits included at zero. Tap a bar to inspect its range.</p>
    </section>
    <PnlBreakdown trades={trades} orders={orders} journal={journal} onSelect={onSelect} />
    <section className="pnl-a-card"><header><div><span className="pnl-kicker">Recent consistency</span><h3>Average of the last 10 trades</h3></div></header>{rolling.length ? <PnlLineChart points={rolling} label="Rolling 10-trade net average" onSelect={onSelect} /> : <div className="pnl-chart-empty">Needs 10 dated completed trades. {pnlCurve(trades).points.length} available in this selection.</div>}<p className="pnl-help">Each point includes 10 exits. Windows overlap; this is historical performance, not a forecast.</p></section>
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
  return <section className="pnl-a-card pnl-calendar-card"><header><div><span className="pnl-kicker">Daily P&amp;L heat map</span><h3>Calendar</h3></div><div className="pnl-calendar-controls"><button aria-label="Previous P&L month" onClick={() => move(-1)}><ChevronLeft size={16} /></button><input aria-label="Calendar month" type="month" value={month} onChange={e => selectMonth(e.target.value)} /><button aria-label="Next P&L month" onClick={() => move(1)}><ChevronRight size={16} /></button></div></header>
    <div className="pnl-calendar-weekdays">{["M", "T", "W", "T", "F", "S", "S"].map((d, i) => <span key={i}>{d}</span>)}</div>
    <div className="pnl-calendar-grid">{Array.from({ length: first }, (_, i) => <span key={`blank-${i}`} />)}{Array.from({ length: days }, (_, i) => { const key = `${month}-${String(i + 1).padStart(2, "0")}`, items = daily.get(key), net = items ? summarisePnl(items).net : 0, outcome = items ? pnlOutcome(net) : "no-trade"; const excluded = !bounds.valid || Boolean(bounds.start && key < bounds.start || bounds.end && key > bounds.end); return <button key={key} disabled={excluded} className={`pnl-calendar-day ${outcome} ${scope.day === key ? "selected" : ""}`} aria-label={`${key}: ${items ? `${rupees(net)}, ${items.length} trades` : "No trades"}`} aria-pressed={scope.day === key} style={{ "--day-strength": items ? .12 + .48 * Math.abs(net) / max : 0 } as CSSProperties} onClick={() => onScope({ ...scope, day: scope.day === key ? null : key })}><b>{i + 1}</b><small>{items ? compact(net) : ""}</small></button>; })}</div>
    <p className="pnl-help pnl-calendar-legend"><span className="positive">Profit</span><span className="negative">Loss</span><span>Breakeven ₹0</span><span>Blank = no trades</span></p>
    {selected && <div className="pnl-day-detail"><span><b>{scope.day}</b>{selected.length} exits · Net {rupees(summarisePnl(selected).net)} · Charges {rupees(summarisePnl(selected).charges)}</span><button onClick={() => onSelect(selected.map(t => t.id), `Trades on ${scope.day}`)}>View trades<ChevronRight size={14} /></button></div>}
    <p className="pnl-help">Darker cells mean larger results within this month. Selecting a day filters every view.</p>
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
    <header className="pnl-a-heading"><div><span className="pnl-kicker">Review. Understand. Improve.</span><h2>Your performance</h2></div><span className="pnl-realised-badge">Realised · after charges</span></header>
    <div className="pnl-scope-controls"><label>Period<select aria-label="P&L period" value={scope.period} onChange={e => setScope({ period: e.target.value as PnlScope["period"], start: scope.start || `${pnlDay(now).slice(0, 7)}-01`, end: scope.end || pnlDay(now) })}><option value="all">All time</option><option value="month">This month</option><option value="30d">Last 30 days</option><option value="custom">Custom dates</option></select></label><label>Market<select aria-label="P&L market" value={scope.asset} onChange={e => setScope({ asset: e.target.value as PnlScope["asset"] })}><option value="all">All markets</option><option value="stocks">Stocks</option><option value="fno">F&amp;O</option></select></label><label>Product<select aria-label="P&L product" value={scope.product} onChange={e => setScope({ product: e.target.value as PnlScope["product"] })}><option value="all">All products</option><option value="INTRADAY">Intraday</option><option value="DELIVERY">Delivery / carry</option></select></label></div>
    {scope.period === "custom" && <div className="pnl-custom-dates"><label>From<input type="date" value={scope.start} onChange={e => setScope({ start: e.target.value })} /></label><label>Through<input type="date" value={scope.end} onChange={e => setScope({ end: e.target.value })} /></label></div>}
    {!bounds.valid && <p role="alert" className="pnl-filter-error">Choose a valid start and end date. The end date must not precede the start.</p>}
    <div className="pnl-scope-caption"><span>{scope.day ? `Day: ${scope.day}` : scope.period === "all" ? "All recorded dates" : `${bounds.start} → ${bounds.end}`} · IST</span><button onClick={() => onScope({ ...DEFAULT_PNL_SCOPE })}>Reset filters</button></div>
    <nav className="pnl-view-tabs" role="tablist" aria-label="P&L views">{(["overview", "insights", "trades"] as const).map((value, i, tabs) => <button key={value} role="tab" tabIndex={tab === value ? 0 : -1} aria-selected={tab === value} onClick={() => onTab(value)} onKeyDown={e => { if (e.key === "ArrowRight" || e.key === "ArrowLeft") { e.preventDefault(); const next = (i + (e.key === "ArrowRight" ? 1 : 2)) % 3; onTab(tabs[next]); (e.currentTarget.parentElement?.children[next] as HTMLElement)?.focus(); } }}>{value[0].toUpperCase() + value.slice(1)}</button>)}</nav>
    {tab !== "trades" && <><div className="pnl-summary-six">
      <div><span>Net P&amp;L</span><b data-testid="pnl-net" className={signClass(stats.net)}>{rupees(stats.net)}</b><small>Completed exits only</small></div>
      <button onClick={() => onSelect(allIds, "Completed trades")}><span>Completed trades</span><b data-testid="pnl-count">{stats.count}</b><small>View exits <ChevronRight size={11} /></small></button>
      <div><span>Win rate</span><b>{stats.winRate === null ? "—" : `${stats.winRate.toFixed(1)}%`}</b><small>{stats.wins} W · {stats.losses} L · {stats.breakevens} flat</small></div>
      <div><span>Profit factor</span><b>{stats.profitFactor === null ? "—" : stats.profitFactor === Infinity ? "No losses" : stats.profitFactor.toFixed(2)}</b><small>Net winners ÷ net losses</small></div>
      <div><span>Average net P&amp;L / trade</span><b className={signClass(stats.average ?? 0)}>{rupees(stats.average)}</b><small>Historical, not predicted</small></div>
      <div><span>Charges</span><b>{rupees(stats.charges)}</b><small>Included in net P&amp;L</small></div>
    </div><p className="pnl-help">Completed exit records; partial exits count separately. No open-position P&amp;L or virtual deposits included.</p></>}
    {tab === "overview" && <div className="pnl-overview-grid"><section className="pnl-a-card pnl-performance-card"><header><div><span className="pnl-kicker">Your path through the period</span><h3>Cumulative realised P&amp;L</h3></div></header><PnlLineChart points={points} label="Cumulative realised P&L" baseline onSelect={onSelect} />
      {curve.undated > 0 && <p className="pnl-help">{curve.undated} undated legacy exits are in the totals, but excluded from dated charts.</p>}
      <div className="pnl-drawdown-heading"><div><ArrowDownRight size={18} /><b>Drawdown from prior peak</b></div><strong className="negative">Max {rupees(curve.maxDrawdown)}</strong></div><PnlLineChart points={drawdown} label="Closed-trade drawdown" negativeOnly onSelect={onSelect} />
      <div className="pnl-drawdown-detail"><span>Current decline <b>{rupees(curve.currentDrawdown)}</b></span>{curve.troughAt ? <span>{dateText(curve.worstPeakAt)} → {dateText(curve.troughAt)}<b>{curve.recoveredAt ? `Recovered ${dateText(curve.recoveredAt)}` : "That peak is not yet recovered"}</b></span> : <span>No closed-trade drawdown in this selection.</span>}</div><p className="pnl-help">Starts at ₹0 for this selection. Drawdown uses completed exits, not intratrade price swings.</p>
    </section><PnlCalendar trades={calendarTrades} scope={scope} onScope={onScope} now={now} onSelect={onSelect} /></div>}
    {tab === "insights" && <PnlInsights trades={trades} orders={orders} journal={journal} onSelect={onSelect} />}
  </div>;
}
