"use client";

import { useEffect, useMemo, useRef, useState } from 'react';
import { RefreshCw, ChevronRight } from 'lucide-react';
import type { Instrument } from '@/lib/market';
import type { FnoUnderlying } from '@/lib/fno';
import { TRADING_GROUPS, tradingUniverse, type TradingGroup } from '@/lib/trading-universes';
import { useIndicatorSettings } from '@/lib/indicator-settings';
import { studyDefaults } from '@/lib/indicator-catalog';
import { TRADING_TIMEFRAMES, PSBB_SCAN_VERSION, indiaMonth, emptyTradingCounts, type TradingTimeframe, type TradingStatus, type TradingReport } from '@/lib/psbb-watchlist';

type Scan = { reports: Record<string, TradingReport>; errors: Record<string, string>; running: boolean; finishedAt?: number; progress?: number };
const cacheKey = (scope: string) => `papertrade-psbb-watchlist:${PSBB_SCAN_VERSION}:${scope}`;
function readScans(scope: string): Partial<Record<TradingTimeframe, Scan>> {
  try {
    const stored = JSON.parse(localStorage.getItem(cacheKey(scope)) ?? '{}') as Partial<Record<TradingTimeframe, Scan>>;
    return Object.fromEntries(TRADING_TIMEFRAMES.filter(frame => stored[frame]).map(frame => [frame, { ...stored[frame], running: false, progress: undefined }]));
  } catch { return {}; }
}
function saveScans(scope: string, scans: Partial<Record<TradingTimeframe, Scan>>) {
  try { localStorage.setItem(cacheKey(scope), JSON.stringify(scans)); } catch { /* Storage may be unavailable or full; the current view still retains results. */ }
}
const statuses: TradingStatus[] = ['pending', 'active', 'failed', 'success'];
const labels: Record<TradingStatus, string> = { pending: 'Pending', active: 'Active', failed: 'Failed', success: 'Success' };
const price = (value: number | null) => value === null ? '—' : value.toLocaleString('en-IN', { maximumFractionDigits: 2 });
const when = (time: number) => new Date(time * 1000).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
type Props = { instruments: Instrument[]; search: string; active: boolean; onOpen: (instrument: Instrument, timeframe: TradingTimeframe, time: number) => void; onCount: (count: number) => void };

export function TradingWatchlist(props: Props & { underlyings?: FnoUnderlying[] }) {
  const [month, setMonth] = useState(() => indiaMonth());
  const [universe, setUniverse] = useState<TradingGroup>('Nifty 50 stocks');
  const { settings, setStudy } = useIndicatorSettings();
  const saved = settings.psbb?.inputs;
  const inputs = useMemo(() => {
    const defaults = studyDefaults('psbb').inputs;
    return { length: saved?.length ?? defaults.length, left: saved?.left ?? defaults.left, oversold: saved?.oversold ?? defaults.oversold, overbought: saved?.overbought ?? defaults.overbought };
  }, [saved]);
  const stocks = useMemo(() => tradingUniverse(universe, props.instruments, props.underlyings), [props.instruments, props.underlyings, universe]);
  const scope = `${month}:${universe}:${JSON.stringify(inputs)}:${stocks.map((item) => item.instrumentKey).join(',')}`;
  return <section className="trading-watchlist" aria-label="PSBB trading watchlist">
    <header className="tw-heading"><div><h2>Trading watchlist</h2><p>PSBB divergence · 1:1 target</p></div><span className="tw-paper">Paper setups</span></header>
    <div className="tw-controls">
      <label>Category<select aria-label="Trading stock universe" value={universe} onChange={(e) => setUniverse(e.target.value as TradingGroup)}>{TRADING_GROUPS.map((item) => <option key={item}>{item}</option>)}</select></label>
      <label>Month<input aria-label="Trading month" type="month" value={month} min="2022-01" max={indiaMonth()} onChange={(e) => { if (/^\d{4}-(0[1-9]|1[0-2])$/.test(e.target.value) && e.target.value >= '2022-01' && e.target.value <= indiaMonth()) setMonth(e.target.value); }} /></label>
    </div>
    <p className="tw-scope">{universe} · {stocks.length} symbols → choose timeframe below</p>
    {universe === 'F&O stocks' && <p className="tw-scope">Signals use the underlying stock, not individual futures or options.</p>}
    {month !== indiaMonth() && <p className="tw-scope">Historical results use today’s category membership, not historical constituents.</p>}
    {!stocks.length && <p className="tw-errors">Category constituents unavailable or still loading. No results will be counted until the list is available.</p>}
    <TradingScanBoard key={scope} scope={scope} {...props} instruments={stocks} month={month} inputs={inputs} onOpen={(instrument, frame, time) => {
      for (const id of ['psbb', 'rsi']) {
        const config = settings[id] ?? studyDefaults(id);
        setStudy(id, { ...config, hidden: false, timeframes: config.timeframes.length ? [...new Set([...config.timeframes, frame])] : [] });
      }
      props.onOpen(instrument, frame, time);
    }} />
  </section>;
}

function TradingScanBoard({ instruments, month, inputs, search, onOpen, onCount, scope }: Props & { month: string; inputs: Record<string, number>; scope: string }) {
  const [timeframe, setTimeframe] = useState<TradingTimeframe>('5m');
  const [status, setStatus] = useState<TradingStatus | 'all'>('all');
  const [scans, setScans] = useState<Partial<Record<TradingTimeframe, Scan>>>({});
  const scansRef = useRef(scans), controllerRef = useRef<AbortController | null>(null);
  useEffect(() => {
    const restored = readScans(scope);
    scansRef.current = restored;
    setScans(restored);
  }, [scope]);
  useEffect(() => () => { controllerRef.current?.abort(); controllerRef.current = null; }, []);
  const startScan = async (frames: readonly TradingTimeframe[]) => {
    if (!instruments.length || controllerRef.current) return;
    const controller = new AbortController();
    controllerRef.current = controller;
    try {
      for (const frame of frames) {
        if (controller.signal.aborted) return;
        const old = scansRef.current[frame];
        const reports: Record<string, TradingReport> = {}, errors: Record<string, string> = {};
        let cursor = 0, paused = false;
        const publishProgress = (progress: number) => {
          if (!controller.signal.aborted) {
            const next = { ...scansRef.current, [frame]: { reports: old?.reports ?? { ...reports }, errors: old?.errors ?? { ...errors }, finishedAt: old?.finishedAt, running: true, progress } };
            scansRef.current = next;
            setScans(next);
            saveScans(scope, { ...next, [frame]: { ...next[frame], running: false, progress: undefined } });
          }
        };
        publishProgress(0);
        const worker = async () => {
          while (cursor < instruments.length && !controller.signal.aborted && !paused) {
            const item = instruments[cursor++];
            const params = new URLSearchParams({ instrumentKey: item.instrumentKey, timeframe: frame, month, ...Object.fromEntries(Object.entries(inputs).map(([key, value]) => [key, String(value)])) });
            try {
              const response = await fetch(`/api/market/psbb-scan?${params}`, { cache: 'no-store', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(55000)]) });
              const body = await response.json() as { ok?: boolean; report?: TradingReport; error?: { message?: string; code?: string } };
              if (!response.ok || !body.ok || !body.report) {
                if ([401, 403, 429, 503].includes(response.status)) paused = true;
                throw new Error(body.error?.message ?? 'History unavailable. Retry the scan.');
              }
              reports[item.instrumentKey] = body.report;
            } catch (error) {
              if (controller.signal.aborted) return;
              errors[item.instrumentKey] = error instanceof Error ? error.message : 'History unavailable.';
            }
            publishProgress(Object.keys(reports).length + Object.keys(errors).length);
          }
        };
        await Promise.all([worker(), worker()]);
        if (controller.signal.aborted) return;
        if (paused) for (let i = cursor; i < instruments.length; i++) errors[instruments[i].instrumentKey] = 'Not scanned: market-data service paused. Retry when available.';
        const next = { ...scansRef.current, [frame]: { reports, errors, running: false, finishedAt: Date.now() } };
        scansRef.current = next;
        setScans(next);
        saveScans(scope, next);
        if (paused) break;
      }
    } finally { if (controllerRef.current === controller) controllerRef.current = null; }
  };
  const current = scans[timeframe];
  const summary = (scan?: Scan) => {
    const counts = emptyTradingCounts();
    for (const report of Object.values(scan?.reports ?? {})) for (const state of statuses) counts[state] += report.counts[state];
    return counts;
  };
  const counts = summary(current);
  const rows = useMemo(() => {
    const map = new Map(instruments.map((item) => [item.instrumentKey, item]));
    return Object.values(current?.reports ?? {}).flatMap((report) => report.rows.map((row) => ({ ...row, instrument: map.get(report.instrumentKey)!, coverage: report.coverage }))).sort((a, b) => (b.setup.mssTime ?? b.setup.confirmedTime) - (a.setup.mssTime ?? a.setup.confirmedTime));
  }, [current, instruments]);
  useEffect(() => { onCount(rows.length); }, [onCount, rows.length]);
  const filtered = rows.filter((row) => (status === 'all' || row.status === status) && (!search.trim() || `${row.instrument.symbol} ${row.instrument.name}`.toLowerCase().includes(search.trim().toLowerCase())));
  const pageKey = `${timeframe}:${status}:${search}`;
  const [pagination, setPagination] = useState({ key: '', limit: 60 });
  const limit = pagination.key === pageKey ? pagination.limit : 60;
  const done = Object.keys(current?.reports ?? {}).length, failures = Object.keys(current?.errors ?? {}).length;
  const limited = Object.values(current?.reports ?? {}).filter((report) => report.coverage === 'limited').length;
  const scanning = Object.values(scans).some(scan => scan?.running);
  return <>
    <div className="tw-timeframes" role="tablist" aria-label="Trading timeframes">{TRADING_TIMEFRAMES.map((frame) => <button role="tab" aria-selected={frame === timeframe} key={frame} onClick={() => setTimeframe(frame)}>{frame}</button>)}</div>
    <div className="tw-actions"><span>RSI {inputs.length} · swings {inputs.left} / {inputs.left}</span><button onClick={() => void startScan([timeframe])} disabled={scanning || !instruments.length}><RefreshCw size={13} /> Refresh {timeframe}</button><button onClick={() => void startScan(TRADING_TIMEFRAMES)} disabled={scanning || !instruments.length}>Scan all 5</button></div>
    <div className="tw-states" aria-label="Filter setup status"><button aria-pressed={status === 'all'} onClick={() => setStatus('all')}>All <b>{rows.length}</b></button>{statuses.map((value) => <button className={value} aria-pressed={status === value} key={value} onClick={() => setStatus(value)}>{labels[value]} <b>{counts[value]}</b></button>)}</div>
    <details className="tw-monthly" open><summary>Monthly results by timeframe</summary><table><thead><tr><th>Frame</th><th>Success</th><th>Failed</th><th>Active</th><th>Scanned</th></tr></thead><tbody>{TRADING_TIMEFRAMES.map((frame) => {
      const scan = scans[frame], total = summary(scan), scanned = Object.keys(scan?.reports ?? {}).length;
      return <tr key={frame} className={frame === timeframe ? 'selected' : ''}><th><button onClick={() => setTimeframe(frame)}>{frame}</button><button className="tw-frame-refresh" aria-label={`Refresh ${frame}`} title={`Refresh ${frame}`} disabled={scanning || !instruments.length} onClick={() => void startScan([frame])}><RefreshCw size={12} /></button></th><td>{scanned ? total.success : '—'}</td><td>{scanned ? total.failed : '—'}</td><td>{scanned ? total.active : '—'}</td><td>{scan ? `${scanned}/${instruments.length}${scan.running ? '…' : ''}` : 'Not scanned'}</td></tr>;
    })}</tbody></table><p>Entries in the selected month; outcomes through month end (or now). Closed candles only. If stop and target share a candle, stop wins. No fees or slippage.</p></details>
    <div className="tw-progress" role="status">{!instruments.length ? 'Loading stocks…' : current?.running ? `Scanning ${timeframe}: ${current.progress ?? 0}/${instruments.length} stocks` : current ? `${done}/${instruments.length} stocks scanned${current.finishedAt ? ` · ${new Date(current.finishedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}` : ` · incomplete · Refresh ${timeframe} to rescan`}` : `Not scanned · Refresh ${timeframe} to scan`}{limited > 0 && <span>{limited} with limited history; counts may be incomplete.</span>}</div>
    {failures > 0 && <details className="tw-errors"><summary>{failures} stocks unavailable — excluded from totals</summary>{Object.entries(current!.errors).slice(0, 10).map(([key, message]) => <p key={key}>{instruments.find((item) => item.instrumentKey === key)?.symbol}: {message}</p>)}</details>}
    <div className="tw-rows">{filtered.slice(0, limit).map((row) => <button key={`${row.instrument.instrumentKey}:${row.id}`} className="tw-row" onClick={() => onOpen(row.instrument, timeframe, row.setup.mssTime ?? row.setup.confirmedTime)} aria-label={`Open ${row.instrument.symbol} ${timeframe} ${row.status} chart`}>
      <div className="tw-row-title"><b>{row.instrument.symbol}</b><span className={`tw-badge ${row.status}`}>{labels[row.status]}</span><ChevronRight size={14} /></div>
      <small>{row.setup.side === 'long' ? 'Bullish' : 'Bearish'} · {timeframe} · {when(row.setup.mssTime ?? row.setup.confirmedTime)}{row.coverage === 'limited' ? ' · Limited history' : ''}</small>
      <div className="tw-prices"><span>Entry <b>{price(row.setup.entry)}</b></span><span>SL <b>{price(row.setup.stop)}</b></span><span>Target · 1R <b>{price(row.setup.target1)}</b></span></div>
      {row.status === 'pending' && <small>{row.setup.entry === null ? 'Waiting for a confirmed swing level' : 'Waiting for MSS close through entry'}</small>}
    </button>)}</div>
    {filtered.length > limit && <button className="tw-more" onClick={() => setPagination({ key: pageKey, limit: limit + 60 })}>Show more setups</button>}
    {!filtered.length && done > 0 && !current?.running && <p className="tw-empty">No matching setups in the scanned history.</p>}
  </>;
}
