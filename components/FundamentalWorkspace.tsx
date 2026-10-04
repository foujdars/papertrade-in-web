"use client";

import { useDeferredValue, useEffect, useId, useMemo, useRef, useState } from "react";
import { BookOpenCheck, Check, ChevronDown, ClipboardCheck, Download, Minus, Search, ShieldCheck, Upload, X } from "lucide-react";
import type { Instrument } from "@/lib/market";
import { recommendedColumns, screenerCompanyUrl, type Decision, type ScreeningResult, type ScreeningRunPayload } from "@/lib/fundamental-screener";
import { companyJsonTemplate, evaluateCompanyJson, rateFundamentalCompany, resolveFundamentalInstrument } from "@/lib/fundamental-analysis";
import { loadLatestLocalRun, saveLocalRun, updateLocalDecision } from "@/lib/fundamental-store";
import { getSupabaseBrowserClient } from "@/lib/supabase-client";
import { StockLogo } from "./StockLogo";
import { AppDialog } from "./AppDialog";
import { ModernSelect } from "./ModernSelect";
import { FundamentalPeers } from "./FundamentalPeers";
import { TopStocks } from "./TopStocks";
import type { ResearchOrderDraft } from "@/lib/stock-discovery";
import "./fundamental-workspace.css";
import "./research-workspace.css";

type Props = { balance: number; onSimulate: (draft: ResearchOrderDraft) => void; ownerId: string; instruments: Instrument[]; onClose: () => void; onOpenChart: (instrument: Instrument) => void };
type View = "screen" | "rank" | "peers" | "rate";
const VIEWS: { id: View; label: string }[] = [{ id: "screen", label: "Screener" }, { id: "rank", label: "Top stocks" }, { id: "peers", label: "Peer comparison" }, { id: "rate", label: "Company rating" }];
const PAGE_SIZE = 50;
const STOCK_LIST_LABELS: Record<string, string> = { all: "All companies", review: "Passed gates", rejected: "Failed gates", approved: "Approved reviews", pending: "Pending reviews" };
const number = (value: number | null, suffix = "") => value == null ? "Missing" : `${value.toLocaleString("en-IN", { maximumFractionDigits: 2 })}${suffix}`;

type RemoteFundamentalManifest = {
  available?: boolean;
  version?: string;
  generatedAt?: string;
  dataAsOf?: string;
  fileName?: string;
  rowCount?: number;
};

type ImportOptions = {
  sourceVersion?: string;
  dataAsOf?: string;
  automatic?: boolean;
};

function downloadFile(content: string, fileName: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a"); link.href = url; link.download = fileName; link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function FundamentalWorkspace({ ownerId, instruments, balance, onSimulate, onClose, onOpenChart }: Props) {
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
  const [peerAnchor, setPeerAnchor] = useState("");
  const [search, setSearch] = useState("");
  const term = useDeferredValue(search.trim().toLowerCase());
  const [status, setStatus] = useState("all");
  const [listSort, setListSort] = useState<"name" | "rating">("name");
  const [industry, setIndustry] = useState("all");
  const [page, setPage] = useState(0);
  const [dataAsOf, setDataAsOf] = useState("");
  const worker = useRef<Worker | null>(null);
  const importing = useRef(false);

  useEffect(() => {
    let active = true;
    const load = async () => {
      let saved: ScreeningRunPayload | null = null;
      try {
        saved = await loadLatestLocalRun(ownerId);
        if (active) {
          setRun(saved); setSelectedId(saved?.results[0]?.id ?? ""); setDataAsOf(saved?.dataAsOf ?? "");
        }
      } catch {
        if (active) setNotice("Saved research could not be loaded. The latest server CSV will be tried automatically.");
      }

      try {
        const client = getSupabaseBrowserClient();
        const session = (await client?.auth.getSession())?.data.session;
        if (session) {
          const headers = { Authorization: `Bearer ${session.access_token}` };
          const manifestResponse = await fetch("/api/fundamentals/manifest", { headers, cache: "no-store" });
          if (manifestResponse.ok) {
            const manifest = await manifestResponse.json() as RemoteFundamentalManifest;
            if (manifest.version && manifest.version !== saved?.sourceVersion) {
              const csvResponse = await fetch("/api/fundamentals/latest", { headers, cache: "no-store" });
              if (!csvResponse.ok) throw new Error("The latest fundamental CSV could not be downloaded.");
              const csv = await csvResponse.text();
              const file = new File([csv], manifest.fileName || "screener_results_merged.csv", { type: "text/csv" });
              await importCsv(file, { sourceVersion: manifest.version, dataAsOf: manifest.dataAsOf, automatic: true });
            }
          }
        }
      } catch (caught) {
        if (active && !saved) setNotice(caught instanceof Error ? caught.message : "The latest server CSV could not be loaded. You can import a CSV manually.");
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => { active = false; worker.current?.terminate(); worker.current = null; };
  // importCsv is a stable function declaration; ownerId is the only load scope.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownerId]);

  const industries = useMemo(() => [...new Set(run?.results.map(result => result.industry) ?? [])].sort(), [run]);
  const scored = useMemo(() => (run?.results ?? []).map(result => ({ result, rating: rateFundamentalCompany(result) })), [run]);
  const filtered = useMemo(() => scored.filter(({ result }) =>
    (!term || `${result.name} ${result.nseCode} ${result.bseCode} ${result.industry}`.toLowerCase().includes(term)) &&
    (industry === "all" || result.industry === industry) &&
    (status === "all" || (status === "review" || status === "rejected" ? result.gateStatus === status : result.decision === status))
  ).sort((a, b) => listSort === "rating" ? b.rating.overall - a.rating.overall : a.result.name.localeCompare(b.result.name)), [scored, term, industry, status, listSort]);
  const lastPage = Math.max(0, Math.ceil(filtered.length / PAGE_SIZE) - 1);
  const safePage = Math.min(page, lastPage);
  const shown = filtered.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);
  const selected = run?.results.find(result => result.id === selectedId) ?? null;
  const passing = run?.results.filter(result => result.gateStatus === "review").length ?? 0;
  const summaries = [
    { status: "all", label: "companies", count: run?.results.length ?? 0 },
    { status: "review", label: "passed gates", count: passing },
    { status: "rejected", label: "failed", count: (run?.results.length ?? 0) - passing },
    { status: "approved", label: "approved", count: run?.results.filter(result => result.decision === "approved").length ?? 0 },
  ];

  const openStockList = (nextStatus: string, trigger: HTMLButtonElement) => {
    stockTrigger.current = trigger;
    setStatus(nextStatus); setSearch(""); setIndustry("all"); setPage(0);
    setListSort(view === "rank" && nextStatus === "review" ? "rating" : "name");
    setDrawerOpen(true);
  };

  async function importCsv(file: File, options: ImportOptions = {}) {
    if (importing.current) return;
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
      const dated = {
        ...payload,
        sourceVersion: options.sourceVersion,
        dataAsOf: (options.dataAsOf ?? dataAsOf) || undefined,
      };
      let next: ScreeningRunPayload = dated;
      try { next = await saveLocalRun(ownerId, dated, file); setNotice("Research saved on this browser for this account. Export an audit for a portable backup."); }
      catch { setNotice("Analysis is ready, but browser storage could not save it. Export an audit before leaving this tab."); }
      if (options.automatic) setNotice("Latest fundamental data loaded automatically from the server.");
      setRun(next); setDataAsOf(next.dataAsOf ?? ""); setSelectedId(next.results[0].id); setDrawerOpen(false); setView("screen"); setSearch(""); setStatus("all"); setIndustry("all"); setPage(0);
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

  const inspect = (id: string) => { setSelectedId(id); setView("screen"); };
  const compare = (id: string) => { setPeerAnchor(id); setView("peers"); };

  return <div className="modal-backdrop navigation-page-backdrop fa-backdrop">
    <section className="modal navigation-page fundamental-workspace" aria-label="Fundamental Analysis of Indian stocks" aria-busy={busy}>
      <div className="modal-head"><div><span className="eyebrow">Indian equities</span><h2><BookOpenCheck size={22} /> Fundamental Analysis</h2></div><button className="icon-button" onClick={onClose} aria-label="Close fundamental analysis"><X size={20} /></button></div>
      <div className="fa-toolbar">
        <nav className="fa-tabs" aria-label="Fundamental analysis sections">{VIEWS.map(tab => <button key={tab.id} aria-pressed={view === tab.id} onClick={() => { setView(tab.id); setPage(0); setDrawerOpen(false); }}>{tab.label}</button>)}</nav>
        <div className="fa-file-actions"><label className={`fa-upload ${busy || loading ? "disabled" : ""}`}><Upload size={16} />{busy ? "Screening…" : "Import CSV manually"}<input type="file" accept=".csv,text/csv" aria-label="Import fundamental CSV" disabled={busy || loading} onChange={event => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void importCsv(file); }} /></label><button disabled={!run || busy} onClick={() => run && downloadFile(JSON.stringify({ ...run, exportedAt: new Date().toISOString() }, null, 2), "papertrade-fundamental-audit.json", "application/json")}><Download size={16} />Export audit</button></div>
      </div>
      {run && <div className="research-data-line"><span><b>Financial data</b> {run.dataAsOf || "Date not supplied"}</span><span><b>Imported</b> {new Date(run.importedAt).toLocaleDateString("en-IN")}</span><span title={run.fileName}>{run.fileName}</span></div>}
      {error && <p className="fa-message fa-error" role="alert">{error}</p>}
      {notice && view === "screen" && <p className="fa-message" role="status">{notice}</p>}
      {loading ? <p role="status">Loading saved research…</p> : <>
        {run && view === "screen" && <nav className="fa-run-summary" aria-label="Company lists">{summaries.map(summary => <button type="button" key={summary.status}
          aria-label={`${summary.count} ${summary.label}`} aria-haspopup="dialog" aria-expanded={drawerOpen && status === summary.status} aria-controls={drawerId}
          title={`View ${STOCK_LIST_LABELS[summary.status].toLowerCase()}`} onClick={event => openStockList(summary.status, event.currentTarget)}>
          <b>{summary.count}</b>{" "}<span>{summary.label}</span>
        </button>)}</nav>}
        {view === "rate" ? <CompanyRating instruments={instruments} onOpenChart={onOpenChart} /> : !run ? <div className="fa-empty"><BookOpenCheck size={32} /><h3>Loading the latest company fundamentals</h3><p>After sign-in, the latest monthly Screener CSV is loaded from the server automatically. Manual CSV import remains available as a fallback.</p><button onClick={() => downloadFile(`${recommendedColumns.join(",")}\n`, "fundamental-columns.csv", "text/csv")}>Download column template</button><button onClick={() => setView("rate")}>Rate one company with JSON</button></div> : <>
          {run.missingColumns.length > 0 && <details className="fa-missing"><summary>{run.missingColumns.length} screening columns missing · missing values fail their gates</summary><p>{run.missingColumns.join(" · ")}</p></details>}
          <div hidden={view !== "peers"}><FundamentalPeers key={`${run.importedAt}:${peerAnchor}`} run={run} instruments={instruments} anchorId={peerAnchor || selectedId} onInspect={inspect} onOpenChart={openChart} /></div>
          <div hidden={view !== "rank"}><TopStocks key={run.importedAt} run={run} instruments={instruments} balance={balance} onInspect={inspect} onCompare={compare} onOpenChart={onOpenChart} onSimulate={onSimulate} /></div>
          {view === "screen" && <><div className="research-company-nav"><div><span className="eyebrow">COMPANY RESEARCH</span><p>Inspect the gates, compare the peers, then practise your setup.</p></div>{selected && <button onClick={() => compare(selected.id)}>Compare this company’s peers</button>}<button onClick={() => setView("rank")}>Discover top stocks →</button></div><div className="fa-company-stage">{selected && <CompanyReview key={`${run.id ?? run.importedAt}:${selected.id}`} result={selected} instruments={instruments} onOpenChart={openChart} onSave={saveReview} />}</div></>}

        </>}
        {run && drawerOpen && <AppDialog id={drawerId} className="fa-stock-drawer" labelledBy={`${drawerId}-title`} returnFocus={stockTrigger} initialFocus='input[aria-label="Search fundamental companies"]' avoidTouchKeyboard onClose={() => setDrawerOpen(false)}><div className="fa-drawer-content">
              <header className="fa-drawer-head"><div><h3 id={`${drawerId}-title`}>Stocks</h3><small>{STOCK_LIST_LABELS[status]}{listSort === "rating" ? " · Rankings" : ""}</small></div><button className="icon-button" aria-label="Close stock list" onClick={() => setDrawerOpen(false)}><X size={20} /></button></header>
              <div className="fa-filters"><label><Search size={16} /><input aria-label="Search fundamental companies" value={search} onChange={event => { setSearch(event.target.value); setPage(0); }} placeholder="Company, symbol or industry" /></label><ModernSelect label="Industry" ariaLabel="Fundamental industry filter" hideLabel value={industry} choices={[{ value: "all", label: "All industries" }, ...industries.map(item => ({ value: item, label: item }))]} onChange={value => { setIndustry(value); setPage(0); }} /><ModernSelect label="Status" ariaLabel="Fundamental status filter" hideLabel value={status} choices={[{ value: "all", label: "All statuses" }, { value: "review", label: "Passed gates" }, { value: "rejected", label: "Failed gates" }, { value: "approved", label: "Approved reviews" }, { value: "pending", label: "Pending reviews" }]} onChange={value => { setStatus(value); setPage(0); }} /></div>
              <div className="fa-results"><div className="fa-table-scroll"><table><thead><tr><th>Company</th><th className="fa-number">Rating</th><th className="fa-number">ROE</th><th className="fa-number">P/E</th><th>Gates</th></tr></thead><tbody>{shown.map(({ result, rating }) => <tr key={result.id} className={selectedId === result.id ? "fa-selected" : ""}><td><div className="fa-stock-identity"><StockChartLink result={result} instruments={instruments} onOpenChart={openChart} /><button className="fa-company-link" title="View fundamental analysis" aria-label={`Analyse ${result.name}`} aria-pressed={selectedId === result.id} onClick={() => { setSelectedId(result.id); setDrawerOpen(false); setView("screen"); }}><small>{result.name}</small></button></div></td><td className="fa-number"><b>{rating.overall.toFixed(1)}</b>{result.isFinancial && <small>preliminary</small>}</td><td className="fa-number" data-label="ROE">{number(result.metrics.roe, "%")}</td><td className="fa-number" data-label="P/E">{number(result.metrics.pe)}</td><td className="fa-stock-gates"><span className={`fa-badge ${result.gateStatus}`}>{result.gateStatus === "review" ? "Passed" : "Failed"}</span><small>{result.decision}</small></td></tr>)}</tbody></table>{!shown.length && <p className="fa-no-results">No companies match these filters.</p>}</div><div className="fa-pagination"><span>{filtered.length} results · Page {safePage + 1} of {lastPage + 1}</span><button disabled={safePage === 0} onClick={() => setPage(safePage - 1)}>Previous</button><button disabled={safePage === lastPage} onClick={() => setPage(safePage + 1)}>Next</button></div></div>
            </div></AppDialog>}
      </>}
      <details className="fa-help"><summary>Data, rules and chart connections</summary><p>Fundamental values come from the latest server CSV after sign-in, or from a manual CSV/JSON fallback. Import time is separate from the financial data date. Missing values stay visible; prices from an export are not live quotes.</p><p>Passing gates makes a company ready for your review. Financial businesses also need checks of asset quality, capital adequacy and their specific business model. Rankings describe supplied data and do not predict returns.</p><p>Company logos and symbols open the NSE/BSE code or ISIN in the existing Charts workspace, with its current market data, drawings, indicators, alerts and paper order controls. An unavailable instrument needs a valid code and ISIN. Screening and saved reviews stay in this browser for the current account.</p><a href="https://github.com/foujdars/stock-scout" target="_blank" rel="noreferrer">Source: your stock-scout repository</a></details>
    </section>
  </div>;
}

function FundamentalLogo({ result, instruments, size }: { result: ScreeningResult; instruments: Instrument[]; size: number }) {
  const instrument = resolveFundamentalInstrument(result, instruments);
  const isin = result.isin.trim().toUpperCase();
  // The shared artwork catalogue uses NSE ISIN keys for the same company on either exchange.
  const key = /^IN[A-Z0-9]{9}[0-9]$/.test(isin) ? `NSE_EQ|${isin}` : instrument?.instrumentKey?.replace(/^BSE_EQ\|/, "NSE_EQ|");
  return <StockLogo symbol={(result.nseCode || result.bseCode || result.name).trim().toUpperCase()} instrumentKey={key} size={size} />;
}

function StockChartLink({ result, instruments, onOpenChart, size = 32 }: { result: ScreeningResult; instruments: Instrument[]; onOpenChart: (result: ScreeningResult) => void; size?: number }) {
  const available = Boolean(resolveFundamentalInstrument(result, instruments));
  return <button type="button" className="fa-stock-chart" disabled={!available} title={available ? "Open chart" : "A matching listed symbol or valid ISIN is needed"} aria-label={`Open ${result.name} chart`} onClick={() => onOpenChart(result)}><FundamentalLogo result={result} instruments={instruments} size={size} /><b>{result.nseCode || result.bseCode || result.name}</b></button>;
}

function GateResults({ result }: { result: ScreeningResult }) {
  const passed = result.checks.filter(check => check.pass).length;
  const missing = result.checks.filter(check => !check.pass && check.value == null).length;
  const failed = result.checks.length - passed - missing;
  const allPassed = passed === result.checks.length && result.checks.length > 0;
  return <details className={`fa-gates ${allPassed ? "all-passed" : "needs-review"}`}>
    <summary>
      <span className="fa-gate-emblem"><ShieldCheck size={25} aria-hidden="true" /></span>
      <span className="fa-gate-summary-content">
        <span className="fa-gate-summary-line"><span className="fa-gate-count"><b>{passed}</b> / {result.checks.length} gates passed</span>
          <span className="fa-gate-outcomes">{allPassed ? <span className="passed">All passed</span> : <>{failed > 0 && <span className="failed">{failed} failed</span>}{missing > 0 && <span className="missing">{missing} missing</span>}</>}</span>
        </span>
        <span className="fa-gate-track" role="img" aria-label={`${passed} passed, ${failed} failed, ${missing} missing`}>
          {result.checks.map(check => <span key={check.id} className={check.pass ? "passed" : check.value == null ? "missing" : "failed"} title={`${check.label}: ${check.pass ? "Passed" : check.value == null ? "Missing" : "Failed"}`} />)}
        </span>
      </span>
      <ChevronDown size={17} aria-hidden="true" />
    </summary>
    <div className="fa-gate-grid" role="list" aria-label="Screening gates">{result.checks.map(check => {
      const status = check.pass ? "passed" : check.value == null ? "missing" : "failed";
      const Icon = check.pass ? Check : check.value == null ? Minus : X;
      return <div className="fa-gate-row" role="listitem" key={check.id} data-status={status}>
        <span className="fa-gate-status"><Icon size={13} aria-hidden="true" /></span>
        <span className="fa-gate-copy"><b>{check.label}</b><small>{check.rule}</small></span>
        <span className="fa-gate-reading"><b>{check.value == null ? "Missing" : String(check.value)}</b>{check.value != null && <small>{check.pass ? "Passed" : "Failed"}</small>}</span>
      </div>;
    })}</div>
  </details>;
}

function CompanyReview({ result, instruments, onOpenChart, onSave }: { result: ScreeningResult; instruments: Instrument[]; onOpenChart: (result: ScreeningResult) => void; onSave: (result: ScreeningResult, decision: Decision, notes: string) => Promise<void> }) {
  const [decision, setDecision] = useState(result.decision);
  const [notes, setNotes] = useState(result.notes);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const rating = rateFundamentalCompany(result);
  const url = screenerCompanyUrl(result);
  const chartAvailable = Boolean(resolveFundamentalInstrument(result, instruments));
  const chartTitle = chartAvailable ? "Open chart" : "A matching listed symbol or valid ISIN is needed";
  return <aside className="fa-company-review">
    <header className="fa-review-heading">
      <div className="fa-company-identity"><button type="button" className="fa-chart-link fa-logo-link" disabled={!chartAvailable} title={chartTitle} aria-label={`Open ${result.name} chart`} onClick={() => onOpenChart(result)}><FundamentalLogo result={result} instruments={instruments} size={42} /></button><div><small>{result.industry}</small><h3><button type="button" className="fa-chart-link fa-name-link" disabled={!chartAvailable} title={chartTitle} onClick={() => onOpenChart(result)}>{result.name}</button></h3><span><button type="button" className="fa-chart-link fa-symbol-link" disabled={!chartAvailable} title={chartTitle} aria-label={`Open ${result.name} chart`} onClick={() => onOpenChart(result)}>{result.nseCode || result.bseCode}</button> · {result.isFinancial ? "Financial · preliminary" : "Non-financial"}</span></div></div>
      <div className="fa-review-actions">{url && <a href={url} target="_blank" rel="noreferrer">Original source of data</a>}</div>
      <b className="fa-overall-rating">{rating.overall.toFixed(1)}</b>
    </header>
    <div className="fa-rating-breakdown">{(["gateScore", "quality", "growth", "valuation", "balance"] as const).map(key => <div key={key}><span>{key === "gateScore" ? "Gates" : key}</span><b>{rating[key].toFixed(1)}</b><meter min={0} max={10} value={rating[key]} aria-label={`${key} score`} /></div>)}</div>
    <div className="fa-audit-grid">
      <GateResults result={result} />
      <details className="fa-warnings"><summary><span className="fa-section-label"><ClipboardCheck size={17} aria-hidden="true" />Review checks</span><ChevronDown size={16} aria-hidden="true" /></summary><ul>{result.warnings.map(warning => <li key={warning}>{warning}</li>)}</ul></details>
    </div>
    <form className="fa-review-form" onSubmit={async event => { event.preventDefault(); setSaving(true); setError(""); try { await onSave(result, decision, notes); } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not save review."); } finally { setSaving(false); } }}>
      <ModernSelect label="Review decision" value={decision} choices={[{ value: "pending", label: "Pending" }, { value: "approved", label: "Approved for research", disabled: result.gateStatus !== "review" }, { value: "rejected", label: "Declined after review" }]} onChange={setDecision} />
      <label className="fa-notes">Research notes<textarea value={notes} onChange={event => setNotes(event.target.value)} rows={2} placeholder="Latest quarter, risks and your conclusion" /></label>
      <button disabled={saving} type="submit">{saving ? "Saving…" : "Save review"}</button>
      {(notes !== result.notes || decision !== result.decision) && <small className="fa-form-message">Unsaved changes</small>}{error && <p role="alert" className="negative fa-form-message">{error}</p>}
    </form>
  </aside>;
}

function CompanyRating({ instruments, onOpenChart }: { instruments: Instrument[]; onOpenChart: (instrument: Instrument) => void }) {
  const [input, setInput] = useState("");
  const [rated, setRated] = useState<ReturnType<typeof evaluateCompanyJson> | null>(null);
  const [ratingVersion, setRatingVersion] = useState(0);
  const [error, setError] = useState("");
  return <div className="fa-analysis-grid fa-rater"><form className="fa-json-form" onSubmit={event => { event.preventDefault(); try { setRated(evaluateCompanyJson(input)); setRatingVersion(current => current + 1); setError(""); } catch (caught) { setRated(null); setError(caught instanceof Error ? caught.message : "Check the JSON format."); } }}><h3>Rate one company</h3><p>Paste factual company data with the same field names as your Screener export. Use null when a value is unavailable.</p><button type="button" onClick={() => setInput(JSON.stringify(companyJsonTemplate, null, 2))}>Load blank template</button><label>Company JSON<textarea aria-label="Company fundamentals JSON" value={input} onChange={event => setInput(event.target.value)} rows={14} spellCheck={false} placeholder={'{ "Name": "Company name", "NSE Code": "SYMBOL", … }'} /></label>{error && <p role="alert" className="negative">{error}</p>}<button type="submit">Calculate rating</button><details><summary>Data extraction instructions</summary><p>Read the consolidated company financials. Return one JSON object using the template fields, plain numbers without units, codes as strings, and null for missing values. Sales and Net Profit mean TTM values. Supply the financial data date under Data as of. Verify extracted values against the company filings or Screener page.</p></details></form>{rated ? <div><p className="fa-hint">Data as of: {rated.dataAsOf || "not supplied"} · Single-company rating is for this session.</p><CompanyReview key={ratingVersion} result={rated.result} instruments={instruments} onOpenChart={result => { const instrument = resolveFundamentalInstrument(result, instruments); if (instrument) onOpenChart(instrument); }} onSave={async (_result, decision, notes) => setRated(current => current ? { ...current, result: { ...current.result, decision, notes } } : current)} /></div> : <div className="fa-empty"><h3>Your rating and gate audit will appear here</h3><p>Missing metrics contribute zero to their rating component and cannot pass a screening gate.</p></div>}</div>;
}
