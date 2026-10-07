"use client";
import { useEffect, useMemo, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { ModernSelect } from './ModernSelect';
import { oiSummary, type GiftSnapshot } from '@/lib/home-derivatives';
import type { FnoUnderlying, OptionChainRow } from '@/lib/fno';
import { vixBand, type IndiaVix } from '@/lib/india-pulse';
const defaults: FnoUnderlying[] = [
  { symbol: 'NIFTY', name: 'Nifty 50', instrumentKey: 'NSE_INDEX|Nifty 50', underlyingType: 'INDEX', optionContracts: 1, futureContracts: 0 },
  { symbol: 'BANKNIFTY', name: 'Bank Nifty', instrumentKey: 'NSE_INDEX|Nifty Bank', underlyingType: 'INDEX', optionContracts: 1, futureContracts: 0 },
  { symbol: 'FINNIFTY', name: 'Fin Nifty', instrumentKey: 'NSE_INDEX|Nifty Fin Service', underlyingType: 'INDEX', optionContracts: 1, futureContracts: 0 },
];
const number = (n: number | null | undefined, compact = false) => typeof n === 'number' && Number.isFinite(n) ? n.toLocaleString('en-IN', { maximumFractionDigits: 2, ...(compact ? { notation: 'compact' as const } : {}) }) : '—';
const time = (iso: string) => new Date(iso).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

function OpenInterestChart({ rows, change }: { rows: ReturnType<typeof oiSummary>['strikes']; change: boolean }) {
  const width = Math.max(440, rows.length * 42 + 52), height = 180;
  const values = rows.flatMap(row => [row.call[change ? 'change' : 'oi'], row.put[change ? 'change' : 'oi']]);
  const max = Math.max(1, ...values.map(value => Math.abs(value ?? 0)));
  const negative = change && values.some(value => value !== null && value < 0);
  const base = negative ? 76 : 134, scale = (negative ? 62 : 110) / max;
  return <div className="home-oi-chart-scroll"><svg viewBox={`0 0 ${width} ${height}`} style={{ minWidth: width }} role="img" aria-label={change ? 'Call and put change in open interest by strike' : 'Call and put open interest by strike'}>
    {[0, .5, 1].map(f => <g key={f}><line x1="36" x2={width-8} y1={base-max*scale*f} y2={base-max*scale*f} className="home-oi-grid"/><text x="32" y={base-max*scale*f+3} textAnchor="end">{number(max*f,true)}</text></g>)}
    {negative && <text x="32" y={base+max*scale+3} textAnchor="end">−{number(max,true)}</text>}
    {rows.map((row,i) => <g key={row.strike}>{(['call','put'] as const).map((side,j) => {
      const value = row[side][change ? 'change' : 'oi'], x = 44 + i*((width-52)/Math.max(1,rows.length)) + j*12;
      return value === null ? null : <rect key={side} x={x} y={value >= 0 ? base-value*scale : base} width="10" height={Math.max(0,Math.abs(value)*scale)} rx="2" className={`home-oi-bar ${side}`}><title>{row.strike} · {side === 'call' ? 'Call' : 'Put'} {change ? 'OI change' : 'OI'}: {number(value)}</title></rect>;
    })}<text transform={`translate(${52+i*((width-52)/Math.max(1,rows.length))},${height-7}) rotate(-45)`} textAnchor="start">{number(row.strike)}</text></g>)}
  </svg></div>;
}

export function HomeDerivatives({ onOpenStock }: { onOpenStock: (symbol: string) => void }) {
  const [catalogue, setCatalogue] = useState<FnoUnderlying[]>(defaults);
  const [selected, setSelected] = useState(defaults[0].instrumentKey);
  const [expiry, setExpiry] = useState('');
  const [expiries, setExpiries] = useState<string[]>([]);
  const [rows, setRows] = useState<OptionChainRow[]>([]);
  const [state, setState] = useState<'loading'|'ready'|'error'>('loading');
  const [asOf, setAsOf] = useState('');
  const [change, setChange] = useState(false);
  const [gift, setGift] = useState<GiftSnapshot | null>(null);
  const [vix, setVix] = useState<IndiaVix | null>(null);
  const [vixTime, setVixTime] = useState('');
  const underlying = catalogue.find(item => item.instrumentKey === selected) ?? defaults[0];
  const future = catalogue.find(item => item.symbol === 'NIFTY')?.futures?.find(item => item.expiry >= new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }));
  const futureKey = future?.instrumentKey ?? '';
  const futureClose = gift?.futureKey === futureKey ? gift?.futureClose : null;
  useEffect(() => {
    const controller = new AbortController();
    void fetch('/api/upstox/fno-underlyings', { signal: controller.signal }).then(r => r.json()).then(p => { if (!controller.signal.aborted && p.ok && p.underlyings?.length) setCatalogue(p.underlyings.filter((r: FnoUnderlying) => r.optionContracts > 0)); }).catch(() => {});
    return () => controller.abort();
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    let busy = false;
    const refresh = async () => {
      if (busy || document.visibilityState === 'hidden') return;
      busy = true;
      try {
        const results = await Promise.allSettled([
          fetch(`/api/market/gift-nifty?${new URLSearchParams(futureKey ? { futureKey } : {})}`, { signal: controller.signal, cache: 'no-store' }).then(r => r.json()),
          fetch('/api/market/india-pulse', { signal: controller.signal, cache: 'no-store' }).then(r => r.json()),
        ]);
        if (controller.signal.aborted) return;
        const g = results[0], v = results[1];
        setGift(g.status === 'fulfilled' && g.value.ok ? { ...g.value, futureKey } : null);
        setVix(v.status === 'fulfilled' && v.value.ok ? v.value.vix ?? null : null);
        setVixTime(v.status === 'fulfilled' && v.value.vixCheckedAt ? new Date(v.value.vixCheckedAt).toISOString() : '');
      } finally { busy = false; }
    };
    void refresh(); const timer = window.setInterval(() => void refresh(), 60_000);
    return () => { controller.abort(); window.clearInterval(timer); };
  }, [futureKey]);
  useEffect(() => {
    const controller = new AbortController();
    let busy = false;
    const refresh = async () => {
      if (busy || document.visibilityState === 'hidden') return;
      busy = true;
      try {
        const params = new URLSearchParams({ instrumentKey: selected });
        let active = expiry;
        if (active && active < new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })) { setExpiry(''); setExpiries([]); setRows([]); setAsOf(''); setState('loading'); return; }
        if (!active) {
          const list = await fetch(`/api/upstox/option-chain?${params}`, { signal: controller.signal }).then(r => r.json());
          if (!list.ok || !list.expiries?.length) throw Error();
          const available = list.expiries.filter((d: string) => d >= new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }));
          if (!available.length) throw Error();
          if (controller.signal.aborted) return;
          setExpiries(available); active = available[0]; setExpiry(active); return;
        }
        params.set('expiry', active);
        const p = await fetch(`/api/upstox/option-chain?${params}`, { signal: controller.signal, cache: 'no-store' }).then(r => r.json());
        if (!p.ok || !Array.isArray(p.rows) || !p.rows.length) throw Error();
        if (!controller.signal.aborted) { setRows(p.rows); setAsOf(p.fetchedAt || new Date().toISOString()); setState('ready'); }
      } catch { if (!controller.signal.aborted) { setRows([]); setState('error'); } }
      finally { busy = false; }
    };
    void refresh(); const timer = window.setInterval(() => void refresh(), 60_000);
    return () => { controller.abort(); window.clearInterval(timer); };
  }, [selected, expiry]);
  const summary = useMemo(() => oiSummary(rows), [rows]);
  const spot = rows.find(row => row.underlyingSpotPrice > 0)?.underlyingSpotPrice ?? null;
  const visible = useMemo(() => {
    if (summary.strikes.length <= 13) return summary.strikes;
    const atm = summary.strikes.reduce((best,row,i,all) => Math.abs(row.strike-(spot ?? 0)) < Math.abs(all[best].strike-(spot ?? 0)) ? i : best,0);
    const start = Math.max(0,Math.min(summary.strikes.length-13,atm-6));
    return summary.strikes.slice(start,start+13);
  }, [summary,spot]);
  const chartAvailable = visible.some(row => row.call[change ? 'change' : 'oi'] !== null || row.put[change ? 'change' : 'oi'] !== null);
  const difference = gift?.gift && futureClose ? gift.gift.price-futureClose.price : null;
  const direction = difference === null || difference === 0 ? '' : difference > 0 ? 'positive' : 'negative';
  return <div className="home-derivatives">
    <section className="home-section home-gift-card" aria-label="GIFT NIFTY and Nifty futures close">
      <div><b>GIFT NIFTY</b><strong>{number(gift?.gift?.price)}</strong><small>{gift?.gift ? `${time(gift.gift.asOf)} IST · 2 min delayed` : 'Quote unavailable'}</small></div>
      <div><b>{future?.tradingSymbol ?? 'NIFTY futures'}</b><strong>{number(futureClose?.price)}</strong><small>{futureClose ? `Session close · ${futureClose.date}` : 'Completed close unavailable'}</small></div>
      <div className={`home-gift-difference ${direction}`}><strong>{difference === null ? '—' : `${number(Math.abs(difference))} pts ${difference > 0 ? 'above' : difference < 0 ? 'below' : 'at'}`}</strong><small>NIFTY futures close</small></div>
    </section>
    <section className="home-section home-option-pulse" aria-label="Options open interest analysis">
      <header><ModernSelect label="Instrument" hideLabel ariaLabel="OI instrument" value={selected} choices={catalogue.map(r => ({ value: r.instrumentKey, label: r.symbol, description: r.name }))} onChange={key => { setSelected(key); setExpiry(''); setExpiries([]); setRows([]); setAsOf(''); setState('loading'); }}/><ModernSelect label="Expiry" hideLabel ariaLabel="OI expiry" value={expiry} disabled={!expiries.length} choices={expiries.map(d => ({ value: d, label: d }))} onChange={value => { setExpiry(value); setRows([]); setAsOf(''); setState('loading'); }}/><button className="home-oi-open" onClick={() => onOpenStock(underlying.symbol)} aria-label={`Open ${underlying.symbol} chart`}><ChevronRight size={18}/></button></header>
      <div className="home-derivative-metrics"><div><small>PCR</small><b>{number(summary.pcr)}</b></div><div><small>India VIX</small><b>{number(vix?.price)}</b>{vix && <small className={vix.changePercent >= 0 ? 'positive' : 'negative'}>{vix.changePercent > 0 ? '+' : ''}{number(vix.changePercent)}%</small>}</div><div><small>Call OI</small><b>{number(summary.callOi,true)}</b></div><div><small>Put OI</small><b>{number(summary.putOi,true)}</b></div></div>
      <div className="home-oi-tabs" role="tablist" aria-label="Open interest display"><button role="tab" aria-selected={!change} onClick={() => setChange(false)}>OI</button><button role="tab" aria-selected={change} onClick={() => setChange(true)}>Change in OI</button><small>{spot === null ? '' : `${underlying.symbol} ${number(spot)}`}</small></div>
      {state === 'ready' && chartAvailable ? <OpenInterestChart rows={visible} change={change}/> : <div className="home-oi-empty" role="status">{state === 'loading' ? 'Loading option chain…' : state === 'ready' ? `${change ? 'Change in OI' : 'OI'} unavailable for this chain.` : 'Option-chain data unavailable. Retrying automatically.'}</div>}
      <div className="home-oi-legend"><span><i className="call"/>Call {change ? `Δ ${number(summary.callChange,true)}` : 'OI'}</span><span><i className="put"/>Put {change ? `Δ ${number(summary.putChange,true)}` : 'OI'}</span></div>
      <footer>{asOf ? `OI checked ${time(asOf)} IST` : 'Upstox option chain'}{vixTime ? ` · VIX checked ${time(vixTime)} IST` : ''}<details><summary>Data details</summary><p>PCR = total put OI ÷ total call OI for the selected expiry. Change in OI compares with the provider’s previous OI; missing values remain unavailable. Chart shows nearby strikes; totals cover the full chain. India VIX describes expected 30-day volatility for the broader market, not the selected stock. {vix ? `VIX ${vixBand(vix.price).label}; change ${number(vix.change)} (${number(vix.changePercent)}%). ` : ''}VIX source: Moneycontrol. GIFT NIFTY has a 120-second Upstox delay and is an indication, not a prediction of the next open.</p></details></footer>
    </section>
  </div>;
}
