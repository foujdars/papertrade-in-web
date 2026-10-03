"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { DailyResearch, ResearchRow } from "@/lib/research";
const stamp = (time: number) => new Date(time).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) + " IST";
const factorLabels = { momentum: "3-month momentum", trend: "Trend vs EMA 20", volume: "Volume participation", relativeStrength: "Strength vs NIFTY", sentiment: "Dated news" };
export function ResearchWorkspace() {
  const [data, setData] = useState<DailyResearch | null>(null), [error, setError] = useState(""), [busy, setBusy] = useState(true), [stale, setStale] = useState(false), [query, setQuery] = useState(""), [filter, setFilter] = useState("all");
  const load = useCallback(async (signal?: AbortSignal) => {
    try { const r = await fetch("/api/research/daily", { signal, cache: "no-store" }), payload = await r.json(); if (!r.ok || !payload.ok) throw new Error(payload.error ?? "Research unavailable."); setData(payload.data); setStale(payload.stale); }
    catch (e) { if (!signal?.aborted) setError(e instanceof Error ? e.message : "Research unavailable."); }
    finally { if (!signal?.aborted) setBusy(false); }
  }, []);
  useEffect(() => { const controller = new AbortController(); queueMicrotask(() => { if (!controller.signal.aborted) void load(controller.signal); }); return () => controller.abort(); }, [load]);
  const rows = (data?.rows ?? []).filter(r => `${r.symbol} ${r.name} ${r.sector}`.toLowerCase().includes(query.toLowerCase()) && (filter === "all" || r.fundamental.status === filter));
  return <main className="research-workspace"><header className="research-top"><div><p className="eyebrow">PaperTrade IN</p><h1>Daily research</h1></div><Link href="/">Return to trading</Link></header>
    <div className="research-toolbar"><label>Find stock or sector<input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Symbol, company, sector" /></label><label>Fundamental screen<select value={filter} onChange={e => setFilter(e.target.value)}><option value="all">All stocks</option><option value="pass">Pass checks</option><option value="flag">Review flags</option><option value="unknown">Missing data</option></select></label><button onClick={() => { setBusy(true); setError(""); void load(); }} disabled={busy}>{busy ? "Loading…" : "Refresh results"}</button></div>
    <p className="research-help">Scheduled weekdays at 16:15 IST. Results are saved even when the app is closed. Refresh loads the latest saved scan.</p>
    {error && <p className="research-card" role="status">{error} <a href="https://github.com/foujdars/papertrade-in-web/actions/workflows/daily-research.yml" target="_blank" rel="noreferrer">View scan runs</a></p>}
    {data && <><section className="research-card"><div className="research-metrics"><span>Market condition<b>{data.regime.state} · {data.regime.direction}</b></span><span>Above EMA 20<b>{data.regime.breadth === null ? "—" : `${data.regime.breadth.toFixed(0)}% of scan universe`}</b></span><span>India VIX<b>{data.regime.vix?.toFixed(2) ?? "Unavailable"}</b></span><span>Coverage<b>{data.scanned} / {data.requested} stocks</b></span></div><p>{data.regime.reason}</p><p className="research-help">Updated {stamp(data.generatedAt)} · {data.source}{data.partial ? " · Partial coverage" : ""}{stale ? " · Stale scan: check scheduled runs" : ""}</p>{data.errors.length > 0 && <p role="status">{data.errors.join(" · ")}</p>}</section>
    <div className="research-list">{rows.map(row => <ResearchStock key={row.symbol} row={row} />)}</div>{!rows.length && <p>No stocks match these filters.</p>}
    <p className="research-help">Rank is relative to the displayed scan universe, not a probability of profit. Missing factors are omitted from weighting. Fundamentals are a separate review screen; news scores use a simple financial-word lexicon. Daily research prices are not executable trading quotes.</p></>}
  </main>;
}
function ResearchStock({ row }: { row: ResearchRow }) {
  return <details className="research-card research-stock"><summary><span className="research-rank">{row.rank}</span><span><b>{row.symbol}</b><small>{row.name} · {row.sector}</small></span><span><b>{row.score.toFixed(0)} / 100</b><small>Relative rank score</small></span><span className={`research-screen ${row.fundamental.status}`}>{row.fundamental.status === "flag" ? "Review" : row.fundamental.status}</span></summary>
    <div className="research-stock-body"><p>Adjusted daily close ₹{row.price.toLocaleString("en-IN", { maximumFractionDigits: 2 })} · Session {new Date(row.priceAsOf).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" })}</p><Link href={`/?symbol=${encodeURIComponent(row.symbol)}`}>Open trading chart</Link>
      <h3>Why this rank</h3><div className="research-factors">{Object.entries(factorLabels).map(([key, label]) => <span key={key}>{label}<b>{row.factors[key as keyof typeof factorLabels] === undefined ? "Unavailable" : `${row.factors[key as keyof typeof factorLabels]!.toFixed(0)}th percentile`}</b></span>)}</div>
      <h3>Fundamental screening</h3><div className="research-factors">{row.fundamental.checks.map(c => <span key={c.label}>{c.label}<b>{c.value === null ? "—" : c.value.toFixed(2)} · {c.state}</b></span>)}</div><p className="research-help">Review flags: ROE below 10%, debt/equity above 2, current ratio below 1, or non-positive growth/margin. P/E is context only. Debt and liquidity ratios are context for financial companies.</p>
      {row.fundamentalData && <p className="research-help">Retrieved {stamp(row.fundamentalData.asOf)}{row.fundamentalData.financialPeriod ? ` · Financial period ${new Date(row.fundamentalData.financialPeriod).toLocaleDateString("en-IN")}` : " · Financial period unavailable"} · <a href={row.fundamentalData.sourceUrl} target="_blank" rel="noreferrer">{row.fundamentalData.source}</a></p>}
      <h3>Dated news sentiment</h3><p>{row.sentiment.coverage} · {row.sentiment.score === null ? "Unavailable" : row.sentiment.score > .1 ? "Positive" : row.sentiment.score < -.1 ? "Negative" : "Mixed / neutral"}{row.sentiment.score !== null ? ` (${row.sentiment.score.toFixed(2)})` : ""}</p>
      <ul className="research-news">{row.sentiment.headlines.map((h, i) => <li key={`${h.url}:${i}`}><a href={h.url} target="_blank" rel="noreferrer">{h.title}</a><small>{h.source} · {stamp(h.publishedAt)} · Headline score {h.score.toFixed(2)}</small></li>)}</ul>
      {row.errors.length > 0 && <p role="status" className="research-help">{row.errors.join(" · ")}</p>}
    </div></details>;
}
