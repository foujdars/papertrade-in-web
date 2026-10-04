"use client";
import { useMemo, useState } from "react";
import { ArrowLeftRight, Search, X } from "lucide-react";
import type { Instrument } from "@/lib/market";
import type { ScreeningResult, ScreeningRunPayload } from "@/lib/fundamental-screener";
import { resolveFundamentalInstrument } from "@/lib/fundamental-analysis";
import { PEER_METRICS, peerMetricSummary, peerValue, samePeerGroup } from "@/lib/peer-comparison";
import { StockLogo } from "./StockLogo";
const fmt = (v: number | null, unit: string) => v == null ? "—" : `${v.toLocaleString("en-IN", { maximumFractionDigits: 2 })}${unit === "₹ Cr" ? "" : unit}`;
export function FundamentalPeers({ run, instruments, anchorId, onInspect, onOpenChart }: { run: ScreeningRunPayload; instruments: Instrument[]; anchorId: string; onInspect: (id: string) => void; onOpenChart: (result: ScreeningResult) => void }) {
  const groups = useMemo(() => [...new Map(run.results.map(r => [`${r.industry.trim().toLowerCase()}:${r.isFinancial}`, r])).values()].sort((a,b) => a.industry.localeCompare(b.industry)), [run]);
  const initial = run.results.find(r => r.id === anchorId) ?? groups[0];
  const [groupId, setGroupId] = useState(initial?.id ?? "");
  const anchor = run.results.find(r => r.id === groupId) ?? initial;
  const peers = useMemo(() => anchor ? run.results.filter(r => samePeerGroup(r, anchor)) : [], [run, anchor]);
  const [ids, setIds] = useState<string[] | null>(null);
  const displayed = ids === null ? [anchor, ...peers.filter(r => r.id !== anchor?.id)].filter((r): r is ScreeningResult => !!r).slice(0, 3) : ids.flatMap(id => peers.find(r => r.id === id) ?? []);
  const [search, setSearch] = useState("");
  const [passedOnly, setPassedOnly] = useState(false);
  const [metricGroup, setMetricGroup] = useState("Overview");
  const [differences, setDifferences] = useState(false);
  const [baseline, setBaseline] = useState("median");
  const comparison = displayed.find(r => r.id === baseline);
  const selectedIds = displayed.map(r => r.id);
  const options = peers.filter(r => (!passedOnly || r.gateStatus === "review") && `${r.name} ${r.nseCode} ${r.bseCode}`.toLowerCase().includes(search.toLowerCase()));
  const overview = ["roe", "roce", "pe", "peg", "debtEquity", "profit3", "sales3", "quarterProfitGrowth", "pledged"];
  const fields = PEER_METRICS.filter(f => metricGroup === "All metrics" || (metricGroup === "Overview" ? overview.includes(f.key) : f.group === metricGroup)).filter(f => !differences || new Set(displayed.map(r => peerValue(r, f))).size > 1);
  const toggle = (id: string) => { setIds(selectedIds.includes(id) ? selectedIds.filter(v => v !== id) : [...selectedIds, id].slice(0, 4)); if (baseline === id) setBaseline("median"); };
  return <section className="research-peers" aria-label="Peer comparison desk">
    <header className="research-section-head"><div><span className="eyebrow">SIDE BY SIDE</span><h3>See what separates the peers.</h3><p>Choose up to four companies. Compare values and their distance from the same-industry median.</p></div><ArrowLeftRight size={28} /></header>
    <div className="research-peer-controls"><label>Industry & company type<select aria-label="Compare industry" value={groups.find(g => anchor && samePeerGroup(g, anchor))?.id ?? ""} onChange={e => { setGroupId(e.target.value); setIds(null); setSearch(""); setBaseline("median"); }}>
      {groups.map(g => <option key={g.id} value={g.id}>{g.industry} · {g.isFinancial ? "Financial" : "Non-financial"}</option>)}</select></label><label>Compare against<select aria-label="Comparison baseline" value={comparison ? baseline : "median"} onChange={e => setBaseline(e.target.value)}><option value="median">Industry median</option>{displayed.map(r => <option value={r.id} key={r.id}>{r.nseCode || r.name}</option>)}</select></label>
      <label className="research-check"><input type="checkbox" checked={differences} onChange={e => setDifferences(e.target.checked)} />Differences only</label>
    </div>
    <div className="research-selection"><b>{displayed.length} / 4 selected</b>{displayed.map(r => <button key={r.id} onClick={() => toggle(r.id)} aria-label={`Remove ${r.name} from comparison`}>{r.nseCode || r.name}<X size={13} /></button>)}<button onClick={() => { setIds([]); setBaseline("median"); }}>Clear selection</button></div>
    <details className="research-picker" open={displayed.length < 2}><summary>Add or replace companies · {peers.length} peers</summary><div className="research-picker-tools"><label><Search size={16} /><input aria-label="Search peers" placeholder="Search company or symbol" value={search} onChange={e => setSearch(e.target.value)} /></label><label className="research-check"><input type="checkbox" checked={passedOnly} onChange={e => setPassedOnly(e.target.checked)} />Passed gates only</label></div><div className="research-peer-options">{options.slice(0, 100).map(r => <label key={r.id}><input type="checkbox" aria-label={`Compare ${r.name}`} checked={selectedIds.includes(r.id)} disabled={!selectedIds.includes(r.id) && displayed.length >= 4} onChange={() => toggle(r.id)} /><span><b>{r.nseCode || r.name}</b><small>{r.name} · {r.gateStatus === "review" ? "Passed gates" : "Failed gates"}</small></span></label>)}</div>{options.length > 100 && <small>Showing 100 matches. Refine the search to find more.</small>}{!options.length && <p>No companies match this search.</p>}</details>
    <nav className="research-chips" aria-label="Peer metric groups">{["Overview", "Quality", "Valuation", "Growth", "Balance", "Financials", "Ownership", "All metrics"].map(g => <button key={g} aria-pressed={metricGroup === g} onClick={() => setMetricGroup(g)}>{g}</button>)}</nav>
    <p className="research-caption">Median uses all {peers.length} imported peers in this industry and company type, including failed gates. Each metric shows its available sample size. <b>Best shown</b> compares selected companies only; missing or non-positive P/E and PEG are not scored. Percentage differences use percentage points (pp).</p>
    {anchor?.isFinancial && <p className="fa-hint">Financial businesses need sector-specific analysis. Debt, liquidity, ROCE and operating margin are shown as context without winner highlighting.</p>}
    {!displayed.length ? <div className="fa-empty"><h3>Build your comparison</h3><p>Select two to four companies above to compare their strengths and gaps.</p></div> : <div className="research-matrix-scroll" tabIndex={0} aria-label="Scrollable peer comparison"><table className="research-matrix"><thead><tr><th scope="col">Metric <small>{metricGroup}</small></th><th scope="col">Industry median<small>{peers.length} imported peers</small></th>{displayed.map(r => <th key={r.id} scope="col"><StockLogo symbol={r.nseCode || r.bseCode} instrumentKey={resolveFundamentalInstrument(r, instruments)?.instrumentKey} size={26} /><strong>{r.nseCode || r.name}</strong><small>{r.name}</small><span className={`fa-badge ${r.gateStatus}`}>{r.gateStatus === "review" ? "Passed" : "Failed"} gates</span><div className="research-mini-actions"><button onClick={() => onInspect(r.id)}>Inspect</button><button disabled={!resolveFundamentalInstrument(r, instruments)} onClick={() => onOpenChart(r)}>Chart</button></div></th>)}</tr></thead><tbody>
      {fields.map(f => { const summary = peerMetricSummary(peers, displayed, f); const base = comparison ? peerValue(comparison, f) : summary.median; return <tr key={f.key}><th scope="row">{f.label}<small>{f.unit === "₹ Cr" ? "₹ crore · scale context" : f.direction && !(f.financialContext && anchor?.isFinancial) ? `${f.direction === "higher" ? "Higher" : "Lower"} comparison` : "Context metric"}</small></th><td><b>{fmt(summary.median, f.unit)}</b><small>n = {summary.count}</small></td>{displayed.map(r => { const v = peerValue(r, f), delta = v != null && base != null ? v - base : null, best = v != null && v === summary.best; return <td className={best ? "research-best" : ""} key={r.id}><b>{fmt(v, f.unit)}</b><small>{delta == null ? "Not comparable" : `${delta > 0 ? "+" : ""}${fmt(delta, f.unit === "%" ? " pp" : f.unit === "₹ Cr" ? " Cr" : "×")} vs ${comparison ? comparison.nseCode || comparison.name : "median"}`}</small>{best && <span className="research-best-label">Best shown</span>}</td>; })}</tr>; })}
    </tbody></table>{!fields.length && <p className="fa-hint">No differing metrics in this view. Turn off “Differences only” or choose another metric group.</p>}</div>}
  </section>;
}
