"use client";
import { useMemo, useRef, useState } from "react";
import { ChevronDown, Search, X } from "lucide-react";
import type { Instrument } from "@/lib/market";
import type { ScreeningResult, ScreeningRunPayload } from "@/lib/fundamental-screener";
import { resolveFundamentalInstrument } from "@/lib/fundamental-analysis";
import { PEER_METRICS, peerMetricSummary, peerValue, samePeerGroup } from "@/lib/peer-comparison";
import { StockLogo } from "./StockLogo";
import { ModernSelect } from "./ModernSelect";
import { AppDialog } from "./AppDialog";
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
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerTrigger = useRef<HTMLButtonElement>(null);
  const selectedIds = displayed.map(r => r.id);
  const options = peers.filter(r => (!passedOnly || r.gateStatus === "review") && `${r.name} ${r.nseCode} ${r.bseCode}`.toLowerCase().includes(search.toLowerCase()));
  const overview = ["roe", "roce", "pe", "peg", "debtEquity", "profit3", "sales3", "quarterProfitGrowth", "pledged"];
  const fields = PEER_METRICS.filter(f => metricGroup === "All metrics" || (metricGroup === "Overview" ? overview.includes(f.key) : f.group === metricGroup)).filter(f => !differences || new Set(displayed.map(r => peerValue(r, f))).size > 1);
  const toggle = (id: string) => { setIds(selectedIds.includes(id) ? selectedIds.filter(v => v !== id) : [...selectedIds, id].slice(0, 4)); };
  return <section className="research-peers" aria-label="Peer comparison desk">
    <div className="research-peer-controls research-peer-compact">
      <ModernSelect label="Industry & company type" ariaLabel="Compare industry" hideLabel value={groups.find(g => anchor && samePeerGroup(g, anchor))?.id ?? ""} choices={groups.map(g => ({ value: g.id, label: `${g.industry} · ${g.isFinancial ? "Financial" : "Non-financial"}` }))} onChange={value => { setGroupId(value); setIds(null); setSearch(""); }} />
        <button ref={pickerTrigger} type="button" className="research-peer-select-trigger" aria-label="Compare against peers" aria-haspopup="dialog" aria-expanded={pickerOpen} onClick={() => setPickerOpen(true)}><span>Compare peers <small>{displayed.length} / 4 selected</small></span><ChevronDown size={16} /></button>
        <ModernSelect label="Metrics" ariaLabel="Peer metric groups" hideLabel value={metricGroup} choices={["Overview", "Quality", "Valuation", "Growth", "Balance", "Financials", "Ownership", "All metrics"].map(value => ({ value, label: value }))} onChange={setMetricGroup} />
      <label className="research-check"><input type="checkbox" checked={differences} onChange={e => setDifferences(e.target.checked)} />Differences only</label>
    </div>
    {pickerOpen && <AppDialog className="research-peer-picker-dialog" label="Compare against peers" returnFocus={pickerTrigger} onClose={() => setPickerOpen(false)}>
      <header><div><h3>Compare against peers</h3><small>{displayed.length} / 4 selected · {peers.length} peers</small></div><button aria-label="Close peer choices" onClick={() => setPickerOpen(false)}><X size={20} /></button></header>
      <div className="research-picker-tools"><label><Search size={16} /><input aria-label="Search peers" placeholder="Company or symbol" value={search} onChange={e => setSearch(e.target.value)} /></label><label className="research-check"><input type="checkbox" checked={passedOnly} onChange={e => setPassedOnly(e.target.checked)} />Passed gates only</label></div>
      <div className="research-peer-options">{options.slice(0, 100).map(r => <label key={r.id}><input type="checkbox" aria-label={`Compare ${r.name}`} checked={selectedIds.includes(r.id)} disabled={!selectedIds.includes(r.id) && displayed.length >= 4} onChange={() => toggle(r.id)} /><span><b>{r.nseCode || r.name}</b><small>{r.name} · {r.gateStatus === "review" ? "Passed gates" : "Failed gates"}</small></span></label>)}</div>
      {options.length > 100 && <small>Showing 100 matches. Refine the search to find more.</small>}{!options.length && <p>No companies match this search.</p>}
      <button className="research-peer-picker-done" onClick={() => setPickerOpen(false)}>Done</button>
    </AppDialog>}
    {anchor?.isFinancial && <p className="fa-hint">Financial businesses need sector-specific analysis. Debt, liquidity, ROCE and operating margin are shown as context without winner highlighting.</p>}
    {!displayed.length ? <div className="fa-empty"><h3>Build your comparison</h3><p>Select two to four companies above to compare their strengths and gaps.</p></div> : <div className="research-matrix-scroll" tabIndex={0} aria-label="Scrollable peer comparison"><table className="research-matrix"><thead><tr><th scope="col">Metric <small>{metricGroup}</small></th><th scope="col">Industry median<small>{peers.length} imported peers</small></th>{displayed.map(r => <th key={r.id} scope="col"><button type="button" className={`research-peer-symbol ${r.gateStatus === "review" ? "positive" : "negative"}`} aria-label={`Open ${r.nseCode || r.name} chart · ${r.gateStatus === "review" ? "Passed" : "Failed"} gates`} disabled={!resolveFundamentalInstrument(r, instruments)} onClick={() => onOpenChart(r)}><StockLogo symbol={r.nseCode || r.bseCode} instrumentKey={resolveFundamentalInstrument(r, instruments)?.instrumentKey} size={22} /><strong>{r.nseCode || r.name}</strong></button><button type="button" className="research-peer-inspect" aria-label={`Inspect ${r.name}`} onClick={() => onInspect(r.id)}>{r.name}</button></th>)}</tr></thead><tbody>
      {fields.map(f => { const summary = peerMetricSummary(peers, displayed, f); const base = summary.median; return <tr key={f.key}><th scope="row">{f.label}<small>{f.unit === "₹ Cr" ? "₹ crore · scale context" : f.direction && !(f.financialContext && anchor?.isFinancial) ? `${f.direction === "higher" ? "Higher" : "Lower"} comparison` : "Context metric"}</small></th><td><b>{fmt(summary.median, f.unit)}</b><small>n = {summary.count}</small></td>{displayed.map(r => { const v = peerValue(r, f), delta = v != null && base != null ? v - base : null, best = v != null && v === summary.best; return <td className={best ? "research-best" : ""} key={r.id}><b>{fmt(v, f.unit)}</b><small>{delta == null ? "Not comparable" : `${delta > 0 ? "+" : ""}${fmt(delta, f.unit === "%" ? " pp" : f.unit === "₹ Cr" ? " Cr" : "×")} vs median`}</small>{best && <span className="research-best-label">Best shown</span>}</td>; })}</tr>; })}
    </tbody></table>{!fields.length && <p className="fa-hint">No differing metrics in this view. Turn off “Differences only” or choose another metric group.</p>}</div>}
  </section>;
}
