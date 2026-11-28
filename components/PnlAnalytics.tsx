"use client";
import { createContext, useContext, useEffect, useId, useMemo, useState, type CSSProperties } from "react";
import { Activity, CalendarDays, ChartNoAxesCombined, ChevronLeft, ChevronRight, Info, SlidersHorizontal } from "lucide-react";
import type { ClosedPaperTrade } from "@/lib/trade-analytics";
import type { PaperOrder } from "@/lib/paper-trading";
import { readTradeJournal, type TradeJournalEntry } from "@/lib/trading-coach";
import { CLOUD_CHANGE_EVENT } from "@/lib/cloud-journal";
import { ModernSelect } from "./ModernSelect";
import { StockLogo } from "./StockLogo";
import { isGlobalPnlTrade, openPnlSummary, pnlHistoryReady, pnlReportingTrades, PNL_REPORTING_USD_INR, type OpenPnlMark } from "@/lib/pnl-reporting";
import { PNL_BREAKDOWN_KEY, readPreference, writePreference } from "@/lib/interface-preferences";
import { DEFAULT_PNL_SCOPE, PNL_DIMENSIONS, groupPnl, pnlBounds, pnlCurve, pnlDay, pnlDistribution, pnlOutcome, pnlSessions, rollingPnl, summarisePnl, type PnlDimension, type PnlScope } from "@/lib/pnl-analytics";

export type PnlTab = "overview" | "insights" | "trades";
export type PnlCurrency = "INR" | "USD";
function createMoneyFormat(currency: PnlCurrency) {
  const symbol = currency === "USD" ? "$" : "₹";
  const locale = currency === "USD" ? "en-US" : "en-IN";
  const amount = new Intl.NumberFormat(locale, {minimumFractionDigits: 2, maximumFractionDigits: 2});
  const plain = new Intl.NumberFormat(locale, {maximumFractionDigits: 2});
  const short = new Intl.NumberFormat(locale, {notation: "compact", maximumFractionDigits: 1});
  const rupees = (n: number | null) => n === null || !Number.isFinite(n) ? "—" : `${pnlOutcome(n) === "loss" ? "−" : ""}${symbol}${amount.format(Math.abs(n))}`;
  const compact = (n: number) => `${pnlOutcome(n) === "loss" ? "−" : ""}${symbol}${Math.abs(n) < 1000 ? plain.format(Math.abs(n)) : short.format(Math.abs(n))}`;
  return { rupees, compact, symbol };
}
const moneyFormats = {INR: createMoneyFormat("INR"), USD: createMoneyFormat("USD")};
const moneyFor = (currency: PnlCurrency) => moneyFormats[currency];
const PnlMoneyContext = createContext(moneyFor("INR"));
function usePnlMoney() { return useContext(PnlMoneyContext); }
function readBreakdown() {
  const saved = readPreference(PNL_BREAKDOWN_KEY) as { dimension?: PnlDimension; measure?: string } | null;
  return { dimension: saved && PNL_DIMENSIONS.includes(saved.dimension!) ? saved.dimension! : "Symbol" as PnlDimension, measure: saved?.measure === "average" ? "average" as const : "total" as const };
}
const shortDate = new Intl.DateTimeFormat("en-IN", {timeZone: "Asia/Kolkata", day: "numeric", month: "short"});
const datedYear = new Intl.DateTimeFormat("en-IN", {timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric"});
const exitTime = new Intl.DateTimeFormat("en-GB", {timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit"});
const dateText = (time: number | null, withYear = false) => time ? (withYear ? datedYear : shortDate).format(time) : "Period start";
const signClass = (value: number) => pnlOutcome(value) === "profit" ? "positive" : pnlOutcome(value) === "loss" ? "negative" : "";
type Drill = (ids: string[], label: string) => void;
type Point = { time: number; value: number; ids: string[]; label?: string };

function PnlLineChart({ points, label, onSelect, baseline = false, negativeOnly = false, bars = false }: {
  points: Point[]; label: string; onSelect: Drill; baseline?: boolean; negativeOnly?: boolean; bars?: boolean;
}) {
  const uid = useId().replace(/:/g, "");
  const [selection, setSelection] = useState<string | null>(null);
  const { rupees, compact } = usePnlMoney();
  if (!points.length) return <div className="pnl-chart-empty">No dated exits in this period.</div>;
  const low = points.reduce((min, point) => Math.min(min, point.value), 0);
  const high = points.reduce((max, point) => Math.max(max, point.value), 0);
  const left = 53, right = 385, top = 14, bottom = 143;
  const y = (value: number) => high === low ? (bottom + top) / 2 : bottom - (value - low) / (high - low) * (bottom - top);
  const first = points[0].time, last = points[points.length - 1].time;
  const spansYears = pnlDay(first).slice(0, 4) !== pnlDay(last).slice(0, 4);
  const band = (right - left) / points.length, barWidth = Math.min(band * .68, 28);
  const x = (index: number) => {
    if (bars || first === last) return left + band * (index + .5);
    const inset = baseline ? 9 : 0;
    return left + inset + (points[index].time - first) / (last - first) * (right - left - inset);
  };
  const stored = selection === null ? -1 : points.findIndex(p => p.ids[0] === selection);
  const index = stored < 0 ? points.length - 1 : stored, active = points[index];
  const select = (i: number) => setSelection(points[Math.max(0, Math.min(points.length - 1, i))].ids[0]);
  const inspect = (event: React.PointerEvent<SVGSVGElement>) => {
    const svg = event.currentTarget, matrix = svg.getScreenCTM();
    if (!matrix) return;
    const point = svg.createSVGPoint();
    point.x = event.clientX; point.y = event.clientY;
    const target = point.matrixTransform(matrix.inverse()).x;
    let nearest = 0;
    for (let i = 1; i < points.length; i++) if (Math.abs(x(i) - target) < Math.abs(x(nearest) - target)) nearest = i;
    select(nearest);
  };
  const coords = points.map((p, i) => `${x(i)},${y(p.value)}`).join(" ");
  const line = (baseline ? `${left},${y(0)} ` : "") + coords;
  const ticks = [...new Set([high, high > 0 && low < 0 ? 0 : (low + high) / 2, low])];
  return <div className="pnl-line-chart">
    <svg viewBox="0 0 400 172" role="img" tabIndex={0} aria-label={`${label}. Tap or use arrow keys to inspect.`}
      onKeyDown={event => {
        const keys: Record<string, number> = { ArrowRight: index + 1, ArrowLeft: index - 1, Home: 0, End: points.length - 1 };
        if (event.key in keys) { event.preventDefault(); select(keys[event.key]); }
      }}
      onPointerDown={inspect} onPointerMove={event => { if (event.buttons === 1) inspect(event); }}>
      <defs>{["up", "down"].map(side => <clipPath key={side} id={`${uid}-${side}`}><rect x={left - 2} y={side === "up" ? 0 : y(0)} width={right - left + 4} height={side === "up" ? y(0) : bottom + 2 - y(0)}/></clipPath>)}</defs>
      {ticks.map(value => <g key={value}><line className={value === 0 ? "pnl-zero-line" : "pnl-gridline"} x1={left} x2={right} y1={y(value)} y2={y(value)}/><text x={left - 7} y={y(value) + 3.5} textAnchor="end">{compact(value)}</text></g>)}
      {bars ? points.map((p, i) => <rect key={p.time} x={x(i) - barWidth / 2} width={barWidth}
        y={Math.min(y(0), y(p.value)) - (p.value === 0 ? 1 : 0)} height={Math.max(2, Math.abs(y(p.value) - y(0)))} rx="1.5"
        fill={p.value < 0 ? "var(--red)" : p.value > 0 ? "var(--green)" : "var(--muted)"} opacity={index === i ? 1 : .74}/>) :
        high === low ? <polyline points={line} fill="none" stroke="var(--muted)" strokeWidth="2"/> : ["up", "down"].map(side => <g key={side} clipPath={`url(#${uid}-${side})`} style={{ color: negativeOnly || side === "down" ? "var(--red)" : "var(--green)" }}>
          <polygon points={`${baseline ? left : x(0)},${y(0)} ${line} ${x(points.length - 1)},${y(0)}`} fill="currentColor" opacity=".10"/>
          <polyline points={line} fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinejoin="round" vectorEffect="non-scaling-stroke"/>
        </g>)}
      <line x1={x(index)} x2={x(index)} y1={top} y2={bottom} className="pnl-inspect-line"/>
      <circle cx={x(index)} cy={y(active.value)} r="4.3" stroke="var(--surface)" strokeWidth="2" fill="var(--purple)"/>
      <text x={left} y="165">{dateText(first, spansYears)}</text>{pnlDay(last) !== pnlDay(first) && <text x={right} y="165" textAnchor="end">{dateText(last, spansYears)}</text>}
    </svg>
    <div className="pnl-chart-readout"><span>{dateText(active.time, spansYears)}{!bars && ` · ${exitTime.format(active.time)} IST`}<b className={signClass(active.value)}>{rupees(active.value)}</b></span>
      <button type="button" onClick={() => onSelect(active.ids, active.label ?? `${label} · ${dateText(active.time)}`)}>View {active.ids.length === 1 ? "trade" : `${active.ids.length} trades`}<ChevronRight size={15}/></button>
    </div>
  </div>;
}

export function PnlBreakdown({ trades, orders, journal, onSelect }: { trades: ClosedPaperTrade[]; orders: PaperOrder[]; journal: Record<string, TradeJournalEntry>; onSelect: Drill }) {
  const [dimension, setDimension] = useState<PnlDimension>(() => readBreakdown().dimension), [measure, setMeasure] = useState<"total" | "average">(() => readBreakdown().measure);
  const { rupees } = usePnlMoney();
  const groups = useMemo(() => groupPnl(trades, orders, journal, dimension).sort((a, b) => (measure === "total" ? b.net - a.net : (b.average ?? 0) - (a.average ?? 0))), [trades, orders, journal, dimension, measure]);
  const max = Math.max(1, ...groups.map(g => Math.abs(measure === "total" ? g.net : g.average ?? 0)));
  return <section className="pnl-a-card pnl-breakdown"><header><div><span className="pnl-kicker">Where results come from</span><h3>Performance breakdown</h3></div><SlidersHorizontal size={18} /></header>
    <div className="pnl-breakdown-controls"><ModernSelect label="Group by" value={dimension} choices={PNL_DIMENSIONS.map(d => ({ value: d, label: d }))} onChange={value => { setDimension(value); writePreference(PNL_BREAKDOWN_KEY, { dimension: value, measure }); }} /><ModernSelect label="Compare" value={measure} choices={[{ value: "total", label: "Total net P&L", description: "Combined result after charges" }, { value: "average", label: "Average per trade", description: "Net result divided by completed exits" }]} onChange={value => { setMeasure(value); writePreference(PNL_BREAKDOWN_KEY, { dimension, measure: value }); }} /></div>
    {dimension === "Entry time" && <p className="pnl-help">Entry time in IST. Delivery / carry-forward trades stay separate.</p>}
    <div className="pnl-ranked-list">{groups.map(g => { const value = measure === "total" ? g.net : g.average ?? 0; return <button className="pnl-ranked-row" key={g.label} onClick={() => onSelect(g.trades.map(t => t.id), `${dimension}: ${g.label}`)}><span className="pnl-ranked-heading"><b>{g.label}</b><strong className={signClass(value)}>{rupees(value)}</strong></span><span className="pnl-diverging-track"><i style={{ left: `${value >= 0 ? 50 : 50 - Math.abs(value) / max * 50}%`, width: `${Math.abs(value) / max * 50}%`, background: value >= 0 ? "var(--green)" : "var(--red)" }} /></span><small>{g.count} trade{g.count === 1 ? "" : "s"} · Avg {rupees(g.average)}{g.count >= 10 ? ` · ${g.winRate?.toFixed(0)}% wins` : ""}</small></button>; })}</div>
    {!groups.length && <p className="pnl-chart-empty">No trades match these filters.</p>}
    <p className="pnl-help">A group needs 10 exits before its win rate is shown. Position size changes the result.</p>
  </section>;
}

function PnlFindings({ trades, orders, onSelect }: { trades: ClosedPaperTrade[]; orders: PaperOrder[]; onSelect: Drill }) {
  const stats = useMemo(() => summarisePnl(trades), [trades]);
  const ordersById = useMemo(() => new Map(orders.map(order => [order.id, order])), [orders]);
  const auto = useMemo(() => trades.filter(trade => { const order = ordersById.get(trade.id); return Boolean(order?.autoSquareOff || order?.exitReason === "AUTO_SQUARE_OFF"); }), [trades, ordersById]);
  const flipped = useMemo(() => trades.filter(trade => trade.grossPnl > 0 && pnlOutcome(trade.netPnl) === "loss"), [trades]);
  const autoNet = auto.reduce((sum, trade) => sum + trade.netPnl, 0);
  const worstLoss = stats.worst && pnlOutcome(stats.worst.netPnl) === "loss" ? stats.worst : null;
  const worstShare = worstLoss && stats.netLosses ? -worstLoss.netPnl / stats.netLosses * 100 : null;
  const worstOrder = stats.worst ? [stats.worst.id, ...stats.worst.sourceOrderIds].map(id => ordersById.get(id)).find(order => order?.instrumentKey || order?.underlyingKey) : undefined;
  const { rupees } = usePnlMoney();
  if (!trades.length) return null;
  return <section className="pnl-a-card pnl-findings"><header><div><span className="pnl-kicker">What changed the result</span></div></header>
    <div className="pnl-finding-list">
      <button type="button" className="is-loss" disabled={!worstLoss} onClick={() => worstLoss && onSelect([worstLoss.id], "Largest loss")}>
        <span className="pnl-finding-copy"><small>Largest loss</small><span className="pnl-finding-symbol">{worstLoss && <StockLogo symbol={worstLoss.symbol} instrumentKey={worstOrder?.instrumentKey} underlyingKey={worstOrder?.underlyingKey} underlyingSymbol={worstOrder?.underlyingSymbol} assetType={worstOrder?.assetType} size={28} />}<b>{worstLoss?.symbol ?? "—"}</b></span></span>
        <span className="pnl-finding-figure"><strong className="negative">{rupees(worstLoss?.netPnl ?? null)}</strong><small>{worstShare === null ? "No losing trades" : `${worstShare.toFixed(0)}% of losing-trade P&L`}</small></span>
      </button>
      <button type="button" className="is-loss" disabled={!auto.length} onClick={() => auto.length && onSelect(auto.map(trade => trade.id), "Auto exits")}>
        <span className="pnl-finding-copy"><small>Auto exits</small><b>{auto.length ? `${auto.length} of ${trades.length} exits` : "None"}</b></span>
        <span className="pnl-finding-figure"><strong className={signClass(autoNet)}>{auto.length ? rupees(autoNet) : "—"}</strong><small>{auto.length ? "Closed at the session" : "No session auto-exit"}</small></span>
      </button>
      <div className="is-cost">
        <span className="pnl-finding-copy"><small>Charges</small><button type="button" className="pnl-finding-drill" disabled={!flipped.length} onClick={() => flipped.length && onSelect(flipped.map(trade => trade.id), "Winners flipped by charges")}>{flipped.length ? `${flipped.length} winner${flipped.length === 1 ? "" : "s"} flipped` : "No winner flipped"}</button></span>
        <span className="pnl-finding-figure"><strong>{rupees(stats.charges)}</strong><small>Already inside net P&L</small></span>
      </div>
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
  const { rupees, compact, symbol } = usePnlMoney();
  useEffect(() => setSelectedBin(null), [trades]);
  return <div className="pnl-insight-grid">
    <PnlFindings trades={trades} orders={orders} onSelect={onSelect} />
    <section className="pnl-a-card"><header><div><span className="pnl-kicker">Before costs → after costs</span><h3>How the {symbol === "$" ? "dollars" : "rupees"} add up</h3></div></header>
      <div className="pnl-flow">{steps.map(step => <button key={step.label} type="button" onClick={() => onSelect(step.ids, step.label)}><span className="pnl-flow-top"><b>{step.label}</b><strong className={step.tone === "cost" ? "pnl-cost" : signClass(step.change)}>{rupees(step.change)}</strong></span><span className="pnl-flow-track" aria-hidden="true"><i className={step.tone} style={{ width: `${Math.abs(step.change) / flowMax * 100}%` }} /></span></button>)}</div>
      <p className="pnl-help">{stats.costReversals ? `${stats.costReversals} gross winner${stats.costReversals === 1 ? "" : "s"} became a loss after charges.` : "Charges did not turn any winner into a loss."}</p>
    </section>
    <section className="pnl-a-card"><header><div><span className="pnl-kicker">Beyond your win rate</span><h3>Trade-result distribution</h3></div></header>
      <svg className="pnl-distribution" viewBox="0 0 400 188" role="img" aria-label="Number of completed trades in each net profit or loss range"><text x="32" y="14">Trade count · max {maxCount}</text>{distribution.bins.map((bin, i) => { const height = bin.trades.length / maxCount * 112; return <g key={i} role="button" tabIndex={0} aria-label={`${rupees(bin.from)} to ${rupees(bin.to)}: ${bin.trades.length} trades`} onClick={() => setSelectedBin(i)} onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelectedBin(i); } }}><rect x={33 + i * 43} y={146 - height} width="39" height={Math.max(2, height)} rx="3" fill={i < 4 ? "var(--red)" : "var(--green)"} opacity={selectedBin === i ? 1 : .55} /><text x={52 + i * 43} y={138 - height} textAnchor="middle">{bin.trades.length || ""}</text></g>; })}
        {[{ value: stats.averageWin, color: "var(--green)" }, { value: stats.averageLoss, color: "var(--red)" }, { value: stats.median, color: "var(--purple)" }].filter(m => m.value !== null).map((m, i) => <line key={i} x1={hx(m.value!)} x2={hx(m.value!)} y1="24" y2="148" stroke={m.color} strokeDasharray="3 4" />)}
        <text x="32" y="174">{compact(distribution.min)}</text><text x="204" y="174" textAnchor="middle">{symbol}0</text><text x="376" y="174" textAnchor="end">{compact(distribution.max)}</text>
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

function PnlCalendar({ sessions, scope, onScope, now, onSelect }: {
  sessions: ReturnType<typeof pnlSessions>; scope: PnlScope; onScope: (s: PnlScope) => void; now: number; onSelect: Drill;
}) {
  const bounds = pnlBounds(scope, now);
  const initial = (scope.day || bounds.end || sessions.at(-1)?.day || pnlDay(now)).slice(0, 7);
  const [month, setMonth] = useState(initial);
  useEffect(() => { setMonth(initial); }, [initial, scope.period, scope.start, scope.end]);
  const [year, number] = month.split("-").map(Number);
  const days = new Date(Date.UTC(year, number, 0)).getUTCDate(), first = (new Date(Date.UTC(year, number - 1, 1)).getUTCDay() + 6) % 7;
  const daily = new Map(sessions.filter(s => s.day.startsWith(month)).map(s => [s.day, s]));
  const max = [...daily.values()].reduce((value, s) => Math.max(value, Math.abs(s.net)), .01);
  const selectMonth = (value: string) => { if (/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) setMonth(value); };
  const adjacent = (delta: number) => new Date(Date.UTC(year, number - 1 + delta, 1)).toISOString().slice(0, 7);
  const selected = scope.day && scope.day.startsWith(month) ? scope.day : null;
  const selectedData = selected ? daily.get(selected) : undefined;
  const { rupees, compact } = usePnlMoney();
  return <section className="pnl-a-card pnl-calendar-card"><header><h3>Trading calendar</h3><div className="pnl-calendar-controls">
    <button aria-label="Previous P&L month" disabled={!!bounds.start && adjacent(-1) < bounds.start.slice(0, 7)} onClick={() => setMonth(adjacent(-1))}><ChevronLeft size={16}/></button>
    <input aria-label="Calendar month" type="month" value={month} min={bounds.start.slice(0, 7) || undefined} max={bounds.end.slice(0, 7) || undefined} onChange={e => selectMonth(e.target.value)}/>
    <button aria-label="Next P&L month" disabled={!!bounds.end && adjacent(1) > bounds.end.slice(0, 7)} onClick={() => setMonth(adjacent(1))}><ChevronRight size={16}/></button>
  </div></header>
    <div className="pnl-calendar-weekdays">{["M", "T", "W", "T", "F", "S", "S"].map((d, i) => <span key={i}>{d}</span>)}</div>
    <div className="pnl-calendar-grid">{Array.from({length: first}, (_, i) => <span key={`blank-${i}`}/>)}{Array.from({length: days}, (_, i) => {
      const key = `${month}-${String(i + 1).padStart(2, "0")}`, session = daily.get(key);
      const excluded = !bounds.valid || Boolean(bounds.start && key < bounds.start || bounds.end && key > bounds.end);
      return <button key={key} disabled={excluded} className={`pnl-calendar-day ${session ? pnlOutcome(session.net) : "no-trade"} ${scope.day === key ? "selected" : ""}`}
        aria-label={`${key}: ${session ? `${rupees(session.net)}, ${session.ids.length} trades` : "No trades"}`} aria-pressed={scope.day === key}
        style={{"--day-strength": session ? .12 + .48 * Math.abs(session.net) / max : 0} as CSSProperties} onClick={() => onScope({...scope, day: scope.day === key ? null : key})}>
        <b>{i + 1}</b><small>{session ? compact(session.net) : ""}</small></button>;
    })}</div>
    <p className="pnl-help pnl-calendar-legend"><span className="positive">Profit</span><span className="negative">Loss</span><span>Flat</span><span>Blank · no exits</span></p>
    {selected && <div className="pnl-day-detail"><span><b>{selected}</b>{selectedData ? `${selectedData.ids.length} exits · Fees ${rupees(selectedData.fees)}` : "No completed exits"}</span>
      {selectedData && <button onClick={() => onSelect(selectedData.ids, `Trades on ${selected}`)}>View trades<ChevronRight size={14}/></button>}</div>}
  </section>;
}

const periods = [
  { value: "today", label: "Today", short: "Today" },
  { value: "7d", label: "Last 7 days", short: "7 days" },
  { value: "30d", label: "Last 30 days", short: "30 days" },
  { value: "month", label: "This month", short: "Month" },
  { value: "all", label: "All time", short: "All time" },
] as const;
const marketChoices = [
  { value: "all", label: "All markets" }, { value: "india", label: "Indian", description: "All Indian paper trades · INR" },
  { value: "global", label: "Global", description: "Global paper trades · USD" }, { value: "stocks", label: "Stocks" }, { value: "fno", label: "F&O", description: "Indian futures and options, including MCX" },
] as const;
const productChoices = [{value: "all", label: "All products"}, {value: "INTRADAY", label: "Intraday"}, {value: "DELIVERY", label: "Delivery / carry"}] as const;
const chartLabels = { Cumulative: "Cumulative realised P&L", Daily: "Daily net P&L", Drawdown: "Closed-trade drawdown" };

function PnlPerformance({ trades, onSelect }: { trades: ClosedPaperTrade[]; onSelect: Drill }) {
  const [mode, setMode] = useState<keyof typeof chartLabels>("Cumulative");
  const curve = useMemo(() => pnlCurve(trades), [trades]);
  const points = useMemo<Point[]>(() => mode === "Daily"
    ? pnlSessions(trades).map(s => ({ time: s.time, value: s.net, ids: s.ids, label: `Trades on ${s.day}` }))
    : curve.points.map(p => ({ time: p.time, value: mode === "Drawdown" ? -p.drawdown : p.value, ids: [p.trade.id], label: `${p.trade.symbol} · ${dateText(p.time)}` })),
    [curve, mode, trades]);
  const { rupees } = usePnlMoney();
  return <section className="pnl-a-card pnl-performance-card">
    <header><h3>Performance</h3><span className="pnl-plot-unit">{mode === "Daily" ? "By trading day" : "By completed exit"}</span></header>
    <div className="pnl-chart-modes" role="group" aria-label="Performance chart">{(["Cumulative", "Daily", "Drawdown"] as const).map(item =>
      <button type="button" key={item} aria-pressed={mode === item} onClick={() => setMode(item)}>{item}</button>)}</div>
    <PnlLineChart key={mode} points={points} label={chartLabels[mode]} baseline={mode === "Cumulative"} bars={mode === "Daily"} negativeOnly={mode === "Drawdown"} onSelect={onSelect}/>
    {mode === "Drawdown" && <div className="pnl-risk-detail"><span>Maximum decline <b>{rupees(curve.maxDrawdown)}</b></span><span>Current decline <b>{rupees(curve.currentDrawdown)}</b></span>
      {curve.troughAt !== null && <small>{dateText(curve.worstPeakAt)} → {dateText(curve.troughAt)} · {curve.recoveredAt ? `Recovered ${dateText(curve.recoveredAt)}` : "Awaiting recovery"}</small>}</div>}
    {curve.undated > 0 && <p className="pnl-help">{curve.undated} undated {curve.undated === 1 ? "exit contributes" : "exits contribute"} to the total only.</p>}
  </section>;
}

function OpenPnl({ marks, scope }: { marks: OpenPnlMark[]; scope: PnlScope }) {
  const { positions, priced, total } = openPnlSummary(marks, scope);
  const { rupees } = usePnlMoney();
  if (!positions.length) return null;
  return <details className="pnl-open-now"><summary>
    <span><Activity size={17} aria-hidden="true"/><span><b>Open P&L now</b><small>{positions.length} open {positions.length === 1 ? "position" : "positions"} · before fees</small></span></span>
    <strong className={signClass(total ?? 0)}>{rupees(total)}</strong></summary>
    <ul>{positions.map(p => <li key={`${p.asset}-${p.symbol}-${p.product}`}><span>{p.symbol}<small>{p.product === "INTRADAY" ? "Intraday" : "Carry"}</small></span><b className={signClass(p.value ?? 0)}>{p.value === null ? "Quote unavailable" : moneyFor(p.asset === "global" ? "USD" : "INR").rupees(p.value)}</b></li>)}</ul>
    <p>{priced === positions.length ? "Marked at current quotes." : `Fresh quotes for ${priced} of ${positions.length} positions. The total needs every quote.`} Open marks are separate from realised results.</p>
  </details>;
}

export function PnlAnalytics({ trades: nativeTrades, calendarTrades: nativeCalendarTrades, orders, scope, onScope, tab, onTab, onSelect, now, currency = "INR", globalReady = true, indiaReady = true, openMarks = [] }: {
  globalReady?: boolean; indiaReady?: boolean; openMarks?: OpenPnlMark[]; trades: ClosedPaperTrade[]; calendarTrades: ClosedPaperTrade[]; orders: PaperOrder[];
  scope: PnlScope; onScope: (scope: PnlScope) => void; tab: PnlTab; onTab: (tab: PnlTab) => void; onSelect: Drill; now: number; currency?: PnlCurrency;
}) {
  const consolidated = scope.asset === "all";
  const ready = pnlHistoryReady(scope.asset, indiaReady, globalReady);
  const trades = useMemo(() => pnlReportingTrades(nativeTrades, consolidated), [nativeTrades, consolidated]);
  const calendar = useMemo(() => pnlSessions(pnlReportingTrades(nativeCalendarTrades, consolidated)), [nativeCalendarTrades, consolidated]);
  const stats = useMemo(() => summarisePnl(trades), [trades]);
  const indianStats = useMemo(() => summarisePnl(nativeTrades.filter(t => !isGlobalPnlTrade(t))), [nativeTrades]);
  const globalStats = useMemo(() => summarisePnl(nativeTrades.filter(isGlobalPnlTrade)), [nativeTrades]);
  const money = moneyFor(currency);
  const [journal, setJournal] = useState<Record<string, TradeJournalEntry>>({});
  useEffect(() => {
    const refresh = () => setJournal(readTradeJournal()); refresh();
    window.addEventListener(CLOUD_CHANGE_EVENT, refresh); window.addEventListener("storage", refresh);
    return () => { window.removeEventListener(CLOUD_CHANGE_EVENT, refresh); window.removeEventListener("storage", refresh); };
  }, []);
  const bounds = pnlBounds(scope, now), today = pnlDay(now), hasReport = ready && bounds.valid;
  const showOpen = hasReport && (!scope.day || scope.day === today) && (!bounds.start || bounds.start <= today && bounds.end >= today);
  const setScope = (patch: Partial<PnlScope>) => onScope({...scope, ...patch, day: null});
  const choosePeriod = (period: PnlScope["period"]) => setScope({period, ...(period === "custom" ? {start: scope.start || bounds.start || today.slice(0, 7) + "-01", end: scope.end || bounds.end || today} : {})});
  const displayDate = (str: string) => dateText(Date.parse(str + "T12:00:00+05:30"), str.slice(0, 4) !== today.slice(0, 4) || bounds.start.slice(0, 4) !== bounds.end.slice(0, 4));
  const range = scope.day ? displayDate(scope.day) : bounds.start && bounds.valid ? bounds.start === bounds.end ? displayDate(bounds.start) : `${displayDate(bounds.start)} – ${displayDate(bounds.end)}` : "All recorded dates";
  const filtered = scope.asset !== "all" || scope.product !== "all" || scope.period !== "all" || !!scope.day;
  const unit = consolidated ? "INR equivalent" : currency;
  return <PnlMoneyContext.Provider value={money}><div className="pnl-analytics pnl-report" data-view={tab}>
    <header className="pnl-review-heading"><h2>Profit &amp; loss</h2><div className="pnl-date-picker"><ModernSelect hideLabel label="Period" ariaLabel="P&L period" value={scope.period}
      choices={[...periods, { value: "custom", label: "Custom dates" }]} triggerLabel={<><CalendarDays size={15} aria-hidden="true"/>{scope.period === "custom" ? "Custom dates" : "Dates"}</>} onChange={choosePeriod}/></div></header>
    <div className="pnl-range-strip" role="group" aria-label="Reporting period">{periods.map(p => <button type="button" key={p.value} aria-pressed={scope.period === p.value} onClick={() => choosePeriod(p.value)}>{p.short}</button>)}</div>
    {scope.period === "custom" && <div className="pnl-custom-dates"><label>From<input type="date" value={scope.start} onChange={e => setScope({start: e.target.value})}/></label><label>Through<input type="date" value={scope.end} onChange={e => setScope({end: e.target.value})}/></label></div>}
    {!bounds.valid && <p role="alert" className="pnl-filter-error">Choose a valid date range with the end on or after the start.</p>}
    <section className="pnl-net-card" aria-label="Realised P&L totals">
      <div className="pnl-net-heading"><span><ChartNoAxesCombined size={17} aria-hidden="true"/>Net realised P&amp;L</span><span className="pnl-report-unit">{unit}</span></div>
      <strong data-testid="pnl-net" className="pnl-net-amount">{hasReport ? money.rupees(stats.net) : "—"}</strong>
      <div className="pnl-net-period">{bounds.valid ? range + " · IST" : "Check date range"}{scope.day && <button onClick={() => onScope({...scope, day: null})}>Show entire period</button>}</div>
      {tab === "overview" && <div className="pnl-net-components"><span>Gross P&amp;L<b>{hasReport ? money.rupees(stats.grossGains - stats.grossLosses) : "—"}</b></span>
        <span>Trading fees<b>{hasReport ? money.rupees(stats.charges) : "—"}</b></span>
        <button type="button" disabled={!hasReport || !stats.count} onClick={() => onSelect(trades.map(t => t.id), "Completed trades")}><span>Closed exits <ChevronRight size={12}/></span><b data-testid="pnl-count">{ready ? stats.count : "—"}</b></button>
      </div>}
    </section>
    <div className="pnl-report-filters"><ModernSelect hideLabel label="Market" ariaLabel="P&L market" value={scope.asset} choices={marketChoices} onChange={asset => setScope({asset})}/>
      <ModernSelect hideLabel label="Product" ariaLabel="P&L product" value={scope.product} choices={productChoices} onChange={product => setScope({product})}/></div>
    <nav className="pnl-view-tabs" role="tablist" aria-label="P&L views">{(["overview", "insights", "trades"] as const).map((value, i, tabs) => <button key={value} role="tab" tabIndex={tab === value ? 0 : -1} aria-selected={tab === value} onClick={() => onTab(value)}
      onKeyDown={e => { if (e.key === "ArrowRight" || e.key === "ArrowLeft") { e.preventDefault(); const next = (i + (e.key === "ArrowRight" ? 1 : 2)) % 3; onTab(tabs[next]); (e.currentTarget.parentElement?.children[next] as HTMLElement)?.focus(); } }}>{value[0].toUpperCase() + value.slice(1)}</button>)}</nav>
    {!ready && <p role="status" className="pnl-chart-empty">Loading paper trade history…</p>}
    {hasReport && tab !== "trades" && !stats.count && <div className="pnl-empty-result"><ChartNoAxesCombined size={23}/><h3>{filtered ? "No exits in this selection" : "No closed trades yet"}</h3><p>{filtered ? "Try a wider period or another market." : "Your realised result appears when a paper position is closed."}</p>{filtered && <button onClick={() => onScope({...DEFAULT_PNL_SCOPE})}>Reset filters</button>}</div>}
    {tab === "overview" && hasReport && <>
      {stats.count > 0 && <PnlPerformance trades={trades} onSelect={onSelect}/>}
      {showOpen && <OpenPnl marks={openMarks} scope={scope}/>}
      {stats.count > 0 && <section className="pnl-a-card pnl-outcomes"><header><h3>Trade outcomes</h3><span className="pnl-plot-unit">{stats.winRate?.toFixed(1)}% win rate</span></header>
        <div className="pnl-outcome-track" aria-hidden="true">{[stats.wins, stats.losses, stats.breakevens].map((count, i) => count > 0 && <i key={i} style={{flex:count}} className={["win","loss","flat"][i]}/>)}</div>
        <div className="pnl-outcome-links">{(["profit","loss","breakeven"] as const).map((outcome, i) => {
          const count = [stats.wins, stats.losses, stats.breakevens][i], title = ["Wins","Losses","Flat"][i];
          return <button key={outcome} type="button" disabled={!count} onClick={() => onSelect(trades.filter(t => pnlOutcome(t.netPnl) === outcome).map(t => t.id), title)}><span><i className={["win","loss","flat"][i]}/>{title}</span><b>{count}</b></button>;
        })}</div>
        <div className="pnl-outcome-stats"><span>Profit factor<b>{stats.profitFactor === null ? "—" : stats.profitFactor === Infinity ? "No losses" : stats.profitFactor.toFixed(2)}</b></span><span>Average per exit<b>{money.rupees(stats.average)}</b></span></div>
      </section>}
      {(calendar.length > 0 || scope.day) && <PnlCalendar sessions={calendar} scope={scope} onScope={onScope} now={now} onSelect={onSelect}/>}
    </>}
    {tab === "insights" && hasReport && stats.count > 0 && <PnlInsights trades={trades} orders={orders} journal={journal} onSelect={onSelect}/>}
    {tab === "overview" && hasReport && consolidated && stats.count > 0 && <section className="pnl-a-card pnl-market-split"><header><h3>By market</h3><span className="pnl-plot-unit">Native currency</span></header>
      {[{asset:"india" as const, name:"Indian", stats:indianStats, currency:"INR" as const}, {asset:"global" as const, name:"Global", stats:globalStats, currency:"USD" as const}].map(m => <button className="pnl-market-result" type="button" key={m.asset} onClick={() => setScope({asset:m.asset})}>
        <span><b>{m.name}</b><small>{m.stats.count} {m.stats.count === 1 ? "exit" : "exits"} · {m.currency}</small></span><strong data-testid={`pnl-${m.asset}-net`} className={signClass(m.stats.net)}>{moneyFor(m.currency).rupees(m.stats.net)}</strong><ChevronRight size={15}/></button>)}
    </section>}
    {tab !== "trades" && <details className="pnl-report-note"><summary><Info size={15}/> How P&amp;L is calculated</summary>
      <p>Each full or partial close is one exit. Net realised P&amp;L deducts allocated entry and exit fees. Open marks and funding payments are separate.</p>
      {consolidated && <p className="pnl-currency-note">Combined totals use the fixed app rate of ₹{PNL_REPORTING_USD_INR} per US dollar. Each trade retains its original currency.</p>}</details>}
  </div></PnlMoneyContext.Provider>;
}
