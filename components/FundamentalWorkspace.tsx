"use client";

import { useDeferredValue, useEffect, useId, useMemo, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from "react";
import { BookOpenCheck, Download, LineChart, PanelLeft, Search, Upload, X } from "lucide-react";
import type { Instrument } from "@/lib/market";
import { recommendedColumns, screenerCompanyUrl, type Decision, type ScreeningResult, type ScreeningRunPayload } from "@/lib/fundamental-screener";
import { companyJsonTemplate, evaluateCompanyJson, metricMedian, peerFields, rateFundamentalCompany, resolveFundamentalInstrument } from "@/lib/fundamental-analysis";
import { loadLatestLocalRun, saveLocalRun, updateLocalDecision } from "@/lib/fundamental-store";
import { StockLogo } from "./StockLogo";
import { useTransientBack } from "./useTransientBack";
import "./fundamental-workspace.css";

type Props = { ownerId: string; instruments: Instrument[]; onClose: () => void; onOpenChart: (instrument: Instrument) => void };
type View = "screen" | "rank" | "peers" | "rate";
const VIEWS: { id: View; label: string }[] = [{ id: "screen", label: "Screener" }, { id: "rank", label: "Rankings" }, { id: "peers", label: "Peer comparison" }, { id: "rate", label: "Company rating" }];
// Presentation groups reuse the existing field labels, values and units unchanged.
const METRIC_GROUPS = [
  { title: "Profitability & valuation", keys: ["roe", "roce", "opm", "pe", "peg"] },
  { title: "Balance & ownership", keys: ["debtEquity", "currentRatio", "quickRatio", "promoter", "pledged", "fii", "dii"] },
  { title: "Sales & growth", keys: ["quarterSales", "quarterSalesGrowth", "ttmSales", "priorYearSales", "sales3"] },
  { title: "Profit & growth", keys: ["quarterProfit", "quarterProfitGrowth", "ttmProfit", "priorYearProfit", "profit3"] },
].map(group => ({ title: group.title, fields: group.keys.map(key => peerFields.find(field => field.key === key)!) }));
const PAGE_SIZE = 50;
const number = (value: number | null, suffix = "") => value == null ? "Missing" : `${value.toLocaleString("en-IN", { maximumFractionDigits: 2 })}${suffix}`;
const date = (value: string) => new Date(value).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });

function downloadFile(content: string, fileName: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a"); link.href = url; link.download = fileName; link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function FundamentalWorkspace({ ownerId, instruments, onClose, onOpenChart }: Props) {
  const [view, setView] = useState<View>("screen");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const stockTrigger = useRef<HTMLButtonElement>(null);
  const drawerId = useId();
  const [run, setRun] = useState<ScreeningRunPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [search, setSearch] = useState("");
  const term = useDeferredValue(search.trim().toLowerCase());
  const [status, setStatus] = useState("all");
  const [industry, setIndustry] = useState("all");
  const [page, setPage] = useState(0);
  const [dataAsOf, setDataAsOf] = useState("");
  const worker = useRef<Worker | null>(null);
  const importing = useRef(false);

  useEffect(() => {
    let active = true;
    loadLatestLocalRun(ownerId).then(saved => {
      if (!active) return;
      setRun(saved); setSelectedId(saved?.results[0]?.id ?? ""); setDataAsOf(saved?.dataAsOf ?? "");
    }).catch(() => { if (active) setNotice("Saved research could not be loaded. You can import a CSV and export a backup."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; worker.current?.terminate(); worker.current = null; };
  }, [ownerId]);

  const industries = useMemo(() => [...new Set(run?.results.map(result => result.industry) ?? [])].sort(), [run]);
  const scored = useMemo(() => (run?.results ?? []).map(result => ({ result, rating: rateFundamentalCompany(result) })), [run]);
  const filtered = useMemo(() => scored.filter(({ result }) =>
    (!term || `${result.name} ${result.nseCode} ${result.bseCode} ${result.industry}`.toLowerCase().includes(term)) &&
    (industry === "all" || result.industry === industry) &&
    (status === "all" || (status === "review" || status === "rejected" ? result.gateStatus === status : result.decision === status)) &&
    (view !== "rank" || result.gateStatus === "review")
  ).sort((a, b) => view === "rank" ? b.rating.overall - a.rating.overall : a.result.name.localeCompare(b.result.name)), [scored, term, industry, status, view]);
  const lastPage = Math.max(0, Math.ceil(filtered.length / PAGE_SIZE) - 1);
  const safePage = Math.min(page, lastPage);
  const shown = filtered.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);
  const selected = run?.results.find(result => result.id === selectedId) ?? null;
  const passing = run?.results.filter(result => result.gateStatus === "review").length ?? 0;

  async function importCsv(file: File) {
    if (importing.current || loading) return;
    setError(""); setNotice("");
    if (!file.name.toLowerCase().endsWith(".csv")) { setError("Select a Screener CSV export."); return; }
    if (file.size > 100 * 1024 * 1024) { setError("The CSV limit is 100 MB. Split larger exports into smaller files."); return; }
    importing.current = true; setBusy(true);
    try {
      const payload = await new Promise<ScreeningRunPayload>((resolve, reject) => {
        const current = new Worker(new URL("../lib/fundamental-screener.worker.ts", import.meta.url), { type: "module" });
        worker.current = current;
        current.onmessage = (event: MessageEvent<{ payload?: ScreeningRunPayload; error?: string }>) => {
          current.terminate(); worker.current = null;
          if (event.data.error || !event.data.payload) reject(new Error(event.data.error || "Could not evaluate this CSV."));
          else resolve(event.data.payload);
        };
        current.onerror = () => { current.terminate(); worker.current = null; reject(new Error("The CSV could not be processed. Check its format and try again.")); };
        current.postMessage({ file });
      });
      if (!payload.results.length) throw new Error("This CSV contains no company rows.");
      if (!payload.results.some(result => result.name !== "Company 1" && (result.nseCode || result.bseCode))) throw new Error("Use a Screener export containing Name and NSE Code or BSE Code columns.");
      const dated = { ...payload, dataAsOf: dataAsOf || undefined };
      let next: ScreeningRunPayload = dated;
      try { next = await saveLocalRun(ownerId, dated, file); setNotice("Research saved on this browser for this account. Export an audit for a portable backup."); }
      catch { setNotice("Analysis is ready, but browser storage could not save it. Export an audit before leaving this tab."); }
      setRun(next); setSelectedId(next.results[0].id); setDrawerOpen(false); setView("screen"); setSearch(""); setStatus("all"); setIndustry("all"); setPage(0);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not import this CSV."); }
    finally { setBusy(false); importing.current = false; }
  }

  async function saveReview(result: ScreeningResult, decision: Decision, notes: string) {
    if (!run) return;
    if (decision === "approved" && result.gateStatus !== "review") throw new Error("A company must pass every screening gate before approval.");
    if (run.id) await updateLocalDecision(ownerId, run.id, result.id, decision, notes);
    setRun(current => current ? { ...current, results: current.results.map(row => row.id === result.id ? { ...row, decision, notes } : row) } : current);
    setNotice(run.id ? "Review saved on this browser." : "Review updated for this session. Export an audit to keep it.");
  }

  const openChart = (result: ScreeningResult) => {
    const instrument = resolveFundamentalInstrument(result, instruments);
    if (instrument) { setDrawerOpen(false); onOpenChart(instrument); }
  };

  return <div className="modal-backdrop navigation-page-backdrop fa-backdrop">
    <section className="modal navigation-page fundamental-workspace" aria-label="Fundamental Analysis of Indian stocks" aria-busy={busy}>
      <div className="modal-head"><div><span className="eyebrow">Indian equities</span><h2><BookOpenCheck size={22} /> Fundamental Analysis</h2></div><button className="icon-button" onClick={onClose} aria-label="Close fundamental analysis"><X size={20} /></button></div>
      <div className="fa-toolbar">
        <nav className="fa-tabs" aria-label="Fundamental analysis sections">{VIEWS.map(tab => <button key={tab.id} aria-pressed={view === tab.id} onClick={() => { setView(tab.id); setPage(0); setDrawerOpen(false); }}>{tab.label}</button>)}</nav>
        <div className="fa-file-actions"><label className="fa-date">Data as of<input type="date" aria-label="Financial data as of" value={dataAsOf} onChange={event => setDataAsOf(event.target.value)} /></label><label className={`fa-upload ${busy || loading ? "disabled" : ""}`}><Upload size={16} />{busy ? "Screening…" : "Import CSV"}<input type="file" accept=".csv,text/csv" aria-label="Import fundamental CSV" disabled={busy || loading} onChange={event => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void importCsv(file); }} /></label><button disabled={!run || busy} onClick={() => run && downloadFile(JSON.stringify({ ...run, exportedAt: new Date().toISOString() }, null, 2), "papertrade-fundamental-audit.json", "application/json")}><Download size={16} />Export audit</button></div>
      </div>
      {error && <p className="fa-message fa-error" role="alert">{error}</p>}
      {notice && <p className="fa-message" role="status">{notice}</p>}
      {loading ? <p role="status">Loading saved research…</p> : <>
        {run && <div className="fa-run-summary"><b>{run.results.length} companies</b><span>{passing} passed gates</span><span>{run.results.length - passing} failed</span><span>{run.results.filter(result => result.decision === "approved").length} approved</span><small>{run.fileName} · Imported {date(run.importedAt)} IST · Data as of {run.dataAsOf || "not supplied"}</small></div>}
        {view === "rate" ? <CompanyRating instruments={instruments} onOpenChart={onOpenChart} /> : !run ? <div className="fa-empty"><BookOpenCheck size={32} /><h3>Import your company fundamentals</h3><p>Use the same Screener CSV export as stock-scout. Analyse financial ratios, compare industry peers and open each company in your existing chart workspace.</p><button onClick={() => downloadFile(`${recommendedColumns.join(",")}\n`, "fundamental-columns.csv", "text/csv")}>Download column template</button><button onClick={() => setView("rate")}>Rate one company with JSON</button></div> : <>
          {run.missingColumns.length > 0 && <details className="fa-missing"><summary>{run.missingColumns.length} screening columns missing · missing values fail their gates</summary><p>{run.missingColumns.join(" · ")}</p></details>}
          {view === "peers" ? <PeerComparison key={run.importedAt} run={run} instruments={instruments} onOpenChart={openChart} /> : <>
            <div className="fa-stock-toolbar"><button ref={stockTrigger} className="fa-stock-trigger" aria-label="Open stock list" aria-haspopup="dialog" aria-expanded={drawerOpen} aria-controls={drawerId} onClick={() => setDrawerOpen(true)}><PanelLeft size={17} />Stocks<span className="fa-stock-count">{filtered.length}</span></button></div>
            {view === "rank" && <p className="fa-hint">Ranked by stock-scout’s 0–10 rating: gates 50%, quality 15%, growth 15%, valuation 10%, balance 10%. Only companies passing every gate appear here. Financial-company ratings remain preliminary.</p>}
            <div className="fa-company-stage">{selected && <CompanyReview key={`${run.id ?? run.importedAt}:${selected.id}`} result={selected} instruments={instruments} onOpenChart={openChart} onSave={saveReview} />}</div>
            {drawerOpen && <StockDrawer id={drawerId} returnFocus={stockTrigger} onClose={() => setDrawerOpen(false)}>
              <header className="fa-drawer-head"><div><h3 id={`${drawerId}-title`}>Stocks</h3><small>{view === "rank" ? "Rankings" : "Screener"}</small></div><button className="icon-button" aria-label="Close stock list" onClick={() => setDrawerOpen(false)}><X size={20} /></button></header>
              <div className="fa-filters"><label><Search size={16} /><input aria-label="Search fundamental companies" value={search} onChange={event => { setSearch(event.target.value); setPage(0); }} placeholder="Company, symbol or industry" /></label><select aria-label="Fundamental industry filter" value={industry} onChange={event => { setIndustry(event.target.value); setPage(0); }}><option value="all">All industries</option>{industries.map(item => <option key={item}>{item}</option>)}</select><select aria-label="Fundamental status filter" value={status} onChange={event => { setStatus(event.target.value); setPage(0); }}><option value="all">All statuses</option><option value="review">Passed gates</option><option value="rejected">Failed gates</option><option value="approved">Approved reviews</option><option value="pending">Pending reviews</option></select></div>
              <div className="fa-results"><div className="fa-table-scroll"><table><thead><tr><th>Company</th><th className="fa-number">Rating</th><th className="fa-number">ROE</th><th className="fa-number">P/E</th><th>Gates</th><th>Chart</th></tr></thead><tbody>{shown.map(({ result, rating }) => <tr key={result.id} className={selectedId === result.id ? "fa-selected" : ""}><td><button className="fa-company-link" aria-pressed={selectedId === result.id} onClick={() => { setSelectedId(result.id); setDrawerOpen(false); }}><FundamentalLogo result={result} instruments={instruments} size={32} /><span><b>{result.nseCode || result.bseCode || result.name}</b><small>{result.name}</small></span></button></td><td className="fa-number"><b>{rating.overall.toFixed(1)}</b>{result.isFinancial && <small>preliminary</small>}</td><td className="fa-number" data-label="ROE">{number(result.metrics.roe, "%")}</td><td className="fa-number" data-label="P/E">{number(result.metrics.pe)}</td><td className="fa-stock-gates"><span className={`fa-badge ${result.gateStatus}`}>{result.gateStatus === "review" ? "Passed" : "Failed"}</span><small>{result.decision}</small></td><td><ChartButton result={result} instruments={instruments} onOpenChart={openChart} /></td></tr>)}</tbody></table>{!shown.length && <p className="fa-no-results">No companies match these filters.</p>}</div><div className="fa-pagination"><span>{filtered.length} results · Page {safePage + 1} of {lastPage + 1}</span><button disabled={safePage === 0} onClick={() => setPage(safePage - 1)}>Previous</button><button disabled={safePage === lastPage} onClick={() => setPage(safePage + 1)}>Next</button></div></div>
            </StockDrawer>}
          </>}
        </>}
      </>}
      <details className="fa-help"><summary>Data, rules and chart connections</summary><p>Fundamental values come from your imported CSV or pasted company JSON. Import time is separate from the financial data date. Missing values stay visible; prices from an export are not live quotes.</p><p>Passing gates makes a company ready for your review. Financial businesses also need checks of asset quality, capital adequacy and their specific business model. Rankings describe supplied data and do not predict returns.</p><p>Open chart resolves the NSE/BSE code or ISIN into the existing Charts workspace, with its current market data, drawings, indicators, alerts and paper order controls. An unavailable instrument needs a valid code and ISIN. Screening and saved reviews stay in this browser for the current account.</p><a href="https://github.com/foujdars/stock-scout" target="_blank" rel="noreferrer">Source: your stock-scout repository</a></details>
    </section>
  </div>;
}

function StockDrawer({ id, returnFocus, onClose, children }: { id: string; returnFocus: RefObject<HTMLButtonElement | null>; onClose: () => void; children: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useTransientBack(true, onClose);
  useEffect(() => {
    const node = dialog.current;
    const trigger = returnFocus.current;
    node?.showModal();
    // Keep the phone keyboard closed until the user chooses to search.
    const focusTarget = window.matchMedia("(pointer: coarse)").matches ? "button" : 'input[aria-label="Search fundamental companies"]';
    node?.querySelector<HTMLElement>(focusTarget)?.focus({ preventScroll: true });
    return () => { node?.close(); if (trigger?.isConnected) trigger.focus({ preventScroll: true }); };
  }, [returnFocus]);
  return <dialog ref={dialog} id={id} className="fa-stock-drawer" aria-labelledby={`${id}-title`} onCancel={event => { event.preventDefault(); onClose(); }} onKeyDown={event => {
    if (event.key !== "Tab") return;
    const controls = [...event.currentTarget.querySelectorAll<HTMLElement>('button, input, select, textarea, a[href], [tabindex]')]
      .filter(control => control.tabIndex >= 0 && !control.matches(":disabled") && control.getClientRects().length > 0);
    const first = controls[0], last = controls[controls.length - 1];
    if (!first || !last) { event.preventDefault(); return; }
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }} onClick={event => {
    if (event.target !== event.currentTarget) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) onClose();
  }}><div className="fa-drawer-content">{children}</div></dialog>;
}

function FundamentalLogo({ result, instruments, size }: { result: ScreeningResult; instruments: Instrument[]; size: number }) {
  const instrument = resolveFundamentalInstrument(result, instruments);
  const isin = result.isin.trim().toUpperCase();
  // The shared artwork catalogue uses NSE ISIN keys for the same company on either exchange.
  const key = /^IN[A-Z0-9]{9}[0-9]$/.test(isin) ? `NSE_EQ|${isin}` : instrument?.instrumentKey?.replace(/^BSE_EQ\|/, "NSE_EQ|");
  return <StockLogo symbol={(result.nseCode || result.bseCode || result.name).trim().toUpperCase()} instrumentKey={key} size={size} />;
}

function ChartButton({ result, instruments, onOpenChart }: { result: ScreeningResult; instruments: Instrument[]; onOpenChart: (result: ScreeningResult) => void }) {
  const available = Boolean(resolveFundamentalInstrument(result, instruments));
  return <button className="fa-chart-button" disabled={!available} title={available ? `Open ${result.nseCode || result.bseCode} in Charts` : "A matching listed symbol or valid ISIN is needed"} aria-label={`Open ${result.name} chart`} onClick={() => onOpenChart(result)}><LineChart size={16} />{available ? "Open chart" : "Unavailable"}</button>;
}

function CompanyReview({ result, instruments, onOpenChart, onSave }: { result: ScreeningResult; instruments: Instrument[]; onOpenChart: (result: ScreeningResult) => void; onSave: (result: ScreeningResult, decision: Decision, notes: string) => Promise<void> }) {
  const [decision, setDecision] = useState(result.decision);
  const [notes, setNotes] = useState(result.notes);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const rating = rateFundamentalCompany(result);
  const url = screenerCompanyUrl(result);
  return <aside className="fa-company-review">
    <header className="fa-review-heading">
      <div className="fa-company-identity"><FundamentalLogo result={result} instruments={instruments} size={42} /><div><small>{result.industry}</small><h3>{result.name}</h3><span>{result.nseCode || result.bseCode} · {result.isFinancial ? "Financial · preliminary" : "Non-financial"}</span></div></div>
      <div className="fa-review-actions"><ChartButton result={result} instruments={instruments} onOpenChart={onOpenChart} />{url && <a href={url} target="_blank" rel="noreferrer">Company source</a>}</div>
      <b className="fa-overall-rating">{rating.overall.toFixed(1)}</b>
    </header>
    <div className="fa-rating-breakdown">{(["gateScore", "quality", "growth", "valuation", "balance"] as const).map(key => <div key={key}><span>{key === "gateScore" ? "Gates" : key}</span><b>{rating[key].toFixed(1)}</b><meter min={0} max={10} value={rating[key]} aria-label={`${key} score`} /></div>)}</div>
    <details className="fa-metrics" open>
      <summary>Financial metrics</summary>
      <div className="fa-metric-groups">{METRIC_GROUPS.map(group => <section className="fa-metric-group" key={group.title} aria-label={group.title}>
        <h4>{group.title}</h4><dl>{group.fields.map(field => <div key={field.key}><dt>{field.label}</dt><dd>{number(result.metrics[field.key], field.suffix)}</dd></div>)}</dl>
      </section>)}</div>
    </details>
    <div className="fa-audit-grid">
      <details className="fa-gates"><summary>{result.checks.filter(check => check.pass).length} / {result.checks.length} gates passed</summary><div className="fa-gate-grid">{result.checks.map(check => <div className="fa-gate-row" key={check.id}><span className={check.pass ? "positive" : "negative"}>{check.pass ? "✓" : "×"}</span><span><b>{check.label}</b><small>{check.rule}</small></span><b>{check.value == null ? "Missing" : String(check.value)}</b></div>)}</div></details>
      <details className="fa-warnings"><summary>Review checks</summary><ul>{result.warnings.map(warning => <li key={warning}>{warning}</li>)}</ul></details>
    </div>
    <form className="fa-review-form" onSubmit={async event => { event.preventDefault(); setSaving(true); setError(""); try { await onSave(result, decision, notes); } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not save review."); } finally { setSaving(false); } }}>
      <label>Review decision<select value={decision} onChange={event => setDecision(event.target.value as Decision)}><option value="pending">Pending</option><option value="approved" disabled={result.gateStatus !== "review"}>Approved for research</option><option value="rejected">Declined after review</option></select></label>
      <label className="fa-notes">Research notes<textarea value={notes} onChange={event => setNotes(event.target.value)} rows={2} placeholder="Latest quarter, risks and your conclusion" /></label>
      <button disabled={saving} type="submit">{saving ? "Saving…" : "Save review"}</button>
      {(notes !== result.notes || decision !== result.decision) && <small className="fa-form-message">Unsaved changes</small>}{error && <p role="alert" className="negative fa-form-message">{error}</p>}
    </form>
  </aside>;
}

function PeerComparison({ run, instruments, onOpenChart }: { run: ScreeningRunPayload; instruments: Instrument[]; onOpenChart: (result: ScreeningResult) => void }) {
  const industries = useMemo(() => [...new Set(run.results.map(result => result.industry))].sort(), [run]);
  const [industry, setIndustry] = useState(industries[0] ?? "");
  const [selectedIds, setSelectedIds] = useState<string[] | null>(null);
  const peers = useMemo(() => run.results.filter(result => result.industry === industry), [run, industry]);
  const displayed = selectedIds == null ? peers.slice(0, 4) : peers.filter(result => selectedIds.includes(result.id));
  return <section className="fa-peers"><div className="fa-peer-toolbar"><label>Compare industry<select value={industry} onChange={event => { setIndustry(event.target.value); setSelectedIds(null); }}>{industries.map(item => <option key={item}>{item}</option>)}</select></label><span>Select up to four companies · medians use all {peers.length} industry peers</span></div><div className="fa-peer-picker">{peers.map(result => <label key={result.id}><input type="checkbox" checked={displayed.some(item => item.id === result.id)} disabled={!displayed.some(item => item.id === result.id) && displayed.length >= 4} onChange={event => { const ids = displayed.map(item => item.id); setSelectedIds(event.target.checked ? [...ids, result.id] : ids.filter(id => id !== result.id)); }} /><FundamentalLogo result={result} instruments={instruments} size={22} />{result.nseCode || result.bseCode || result.name}</label>)}</div><div className="fa-table-scroll"><table className="fa-peer-table" style={{ "--fa-peer-count": displayed.length } as CSSProperties}><colgroup><col /><col />{displayed.map(result => <col key={result.id} />)}</colgroup><thead><tr><th scope="col">Metric</th><th scope="col">Industry median</th>{displayed.map(result => <th scope="col" key={result.id}><div className="fa-peer-identity"><FundamentalLogo result={result} instruments={instruments} size={28} /><div><b>{result.nseCode || result.bseCode}</b><small>{result.name}</small></div></div><ChartButton result={result} instruments={instruments} onOpenChart={onOpenChart} /></th>)}</tr></thead><tbody><tr><th scope="row">Rating</th><td>{number(metricMedian(peers.map(result => rateFundamentalCompany(result).overall)))}</td>{displayed.map(result => <td key={result.id}>{rateFundamentalCompany(result).overall.toFixed(1)}{result.isFinancial && <small>Preliminary</small>}</td>)}</tr></tbody>{METRIC_GROUPS.map(group => <tbody key={group.title}><tr className="fa-peer-group"><th colSpan={displayed.length + 2} scope="rowgroup">{group.title}</th></tr>{group.fields.map(field => <tr key={field.key}><th scope="row">{field.label}</th><td>{number(metricMedian(peers.map(result => result.metrics[field.key])), field.suffix)}</td>{displayed.map(result => <td key={result.id}>{number(result.metrics[field.key], field.suffix)}</td>)}</tr>)}</tbody>)}</table></div></section>;
}

function CompanyRating({ instruments, onOpenChart }: { instruments: Instrument[]; onOpenChart: (instrument: Instrument) => void }) {
  const [input, setInput] = useState("");
  const [rated, setRated] = useState<ReturnType<typeof evaluateCompanyJson> | null>(null);
  const [ratingVersion, setRatingVersion] = useState(0);
  const [error, setError] = useState("");
  return <div className="fa-analysis-grid fa-rater"><form className="fa-json-form" onSubmit={event => { event.preventDefault(); try { setRated(evaluateCompanyJson(input)); setRatingVersion(current => current + 1); setError(""); } catch (caught) { setRated(null); setError(caught instanceof Error ? caught.message : "Check the JSON format."); } }}><h3>Rate one company</h3><p>Paste factual company data with the same field names as your Screener export. Use null when a value is unavailable.</p><button type="button" onClick={() => setInput(JSON.stringify(companyJsonTemplate, null, 2))}>Load blank template</button><label>Company JSON<textarea aria-label="Company fundamentals JSON" value={input} onChange={event => setInput(event.target.value)} rows={14} spellCheck={false} placeholder={'{ "Name": "Company name", "NSE Code": "SYMBOL", … }'} /></label>{error && <p role="alert" className="negative">{error}</p>}<button type="submit">Calculate rating</button><details><summary>Data extraction instructions</summary><p>Read the consolidated company financials. Return one JSON object using the template fields, plain numbers without units, codes as strings, and null for missing values. Sales and Net Profit mean TTM values. Supply the financial data date under Data as of. Verify extracted values against the company filings or Screener page.</p></details></form>{rated ? <div><p className="fa-hint">Data as of: {rated.dataAsOf || "not supplied"} · Single-company rating is for this session.</p><CompanyReview key={ratingVersion} result={rated.result} instruments={instruments} onOpenChart={result => { const instrument = resolveFundamentalInstrument(result, instruments); if (instrument) onOpenChart(instrument); }} onSave={async (_result, decision, notes) => setRated(current => current ? { ...current, result: { ...current.result, decision, notes } } : current)} /></div> : <div className="fa-empty"><h3>Your rating and gate audit will appear here</h3><p>Missing metrics contribute zero to their rating component and cannot pass a screening gate.</p></div>}</div>;
}
