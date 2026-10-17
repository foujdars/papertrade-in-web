"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { useNseSession } from './useNseSession';
import { getNseMarketStatus } from '@/lib/market-hours';
import { fetchAlgoHistory, fetchAlgoQuotes, type AlgoQuote } from '@/lib/algo-market-data';
import { advanceAlgoPaperSession, createAlgoPaperSession, pauseAlgoPaperSession, resumeAlgoPaperSession, restoreAlgoPaperSession, stopAlgoPaperSession, type AlgoPaperSession, type PaperPlan } from '@/lib/algo-paper';
import { algoPaperSignalReady, type AlgoPaperSignal } from '@/lib/algo-paper-signal';
import type { Candle } from '@/lib/market';

const demoStart = (plan: PaperPlan) => Date.parse(`2026-10-16T${plan.entryTime}:00+05:30`);
function demoQuotes(plan: PaperPlan, cursor: number, now: number): Record<string, AlgoQuote> {
  const keys = [...new Set(plan.legs.map(leg => leg.instrumentKey))];
  return Object.fromEntries(keys.map((instrumentKey, i) => {
    const base = 100 + i * 20;
    const path = Math.sin(cursor / 3 + i) * 3 + cursor * (i % 2 === 0 ? .32 : -.25);
    return [instrumentKey, { instrumentKey, price: Math.max(1, base + path), observedAt: now, tradedAt: now }];
  }));
}
const validSignal = (value: unknown): value is AlgoPaperSignal => {
  if (!value || typeof value !== 'object') return false;
  const s = value as AlgoPaperSignal;
  return typeof s.instrumentKey === 'string' && Number.isInteger(s.fast) && Number.isInteger(s.slow) && s.fast >= 2 && s.slow > s.fast && s.slow <= 200 && ['bullish', 'bearish'].includes(s.direction) && ['1m', '5m', '15m'].includes(s.timeframe);
};

export function useAlgoPaperSession(ownerId: string) {
  const [session, setSession] = useState<AlgoPaperSession | null>(null);
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const current = useRef<AlgoPaperSession | null>(null);
  const signalConfig = useRef<AlgoPaperSignal | undefined>(undefined);
  const generation = useRef(0), writer = useRef('');
  const signalHistory = useRef<{key:string;at:number;bars:Candle[]} | null>(null);
  const exchange = useNseSession();
  const exchangeRef = useRef(exchange);
  useEffect(() => { exchangeRef.current = exchange; }, [exchange]);
  const key = `papertrade-algo-run-v1:${ownerId}`, leaseKey = `${key}:writer`;
  const ownsLease = useCallback(() => {
    try { return localStorage.getItem(leaseKey) === writer.current; }
    catch { return true; } // With storage disabled, this is an unsaved, tab-local run.
  }, [leaseKey]);

  const save = useCallback((next: AlgoPaperSession | null) => {
    current.current = next; setSession(next);
    try { if (ownsLease()) { if (next) localStorage.setItem(key, JSON.stringify({ session: next, signal: signalConfig.current })); else localStorage.removeItem(key); } }
    catch { setNotice('This browser cannot save the run. Keep this page open to retain its results.'); }
  }, [key, ownsLease]);

  useEffect(() => {
    writer.current = crypto.randomUUID();
    signalConfig.current = undefined; signalHistory.current = null;
    let disposed = false;
    let restored: AlgoPaperSession | null = null;
    try {
      const stored = JSON.parse(localStorage.getItem(key) ?? 'null');
      if (stored) {
        restored = restoreAlgoPaperSession(stored.session);
        if (stored.signal && !validSignal(stored.signal)) restored = null;
        signalConfig.current = stored.signal;
      }
    } catch { /* A corrupt saved run is never executed. */ }
    queueMicrotask(() => { if (!disposed) { current.current = restored; setSession(restored); setLoading(false); } });
    return () => { disposed = true; };
  }, [key]);

  const pause = useCallback(() => {
    generation.current++;
    if (current.current) save(pauseAlgoPaperSession(current.current, Date.now()));
  }, [save]);

  useEffect(() => {
    const suspend = () => {
      generation.current++;
      if (current.current && ['running', 'stopping'].includes(current.current.status)) save(pauseAlgoPaperSession(current.current, Date.now(), 'Paused while this workspace is inactive. Resume to continue monitoring and simulated fills.'));
    };
    const hidden = () => { if (document.hidden) suspend(); };
    const otherTab = (event: StorageEvent) => {
      if (event.key !== leaseKey || !event.newValue || event.newValue === writer.current) return;
      try { if (localStorage.getItem(leaseKey) === writer.current) return; } catch { /* Suspend if ownership is uncertain. */ }
      if (current.current && ['running', 'stopping'].includes(current.current.status)) {
        generation.current++;
        const paused = pauseAlgoPaperSession(current.current, Date.now(), 'Paused because another tab took control of the paper runner.');
        current.current = paused; setSession(paused); // Do not overwrite the other tab's saved run.
      }
    };
    document.addEventListener('visibilitychange', hidden);
    window.addEventListener('pagehide', suspend);
    window.addEventListener('storage', otherTab);
    let disposed = false, native: { remove: () => Promise<void> } | undefined;
    if (Capacitor.isNativePlatform()) void App.addListener('appStateChange', ({ isActive }) => { if (!isActive) suspend(); }).then(listener => { if (disposed) void listener.remove(); else native = listener; });
    return () => {
      disposed = true; suspend(); if (native) void native.remove();
      document.removeEventListener('visibilitychange', hidden); window.removeEventListener('pagehide', suspend); window.removeEventListener('storage', otherTab);
    };
  }, [save, leaseKey]);

  useEffect(() => {
    if (loading) return;
    const controller = new AbortController(); let pending = false;
    const tick = async () => {
      const snapshot = current.current;
      if (pending || document.hidden || !ownsLease() || !snapshot || !['running', 'stopping'].includes(snapshot.status)) return;
      const token = generation.current; pending = true;
      try {
        let now = Date.now(), quotes: Record<string, AlgoQuote>, signalReady = !signalConfig.current;
        if (snapshot.mode === 'demo') {
          now = demoStart(snapshot.plan) + snapshot.cursor * 60_000;
          quotes = demoQuotes(snapshot.plan, snapshot.cursor, now);
          // Demo's entry is intentionally scheduled; broker EMA signals belong to market mode.
          signalReady = true;
        } else {
          if (!getNseMarketStatus(new Date(now), exchangeRef.current).isOpen) {
            if (token === generation.current && ownsLease()) save(advanceAlgoPaperSession(snapshot, {}, now, { marketOpen: false, signalReady: false }));
            return;
          }
          quotes = await fetchAlgoQuotes(snapshot.plan.legs.map(leg => leg.instrumentKey), AbortSignal.any([controller.signal, AbortSignal.timeout(10_000)]), now);
          if (signalConfig.current && !snapshot.positions.length) {
            const config = signalConfig.current, cache = signalHistory.current, cacheKey = JSON.stringify(config);
            let bars = cache?.key === cacheKey && Date.now() - cache.at < 10_000 ? cache.bars : null;
            if (!bars) {
              const history = await fetchAlgoHistory([config.instrumentKey], config.timeframe, undefined, AbortSignal.any([controller.signal, AbortSignal.timeout(15_000)]));
              bars = history[config.instrumentKey]; signalHistory.current = { key: cacheKey, at: Date.now(), bars };
            }
            signalReady = algoPaperSignalReady(bars, config, Date.now());
          }
          now = Date.now();
        }
        if (controller.signal.aborted || token !== generation.current || !ownsLease() || current.current?.id !== snapshot.id) return;
        const next = advanceAlgoPaperSession(snapshot, quotes, now, { marketOpen: true, signalReady });
        next.cursor = snapshot.cursor + 1;
        save(next); setNotice('');
      } catch (error) {
        if (!controller.signal.aborted && token === generation.current) setNotice(error instanceof Error ? error.message : 'Market data unavailable. No simulated fill was made.');
      } finally { pending = false; }
    };
    const interval = window.setInterval(() => void tick(), session?.mode === 'demo' ? 1000 : 3000);
    void tick();
    return () => { controller.abort(); window.clearInterval(interval); };
  }, [loading, save, session?.mode, ownsLease]);

  const start = useCallback((plan: PaperPlan, mode: 'demo' | 'market', entrySignal?: AlgoPaperSignal) => {
    try {
      if (current.current?.positions.length || (current.current && ['running', 'stopping'].includes(current.current.status))) throw new Error('Stop and close the current paper run before starting another.');
      if (!ownsLease()) {
        let stored: { session?: AlgoPaperSession } | null = null;
        try { stored = JSON.parse(localStorage.getItem(key) ?? 'null'); } catch { /* Unavailable storage is tab-local. */ }
        if (stored?.session && (stored.session.positions?.length || ['running', 'stopping'].includes(stored.session.status))) throw new Error('Another tab has an active paper run. Resume that saved run here and stop it before starting another.');
      }
      if (mode === 'market' && plan.legs.some(leg => !/^NSE_(?:EQ|FO)\|[A-Za-z0-9]+$/.test(leg.instrumentKey))) throw new Error('Market paper runs support exact NSE equity and option/future contracts. Replace demo legs with market instruments.');
      if (entrySignal && !validSignal(entrySignal)) throw new Error('Choose valid EMA entry settings.');
      generation.current++; signalConfig.current = mode === 'market' ? entrySignal : undefined; signalHistory.current = null;
      const next = createAlgoPaperSession(plan, mode, mode === 'demo' ? demoStart(plan) : Date.now(), crypto.randomUUID());
      try { localStorage.setItem(leaseKey, writer.current); } catch { /* Storage notice is handled by save. */ }
      save(next); setNotice(mode === 'demo' && entrySignal ? 'Demo forward runs use scheduled entry and synthetic prices. Use a historical backtest or market paper run to test EMA entry.' : '');
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Could not start the paper run.'); }
  }, [save, leaseKey, ownsLease, key]);
  const resume = useCallback(() => {
    if (!current.current) return;
    generation.current++;
    try {
      const stored = JSON.parse(localStorage.getItem(key) ?? 'null');
      if (stored?.session) {
        const latest = restoreAlgoPaperSession(stored.session);
        if (!latest || latest.id !== current.current.id || (stored.signal && !validSignal(stored.signal))) {
          setNotice('Another run or an invalid saved run is present. Reopen Algo Trading before taking control.'); return;
        }
        current.current = latest; signalConfig.current = stored.signal; signalHistory.current = null;
      }
    } catch { /* An unsaved run can continue within its original tab. */ }
    try { localStorage.setItem(leaseKey, writer.current); } catch { /* Saving remains best effort. */ }
    save(resumeAlgoPaperSession(current.current, Date.now())); setNotice('');
  }, [save, leaseKey, key]);
  const stop = useCallback(() => {
    if (!ownsLease()) { setNotice('This run is controlled in another tab. Resume here to take control before stopping.'); return; }
    generation.current++; if (current.current) save(stopAlgoPaperSession(current.current, Date.now()));
  }, [save, ownsLease]);
  const reset = useCallback(() => {
    if (current.current?.positions.length) { setNotice('Close all simulated legs before clearing this run.'); return; }
    generation.current++; signalConfig.current = undefined; save(null); setNotice('');
  }, [save]);
  return { session, notice, loading, start, pause, resume, stop, reset };
}
