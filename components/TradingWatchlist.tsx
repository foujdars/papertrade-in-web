"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RefreshCw, ChevronRight } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import type { Instrument } from '@/lib/market';
import type { FnoUnderlying } from '@/lib/fno';
import { tradingUniverse, type TradingGroup } from '@/lib/trading-universes';
import { useIndicatorSettings } from '@/lib/indicator-settings';
import { studyDefaults } from '@/lib/indicator-catalog';
import { addPaperTradeNotification } from '@/lib/notification-center';
import { getNativeTradeAlert } from '@/lib/native-alert';
import { playPaperTradeTone } from '@/lib/papertrade-tone';
import { getNseMarketStatus } from '@/lib/market-hours';
import { TRADING_TIMEFRAMES, LIVE_DIVERGENCE_VERSION, indiaDay, type TradingTimeframe, type TodayDivergenceReport, type TodayDivergence } from '@/lib/psbb-watchlist';

type Scan = { reports: Record<string, TodayDivergenceReport>; errors: Record<string, string>; running: boolean; finishedAt?: number; progress?: number };
const cacheKey = (scope: string) => `papertrade-psbb-today:${LIVE_DIVERGENCE_VERSION}:${scope}`;
const seenKey = (scope: string, frame: TradingTimeframe) => `papertrade-psbb-alerted:${LIVE_DIVERGENCE_VERSION}:${scope}:${frame}`;
function readScans(scope: string): Partial<Record<TradingTimeframe, Scan>> {
  try {
    const stored = JSON.parse(localStorage.getItem(cacheKey(scope)) ?? '{}') as Partial<Record<TradingTimeframe, Scan>>;
    return Object.fromEntries(TRADING_TIMEFRAMES.filter(frame => stored[frame]).map(frame => [frame, { ...stored[frame], running: false, progress: undefined }]));
  } catch { return {}; }
}
function saveScans(scope: string, scans: Partial<Record<TradingTimeframe, Scan>>) {
  try { localStorage.setItem(cacheKey(scope), JSON.stringify(scans)); } catch { /* The current view retains results when storage is full. */ }
}
const when = (time: number) => new Date(time * 1000).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' });
type Props = { instruments: Instrument[]; search: string; active: boolean; onOpen: (instrument: Instrument, timeframe: TradingTimeframe, time: number) => void };

export function TradingWatchlist(props: Props & { underlyings?: FnoUnderlying[]; universe: TradingGroup }) {
  const universe = props.universe;
  const [day, setDay] = useState(() => indiaDay());
  useEffect(() => { const timer = setInterval(() => setDay(indiaDay()), 30_000); return () => clearInterval(timer); }, []);
  const { settings, setStudy } = useIndicatorSettings();
  const saved = settings.psbb?.inputs;
  const inputs = useMemo(() => {
    const defaults = studyDefaults('psbb').inputs;
    return { length: saved?.length ?? defaults.length, left: saved?.left ?? defaults.left, oversold: saved?.oversold ?? defaults.oversold, overbought: saved?.overbought ?? defaults.overbought };
  }, [saved]);
  const stocks = useMemo(() => tradingUniverse(universe, props.instruments, props.underlyings), [props.instruments, props.underlyings, universe]);
  const scope = `${day}:${universe}:${JSON.stringify(inputs)}:${stocks.map(item => item.instrumentKey).join(',')}`;
  return <section className="trading-watchlist" aria-label="PSBB multi-timeframe scanner">

    {!stocks.length && <p className="tw-errors">Category constituents unavailable or still loading.</p>}
    <TradingScanBoard key={scope} scope={scope} {...props} instruments={stocks} inputs={inputs} onOpen={(instrument, frame, time) => {
      for (const id of ['psbb', 'rsi']) {
        const config = settings[id] ?? studyDefaults(id);
        setStudy(id, { ...config, hidden: false, timeframes: config.timeframes.length ? [...new Set([...config.timeframes, frame])] : [] });
      }
      props.onOpen(instrument, frame, time);
    }} />
  </section>;
}

async function notifyDivergence(instrument: Instrument, frame: TradingTimeframe, row: TodayDivergence) {
  const id = `psbb-divergence:${instrument.instrumentKey}:${frame}:${row.id}`;
  const title = `${instrument.symbol} · ${row.side === 'long' ? 'Bullish' : 'Bearish'} PSBB divergence`;
  const body = `${frame} divergence confirmed at ${when(row.confirmedTime)} IST. Open the chart to review.`;
  const url = `/?symbol=${encodeURIComponent(instrument.symbol)}&timeframe=${frame}`;
  addPaperTradeNotification({ id, kind: 'trade', title, body, symbol: instrument.symbol, instrumentKey: instrument.instrumentKey, timeframe: frame, instrument, url });
  try {
    if (Capacitor.getPlatform() !== 'android') void playPaperTradeTone();
    if (Capacitor.getPlatform() === 'android') await getNativeTradeAlert().show({ title, body, notificationId: id, kind: 'trade', url });
    else if ('Notification' in window && Notification.permission === 'granted') {
      if ('serviceWorker' in navigator) {
        const registration = await navigator.serviceWorker.register('/notifications-sw.js', { scope: '/notifications/' });
        await registration.showNotification(title, { body, tag: id, icon: '/papertrade-icon-192.png?v=1.22', data: { url } });
      } else new Notification(title, { body, tag: id });
    }
  } catch { /* In-app notification is still recorded. */ }
}

function TradingScanBoard({ instruments, inputs, search, onOpen, scope, active }: Props & { inputs: Record<string, number>; scope: string }) {
  const [timeframe, setTimeframe] = useState<TradingTimeframe>('5m');
  const [scans, setScans] = useState<Partial<Record<TradingTimeframe, Scan>>>({});
  const [alertPermission, setAlertPermission] = useState(false);
  const scansRef = useRef(scans), controllerRef = useRef<AbortController | null>(null), lastCycleRef = useRef(0);
  useEffect(() => {
    const restored = readScans(scope);
    scansRef.current = restored;
    setScans(restored);
    setAlertPermission(Capacitor.getPlatform() !== 'android' && 'Notification' in window && Notification.permission === 'granted');
  }, [scope]);
  useEffect(() => () => { controllerRef.current?.abort(); controllerRef.current = null; }, []);
  const startScan = useCallback(async (frames: readonly TradingTimeframe[]) => {
    if (!instruments.length || controllerRef.current) return;
    const controller = new AbortController();
    controllerRef.current = controller;
    try {
      for (const frame of frames) {
        if (controller.signal.aborted) return;
        const old = scansRef.current[frame];
        const reports: Record<string, TodayDivergenceReport> = {}, errors: Record<string, string> = {};
        let cursor = 0, paused = false;
        const publishProgress = (progress: number) => {
          if (controller.signal.aborted) return;
          const next = { ...scansRef.current, [frame]: { reports: old?.reports ?? { ...reports }, errors: old?.errors ?? { ...errors }, finishedAt: old?.finishedAt, running: true, progress } };
          scansRef.current = next;
          setScans(next);
        };
        publishProgress(0);
        const worker = async () => {
          while (cursor < instruments.length && !controller.signal.aborted && !paused) {
            const item = instruments[cursor++];
            const params = new URLSearchParams({ instrumentKey: item.instrumentKey, timeframe: frame, today: '1', ...Object.fromEntries(Object.entries(inputs).map(([key, value]) => [key, String(value)])) });
            try {
              const response = await fetch(`/api/market/psbb-scan?${params}`, { cache: 'no-store', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(55000)]) });
              const body = await response.json() as { ok?: boolean; report?: TodayDivergenceReport; error?: { message?: string } };
              if (!response.ok || !body.ok || !body.report || body.report.date !== indiaDay()) {
                if ([401, 403, 429, 503].includes(response.status)) paused = true;
                throw new Error(body.error?.message ?? 'Live candles unavailable. Retry the scan.');
              }
              reports[item.instrumentKey] = body.report;
            } catch (error) {
              if (controller.signal.aborted) return;
              errors[item.instrumentKey] = error instanceof Error ? error.message : 'Live candles unavailable.';
            }
            publishProgress(Object.keys(reports).length + Object.keys(errors).length);
          }
        };
        await Promise.all([worker(), worker()]);
        if (controller.signal.aborted) return;
        if (paused) for (let i = cursor; i < instruments.length; i++) errors[instruments[i].instrumentKey] = 'Market-data service paused. Retry later.';
        const next = { ...scansRef.current, [frame]: { reports, errors, running: false, finishedAt: Date.now() } };
        scansRef.current = next;
        setScans(next);
        saveScans(scope, next);
        // The first scan establishes a baseline. Only newly confirmed signals
        // produce alerts; the same signal is never sent twice after reopening.
        try {
          const key = seenKey(scope, frame);
          const stored = localStorage.getItem(key);
          const seen = new Set<string>(stored ? JSON.parse(stored) as string[] : []);
          const fresh: Array<{ instrument: Instrument; row: TodayDivergence; id: string }> = [];
          for (const instrument of instruments) for (const row of reports[instrument.instrumentKey]?.rows ?? []) {
            const id = `${instrument.instrumentKey}:${frame}:${row.id}`;
            if (!seen.has(id) && stored !== null) fresh.push({ instrument, row, id });
            seen.add(id);
          }
          localStorage.setItem(key, JSON.stringify([...seen]));
          for (const { instrument, row } of fresh) await notifyDivergence(instrument, frame, row);
        } catch { /* Missing storage must not prevent displaying the scan. */ }
        if (paused) break;
      }
    } finally { if (controllerRef.current === controller) controllerRef.current = null; }
  }, [instruments, inputs, scope]);
  useEffect(() => {
    if (!active || !instruments.length) return;
    const tick = () => {
      if (!getNseMarketStatus().isOpen || controllerRef.current || Date.now() - lastCycleRef.current < 5 * 60_000) return;
      lastCycleRef.current = Date.now();
      void startScan(TRADING_TIMEFRAMES);
    };
    tick();
    const timer = setInterval(tick, 60_000);
    return () => clearInterval(timer);
  }, [active, instruments.length, startScan]);
  const enableAlerts = async () => {
    if (Capacitor.getPlatform() === 'android') {
      const result = await getNativeTradeAlert().requestPermission().catch(() => ({ granted: false }));
      setAlertPermission(result?.granted !== false);
    } else if ('Notification' in window) {
      setAlertPermission((Notification.permission === 'default' ? await Notification.requestPermission() : Notification.permission) === 'granted');
    }
  };
  const current = scans[timeframe];
  const rows = useMemo(() => {
    const map = new Map(instruments.map(item => [item.instrumentKey, item]));
    return Object.values(current?.reports ?? {}).flatMap(report => report.rows.map(row => ({ ...row, instrument: map.get(report.instrumentKey)! }))).sort((a, b) => b.confirmedTime - a.confirmedTime);
  }, [current, instruments]);
  const filtered = rows.filter(row => !search.trim() || `${row.instrument.symbol} ${row.instrument.name}`.toLowerCase().includes(search.trim().toLowerCase()));
  const pageKey = `${timeframe}:${search}`;
  const [pagination, setPagination] = useState({ key: '', limit: 60 });
  const limit = pagination.key === pageKey ? pagination.limit : 60;
  const done = Object.keys(current?.reports ?? {}).length, failures = Object.keys(current?.errors ?? {}).length;
  const scanning = Object.values(scans).some(scan => scan?.running);
  return <>
    <div className="tw-frame-summary" aria-label="Timeframes and signal counts">{TRADING_TIMEFRAMES.map(frame => {
      const scan = scans[frame];
      const count = scan ? Object.values(scan.reports).reduce((total, report) => total + report.rows.length, 0) : null;
      const status = scan?.running ? `Scanning ${scan.progress ?? 0}/${instruments.length}` : scan ? `${Object.keys(scan.reports).length}/${instruments.length} stocks scanned` : "Not scanned";
      return <button type="button" key={frame} onClick={() => setTimeframe(frame)} aria-pressed={frame === timeframe} aria-label={`${frame}: ${count ?? "not scanned"}${count !== null ? " signals" : ""}. ${status}`} title={status}><b>{frame}</b><span>{scan?.running ? "Scanning…" : count === null ? "—" : `${count} signals`}</span></button>;
    })}</div>
    <div className="tw-actions"><button onClick={() => void startScan([timeframe])} disabled={scanning || !instruments.length}><RefreshCw size={14} /> Refresh {timeframe}</button><button onClick={() => void startScan(TRADING_TIMEFRAMES)} disabled={scanning || !instruments.length}>Scan all</button>
      <details className="tw-options"><summary>Options</summary><div><span>RSI {inputs.length} · swings {inputs.left} / {inputs.left}</span><p>Scans refresh while this view is open during NSE trading hours. New signals appear in alerts.</p>{!alertPermission && <button onClick={() => void enableAlerts()}>Enable phone alerts</button>}</div></details>
    </div>
    <div className="tw-progress" role="status">{current?.running ? `Scanning ${current.progress ?? 0}/${instruments.length}` : current ? `${done}/${instruments.length} scanned · ${new Date(current.finishedAt ?? Date.now()).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' })} IST` : "Choose Refresh to check for signals"}</div>
    {failures > 0 && <details className="tw-errors"><summary>{failures} stocks unavailable</summary>{Object.entries(current!.errors).slice(0, 10).map(([key, message]) => <p key={key}>{instruments.find(item => item.instrumentKey === key)?.symbol}: {message}</p>)}</details>}
    <div className="tw-rows">{filtered.slice(0, limit).map(row => <button key={`${row.instrument.instrumentKey}:${row.id}`} className="tw-row" onClick={() => onOpen(row.instrument, timeframe, row.secondTime)} aria-label={`Open ${row.instrument.symbol} ${timeframe} divergence chart`}>
      <div className="tw-row-title"><b>{row.instrument.symbol}</b><span className="tw-badge">{row.side === 'long' ? 'Bullish' : 'Bearish'}</span><ChevronRight size={14} /></div>
      <small>{timeframe} · Confirmed {when(row.confirmedTime)} IST · Tap to review chart</small>
    </button>)}</div>
    {filtered.length > limit && <button className="tw-more" onClick={() => setPagination({ key: pageKey, limit: limit + 60 })}>Show more divergences</button>}
    {!filtered.length && done > 0 && !current?.running && <p className="tw-empty">No signals in this scan.</p>}
  </>;
}
