"use client";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ArrowUpRight, Download, ScanLine, X } from "lucide-react";
import type { Candle, Instrument } from "@/lib/market";
import { formatInr } from "@/lib/market";
import type { ScreeningRunPayload } from "@/lib/fundamental-screener";
import { HORIZON_KEYS, STOCK_HORIZONS, analyseDiscovery, discoveryCandidates, rankDiscovery, researchCandles, researchTradePlan, type DiscoveryStock, type RankedDiscovery, type ResearchOrderDraft, type StockHorizon } from "@/lib/stock-discovery";
import { AppDialog } from "./AppDialog";
import { StockLogo } from "./StockLogo";
const pct = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;
type Failure = { name: string; reason: string };
export function TopStocks({ run, instruments, balance, onInspect, onCompare, onOpenChart, onSimulate }: { run: ScreeningRunPayload; instruments: Instrument[]; balance: number; onInspect: (id: string) => void; onCompare: (id: string) => void; onOpenChart: (instrument: Instrument) => void; onSimulate: (draft: ResearchOrderDraft) => void }) {
  const [horizon, setHorizon] = useState<StockHorizon>("3M");
  const [limit, setLimit] = useState(24);
  const [minTurnover, setMinTurnover] = useState(1);
  const [industryCap, setIndustryCap] = useState(3);
  const [trendOnly, setTrendOnly] = useState(true);
  const [stocks, setStocks] = useState<DiscoveryStock[]>([]);
  const [benchmark, setBenchmark] = useState<Candle[]>();
  const [benchmarkMessage, setBenchmarkMessage] = useState("");
  const [failures, setFailures] = useState<Failure[]>([]);
  const [state, setState] = useState<"idle" | "loading" | "ready">("idle");
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const [industry, setIndustry] = useState("all");
  const [simulation, setSimulation] = useState<RankedDiscovery | null>(null);
  const simulationTrigger = useRef<HTMLButtonElement>(null);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  const candidates = useMemo(() => discoveryCandidates(run.results, instruments, limit), [run, instruments, limit]);
  const currentStocks = useMemo(() => stocks.flatMap(s => { const candidate = candidates.selected.find(c => c.instrument.instrumentKey === s.instrument.instrumentKey); return candidate ? [{ ...s, result: candidate.result, fundamentals: candidate.fundamentals }] : []; }), [stocks, candidates]);
  const rankings = useMemo(() => Object.fromEntries(HORIZON_KEYS.map(h => [h, rankDiscovery(currentStocks, h, { minTurnover: Math.max(0, minTurnover) * 1e7, industryCap, trendOnly }, benchmark)])) as Record<StockHorizon, ReturnType<typeof rankDiscovery>>, [currentStocks, minTurnover, industryCap, trendOnly, benchmark]);
  const ranking = rankings[horizon];
  const appearances = (key: string) => HORIZON_KEYS.filter(h => rankings[h].picks.some(s => s.instrument.instrumentKey === key));
  const visible = ranking.picks.filter(s => (industry === "all" || s.result.industry === industry) && `${s.result.name} ${s.result.nseCode}`.toLowerCase().includes(search.toLowerCase()));
  const reasons = [...candidates.excluded, ...failures, ...ranking.excluded];
  const loadCandles = async (key: string, signal: AbortSignal) => {
    const response = await fetch(`/api/upstox/candles?instrumentKey=${encodeURIComponent(key)}&timeframe=1D&years=3&scope=historical&strict=1`, { cache: "no-store", signal: AbortSignal.any([signal, AbortSignal.timeout(25000)]) });
    const data = await response.json();
    if (!response.ok || !data.ok || data.instrumentKey !== key || data.timeframe !== "1D" || !Array.isArray(data.candles)) throw new Error(data.error?.message || "Daily history unavailable");
    return data.candles as Candle[];
  };
  async function scan() {
    controller.current?.abort();
    const task = new AbortController(); controller.current = task;
    setState("loading"); setProgress(0); setStocks([]); setFailures([]); setBenchmark(undefined); setMessage(""); setBenchmarkMessage(""); setIndustry("all");
    const results: DiscoveryStock[] = [], errors: Failure[] = [];
    // User-triggered scan, never a render-time clock read.
    const now = Date.now();
    const benchmarkRequest = loadCandles("NSE_INDEX|Nifty 50", task.signal).then(rows => ({ rows: researchCandles(rows, now), error: "" })).catch(() => ({ rows: undefined, error: "Nifty 50 unavailable · excess-return comparisons are omitted." }));
    for (let i = 0; i < candidates.selected.length; i += 3) {
      await Promise.all(candidates.selected.slice(i, i + 3).map(async candidate => {
        try { results.push(analyseDiscovery(candidate, await loadCandles(candidate.instrument.instrumentKey, task.signal), now)); }
        catch (e) { errors.push({ name: candidate.result.name, reason: e instanceof Error ? e.message : "History unavailable" }); }
      }));
      if (task.signal.aborted) return;
      setProgress(Math.min(i + 3, candidates.selected.length));
    }
    const index = await benchmarkRequest;
    if (task.signal.aborted) return;
    setStocks(results); setFailures(errors); setBenchmark(index.rows); setBenchmarkMessage(index.error); setState("ready");
    setMessage(`${results.length} of ${candidates.selected.length} candidates have usable price history. ${errors.length} unavailable. Rankings use the newest common price date among included stocks.`);
  }
  const cancel = () => { controller.current?.abort(); setState("idle"); setMessage("Scan cancelled. No orders were placed."); };
  function exportRanking() {
    const cell = (v: unknown) => { const s = String(v ?? ""); return `"${(/^[=+@-]/.test(s) ? "'" : "") + s.replace(/"/g, '""')}"`; };
    const rows = [["Horizon", "Rank", "Symbol", "Company", "Industry", "Score /100", "Price date", "Close INR", "Stop INR", "Momentum %", "Nifty excess pp", "Fundamentals /100", "Momentum /100", "Trend /100", "Risk /100", "Data coverage %"], ...HORIZON_KEYS.flatMap(h => rankings[h].picks.map((s, i) => [h, i + 1, s.instrument.symbol, s.result.name, s.result.industry, s.score.toFixed(2), s.asOf, s.entry, s.stop, s.momentum.toFixed(2), s.excess?.toFixed(2), s.fundamentals.total.toFixed(2), s.momentumScore.toFixed(2), s.trend.toFixed(2), s.riskScore.toFixed(2), s.fundamentals.coverage.toFixed(1)]))];
    const url = URL.createObjectURL(new Blob([rows.map(r => r.map(cell).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = `papertrade-top-stocks-${ranking.asOf ?? "scan"}.csv`; a.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <section className="research-discovery" aria-label="Top stocks discovery">
    <header className="research-section-head"><div><h3>Find your next setup</h3><p>Choose a horizon. Compare stocks. Practise a trade.</p></div><ScanLine size={32} /></header>
    <div className="research-discovery-overview"><div><b>{candidates.eligible}</b><span>eligible companies</span></div><div><b>{candidates.selected.length}</b><span>in the scan pool</span></div><div><b>{ranking.picks.length || "—"}</b><span>shortlisted · {horizon}</span></div><div><b>{ranking.asOf ?? "Not scanned"}</b><span>completed price session</span></div></div>
    <div className="research-scan-controls"><label>Candidate pool<select aria-label="Candidate pool" value={limit} disabled={state === "loading" || stocks.length > 0} onChange={e => setLimit(Number(e.target.value))}>{[12, 24, 48, 60].map(n => <option key={n} value={n}>{n} companies</option>)}</select></label><label>Median daily turnover<select aria-label="Minimum daily turnover" value={minTurnover} onChange={e => setMinTurnover(Number(e.target.value))}>{[0, 1, 5, 10].map(n => <option key={n} value={n}>{n === 0 ? "No minimum" : `At least ₹${n} Cr`}</option>)}</select></label><label>Per-industry limit<select aria-label="Per-industry limit" value={industryCap} onChange={e => setIndustryCap(Number(e.target.value))}>{[1, 2, 3, 5].map(n => <option key={n}>{n}</option>)}</select></label><label className="research-check"><input type="checkbox" checked={trendOnly} onChange={e => setTrendOnly(e.target.checked)} />Above 50-day average</label>
      <button className="research-primary" disabled={!candidates.selected.length || state === "loading"} onClick={scan}><ScanLine size={16} />{state === "loading" ? `Scanning ${progress}/${candidates.selected.length}` : stocks.length ? "Refresh prices & rank" : "Generate top stocks"}</button>{state === "loading" && <button onClick={cancel}>Cancel scan</button>}{stocks.length > 0 && <button onClick={() => { setStocks([]); setFailures([]); setBenchmark(undefined); setBenchmarkMessage(""); setState("idle"); setMessage(""); }}>Change pool</button>}
    </div>
    <details className="research-method research-scan-note"><summary>Scan coverage · {candidates.notScanned} eligible companies outside this pool</summary><p>Uses the app’s existing Upstox connection. No second token or subscription. The pool is preselected by fundamentals, with at most six companies per industry. Financial businesses stay in peer analysis until a sector-specific ranking model is available.</p></details>
    {state === "loading" && <progress className="research-progress" aria-label="Stock scan progress" value={progress} max={candidates.selected.length} />}
    {message && <p role="status" className="fa-message">{message}</p>}{benchmarkMessage && <p className="fa-hint">{benchmarkMessage}</p>}
    <nav className="research-horizons" aria-label="Top stocks horizon">{HORIZON_KEYS.map(h => <button aria-pressed={horizon === h} key={h} onClick={() => { setHorizon(h); setIndustry("all"); }}><b>{h}</b><span>{STOCK_HORIZONS[h].label}</span><small>{rankings[h].picks.length} stocks</small></button>)}</nav>
    <div className="research-method-strip">{["Fundamentals", "Momentum", "Trend", "Risk"].map((label, i) => <div key={label}><span>{label}</span><b>{STOCK_HORIZONS[horizon].weights[i]}%</b></div>)}</div>
    <details className="research-method"><summary>How the shortlist is built</summary><p>Passed gates, non-declined reviews and at least 70% scoring-data coverage enter the pool. Missing scoring inputs earn zero. Quality 35%, growth 30%, valuation 20% and balance 15% form the fundamental score. The legacy company rating is separate.</p><p>{horizon} momentum requires the full {STOCK_HORIZONS[horizon].sessions}-session lookback, ranked relative to this eligible pool. Trend checks price and moving averages; risk favours lower 20-session ATR. Stops use the larger of 5% or 2.5 ATR; candidates needing more than 10% are excluded. That is a stop distance, not a maximum loss guarantee.</p><p>Today’s daily candle is excluded until 15:35 IST. Histories over seven days old, large gaps, mismatched price dates and insufficient history are excluded. Nifty excess is stock return minus index return over the same session count, shown only when dates match. Corporate actions can distort unadjusted prices. These are current-data research ranks, not a historical backtest or return forecast.</p></details>
    {state === "ready" && <><h3 className="research-results-title">Your {horizon} shortlist <small>{visible.length} shown · {ranking.picks.length} ranked</small></h3><div className="research-ranking-tools"><label><SearchLabel /><input aria-label="Search top stocks" placeholder="Find a shortlisted company" value={search} onChange={e => setSearch(e.target.value)} /></label><select aria-label="Filter top stocks industry" value={industry} onChange={e => setIndustry(e.target.value)}><option value="all">All shortlisted industries</option>{[...new Set(ranking.picks.map(s => s.result.industry))].map(i => <option key={i}>{i}</option>)}</select><button disabled={!HORIZON_KEYS.some(h => rankings[h].picks.length)} onClick={exportRanking}><Download size={15} />Export all horizons</button></div>
      {visible.length ? <div className="research-top-scroll"><table className="research-top-table"><thead><tr><th>Rank / company</th><th>Score</th><th>Price / momentum</th><th>Risk & liquidity</th><th>Next step</th></tr></thead><tbody>{visible.map(s => { const shared = appearances(s.instrument.instrumentKey); return <tr key={s.instrument.instrumentKey}><td><div className="research-stock-title"><span className="research-rank">{String(ranking.picks.indexOf(s) + 1).padStart(2, "0")}</span><StockLogo symbol={s.instrument.symbol} instrumentKey={s.instrument.instrumentKey} size={32} /><div><b>{s.result.name}</b><small>{s.instrument.symbol} · {s.result.industry}</small></div></div><span className="research-overlap">{shared.join(" · ")} {shared.length > 1 ? "lists" : "list"}</span></td><td data-label="Score"><b className="research-score">{s.score.toFixed(1)}<small>/ 100</small></b><small>{s.fundamentals.coverage.toFixed(0)}% data coverage</small><details><summary>Why this rank?</summary><dl className="research-score-detail">{[["Fundamentals", s.fundamentals.total], ["Momentum", s.momentumScore], ["Trend", s.trend], ["Risk", s.riskScore]].map(([k,v]) => <div key={k}><dt>{k}</dt><dd>{Number(v).toFixed(1)}</dd></div>)}</dl><p>{s.momentum > 0 ? "Positive" : "Non-positive"} {horizon} price momentum. {s.trend.toFixed(0)}% of trend checks passed.</p></details></td><td data-label="Price / momentum"><b>{formatInr(s.entry)}</b><small>Close · {s.asOf}</small><span className={s.momentum >= 0 ? "positive" : "negative"}>{pct(s.momentum)} · {horizon}</span><small>Nifty excess: {s.excess == null ? "Unavailable" : `${s.excess >= 0 ? "+" : ""}${s.excess.toFixed(1)} pp`}</small></td><td data-label="Risk & liquidity"><b>Stop {formatInr(s.stop)}</b><small>{s.stopPercent.toFixed(1)}% distance · ATR {s.atrPercent.toFixed(2)}%</small><small>Median turnover ₹{(s.turnover / 1e7).toFixed(2)} Cr</small></td><td><div className="research-row-actions"><button className="research-primary" onClick={e => { simulationTrigger.current = e.currentTarget; setSimulation(s); }}>Simulate trade <ArrowUpRight size={13} /></button><button onClick={() => onCompare(s.result.id)}>Compare peers</button><button onClick={() => onOpenChart(s.instrument)}>Chart</button><button onClick={() => onInspect(s.result.id)}>Inspect</button></div></td></tr>; })}</tbody></table></div> : <div className="fa-empty"><h3>No stocks match this view</h3><p>Review exclusions below, try another horizon, or adjust the turnover and trend filters. No missing price data is filled in.</p></div>}
      <p className="research-caption">{ranking.eligible} price-qualified candidates · {ranking.diversificationOmissions} omitted by industry limits or the top-15 limit. Search filters the finished shortlist; it does not change ranks.</p>
    </>}
    {state === "idle" && <div className="fa-empty"><ScanLine size={28} /><h3>Start with your research universe</h3><p>Generate four horizon lists from the imported companies. No trade is placed during a scan.</p></div>}
    <details className="research-exclusions"><summary>Data checks & exclusions · {reasons.length}</summary><ul>{reasons.slice(0, 100).map((r, i) => <li key={`${r.name}:${i}`}><b>{r.name}</b><span>{r.reason}</span></li>)}</ul>{reasons.length > 100 && <small>Showing the first 100 exclusions.</small>}{!reasons.length && <p>No exclusions reported.</p>}</details>
    {simulation && <ResearchSimulation stock={simulation} balance={balance} returnFocus={simulationTrigger} onClose={() => setSimulation(null)} onSimulate={onSimulate} />}
  </section>;
}
function SearchLabel() { return <span aria-hidden="true">⌕</span>; }
function ResearchSimulation({ stock, balance, returnFocus, onClose, onSimulate }: { stock: RankedDiscovery; balance: number; returnFocus: React.RefObject<HTMLButtonElement | null>; onClose: () => void; onSimulate: (draft: ResearchOrderDraft) => void }) {
  const id = useId();
  const [budget, setBudget] = useState(Math.max(0, Math.min(25000, balance)));
  const [risk, setRisk] = useState(1000);
  const [reward, setReward] = useState(2);
  const [scenario, setScenario] = useState(5);
  let error = "", plan: ReturnType<typeof researchTradePlan> | undefined;
  try { plan = researchTradePlan(stock.entry, stock.stop, budget, risk, reward); if (!plan.quantity) error = "Increase capital or loss budget to cover one share and fees."; }
  catch (e) { error = e instanceof Error ? e.message : "Check your inputs."; }
  const scenarioPrice = stock.entry * (1 + scenario / 100);
  return <AppDialog labelledBy={id} className="research-simulation fundamental-workspace" returnFocus={returnFocus} onClose={onClose} avoidTouchKeyboard>
    <header className="research-simulation-head"><div><span className="eyebrow">PAPER TRADE · {stock.horizon}</span><h3 id={id}>{stock.result.name}</h3><small>Last close {formatInr(stock.entry)} · {stock.asOf}</small></div><button aria-label="Close trade simulation" onClick={onClose}><X size={20} /></button></header>
    <div className="research-simulation-body">
      <div className="research-simulation-cash"><span>Available cash</span><b>{formatInr(balance)}</b></div>
      <div className="research-simulation-inputs">
        <label>Capital (₹)<input aria-label="Simulation capital budget" inputMode="decimal" type="number" min="1" max="100000000" value={budget || ""} onChange={e => setBudget(Number(e.target.value))} /></label>
        <label>Loss budget (₹)<input aria-label="Simulation risk budget" inputMode="decimal" type="number" min="1" max="100000000" value={risk || ""} onChange={e => setRisk(Number(e.target.value))} /></label>
        <label className="research-reward-input">Reward / risk<input aria-label="Simulation reward multiple" inputMode="decimal" type="number" min=".5" max="10" step=".5" value={reward || ""} onChange={e => setReward(Number(e.target.value))} /></label>
      </div>
      {error && <p className="fa-message fa-error" role="alert">{error}</p>}
      {plan && !error && <>
        <dl className="research-simulation-summary">
          <div><dt>Shares</dt><dd>{plan.quantity}</dd></div><div><dt>Cost incl. fees</dt><dd>{formatInr(plan.cost)}</dd></div>
          <div><dt>Stop-loss</dt><dd>{formatInr(stock.stop)}</dd></div><div><dt>Target</dt><dd>{formatInr(plan.target)}</dd></div>
          <div className="research-loss"><dt>Loss at stop</dt><dd className="negative">−{formatInr(plan.stopLoss)}</dd></div><div className="research-profit"><dt>Profit at target</dt><dd className="positive">{formatInr(plan.targetProfit)}</dd></div>
        </dl>
        <div className="research-scenario"><label htmlFor={`${id}-scenario`}>Price move <b>{pct(scenario)}</b></label><input id={`${id}-scenario`} aria-label="Simulated price move" type="range" min="-20" max="30" step="1" value={scenario} onChange={e => setScenario(Number(e.target.value))} /><div><span>Exit {formatInr(scenarioPrice)}</span><b className={plan.pnlAt(scenarioPrice) >= 0 ? "positive" : "negative"}>{formatInr(plan.pnlAt(scenarioPrice))} net</b></div><small>What-if only · stops not applied</small></div>
      </>}
      <details className="research-simulation-notes"><summary>Simulation assumptions</summary><ul><li>Whole shares; estimated delivery fees included.</li><li>Final entry uses a fresh quote during market hours.</li><li>Price gaps can exceed the loss budget.</li><li>Price scenarios are not backtests or forecasts.</li></ul></details>
    </div>
    <footer className="research-simulation-footer"><button className="research-primary research-simulation-submit" disabled={!!error || !plan?.quantity} onClick={() => { if (plan?.quantity) onSimulate({ instrument: stock.instrument, quantity: plan.quantity, stop: stock.stop, target: plan.target, budget, riskBudget: risk, reference: stock.entry, asOf: stock.asOf, thesis: `Top Stocks ${stock.horizon} · score ${stock.score.toFixed(1)}/100 · ${stock.asOf} close ${stock.entry.toFixed(2)} · momentum ${pct(stock.momentum)} · ${stock.result.industry}. Review live entry and company risks.` }); }}>Review paper order <ArrowUpRight size={16} /></button><small>No order placed until you confirm.</small></footer>
  </AppDialog>;
}
