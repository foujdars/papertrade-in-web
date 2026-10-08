"use client";
import { useEffect, useMemo, useState } from 'react';
import { ChartNoAxesCombined } from 'lucide-react';
import { ModernSelect } from './ModernSelect';
import { OpenInterestChart } from './OpenInterestChart';
import { nearbyOiStrikes, oiLevels } from '@/lib/oi-chart';
import { oiSummary, type GiftSnapshot } from '@/lib/home-derivatives';
import { futureToInstrument, type FnoUnderlying, type OptionChainRow } from '@/lib/fno';
import type { Instrument } from '@/lib/market';
import { vixBand, type IndiaVix } from '@/lib/india-pulse';
const defaults: FnoUnderlying[] = [
  { symbol: 'NIFTY', name: 'Nifty 50', instrumentKey: 'NSE_INDEX|Nifty 50', underlyingType: 'INDEX', optionContracts: 1, futureContracts: 0 },
  { symbol: 'BANKNIFTY', name: 'Bank Nifty', instrumentKey: 'NSE_INDEX|Nifty Bank', underlyingType: 'INDEX', optionContracts: 1, futureContracts: 0 },
  { symbol: 'FINNIFTY', name: 'Fin Nifty', instrumentKey: 'NSE_INDEX|Nifty Fin Service', underlyingType: 'INDEX', optionContracts: 1, futureContracts: 0 },
];
const number = (n: number | null | undefined, compact = false) => typeof n === 'number' && Number.isFinite(n) ? n.toLocaleString('en-IN', { maximumFractionDigits: 2, ...(compact ? { notation: 'compact' as const } : {}) }) : '—';
const time = (iso: string) => new Date(iso).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export function HomeDerivatives({ onOpenStock, onOpenInstrument }: { onOpenStock: (symbol: string) => void; onOpenInstrument?: (instrument: Instrument) => void }) {
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
  const spot = rows.find(row => Number.isFinite(row.underlyingSpotPrice) && row.underlyingSpotPrice > 0)?.underlyingSpotPrice ?? null;
  const visible = useMemo(() => nearbyOiStrikes(summary.strikes, spot), [summary, spot]);
  const levels = useMemo(() => oiLevels(summary.strikes, spot), [summary, spot]);
  const chartAvailable = visible.some(row => row.call[change ? 'change' : 'oi'] !== null || row.put[change ? 'change' : 'oi'] !== null);
  const difference = gift?.gift && futureClose ? gift.gift.price-futureClose.price : null;
  const band = vix && Number.isFinite(vix.price) && vix.price > 0 ? vixBand(vix.price) : null;
  const pcrTone = summary.pcr === null || !Number.isFinite(summary.pcr) ? 'neutral' : summary.pcr > 1 ? 'calm' : summary.pcr < 1 ? 'high' : 'neutral';
  const direction = difference === null || difference === 0 ? '' : difference > 0 ? 'positive' : 'negative';
  return <div className="home-derivatives">
    <section className="home-section home-gift-card" aria-label="GIFT NIFTY and Nifty futures close">
      <button type="button" className="home-gift-quote" aria-label="Open GIFT NIFTY chart" disabled={!onOpenInstrument} title={gift?.gift ? `${time(gift.gift.asOf)} IST · 2 min delayed` : 'Quote unavailable'} onClick={() => onOpenInstrument?.({ symbol: 'GIFT NIFTY', name: 'GIFT NIFTY', instrumentKey: 'GLOBAL_INDEX|SGX NIFTY', exchange: 'GLOBAL', assetType: 'INDEX', categories: [], price: gift?.gift?.price ?? 0, change: 0 })}><b>GIFT NIFTY</b><strong>{number(gift?.gift?.price)}</strong></button>
      <button type="button" className="home-gift-quote" aria-label="Open NIFTY futures chart" disabled={!future || !onOpenInstrument} title={futureClose ? `Session close · ${futureClose.date}` : 'Completed close unavailable'} onClick={() => { const nifty = catalogue.find(item => item.symbol === 'NIFTY'); if (future && nifty) onOpenInstrument?.(futureToInstrument(future, nifty)); }}><b>{future?.tradingSymbol ?? 'NIFTY futures'}</b><strong>{number(futureClose?.price)}</strong></button>
      <div className={`home-gift-difference ${direction}`} role="status"><strong>{difference === null ? '—' : `${number(Math.abs(difference))} pts ${difference > 0 ? 'above' : difference < 0 ? 'below' : 'at'}`}</strong></div>
    </section>
    <section className="home-section home-option-pulse" aria-label="Options open interest analysis">
      <header><ModernSelect label="Instrument" hideLabel ariaLabel="OI instrument" value={selected} choices={catalogue.map(r => ({ value: r.instrumentKey, label: r.symbol, description: r.name }))} onChange={key => { setSelected(key); setExpiry(''); setExpiries([]); setRows([]); setAsOf(''); setState('loading'); }}/><ModernSelect label="Expiry" hideLabel ariaLabel="OI expiry" value={expiry} disabled={!expiries.length} choices={expiries.map(d => ({ value: d, label: d }))} onChange={value => { setExpiry(value); setRows([]); setAsOf(''); setState('loading'); }}/><button className="home-oi-open" onClick={() => onOpenStock(underlying.symbol)} aria-label={`Open ${underlying.symbol} chart`}><ChartNoAxesCombined size={18}/></button></header>
      <div className="home-derivative-metrics"><div className="home-risk-metric" data-tone={pcrTone}><small>PCR</small><b>{number(summary.pcr)}</b></div><div className="home-risk-metric" data-tone={band?.tone ?? "neutral"}><small>India VIX</small><span className="home-vix-value-row"><b>{number(vix?.price)}</b>{vix && <small className={vix.changePercent >= 0 ? 'positive' : 'negative'}>{vix.changePercent > 0 ? '+' : ''}{number(vix.changePercent)}%</small>}</span>{band && <small className="home-vix-band">{band.tone === "high" ? "Fear" : band.label}</small>}</div><div><small>Call OI</small><b>{number(summary.callOi,true)}</b></div><div><small>Put OI</small><b>{number(summary.putOi,true)}</b></div></div>
      <div className="home-oi-tabs" role="tablist" aria-label="Open interest display"><button role="tab" aria-selected={!change} onClick={() => setChange(false)}>OI</button><button role="tab" aria-selected={change} onClick={() => setChange(true)}>Change in OI</button><small>{spot === null ? '' : `${underlying.symbol} ${number(spot)}`}</small></div>
      {state === 'ready' && chartAvailable ? <OpenInterestChart rows={visible} change={change} spot={spot} symbol={underlying.symbol} levels={levels}/> : <div className="home-oi-empty" role="status">{state === 'loading' ? 'Loading option chain…' : state === 'ready' ? `${change ? 'Change in OI' : 'OI'} unavailable for this chain.` : 'Option-chain data unavailable. Retrying automatically.'}</div>}
      <div className="home-oi-legend"><span><i className="call"/>Call {change ? `Δ ${number(summary.callChange,true)}` : 'OI'}</span><span><i className="put"/>Put {change ? `Δ ${number(summary.putChange,true)}` : 'OI'}</span></div>
      <footer><details><summary>Data details</summary><p>{asOf ? `OI checked ${time(asOf)} IST. ` : ''}{vixTime ? `VIX checked ${time(vixTime)} IST. ` : ''}{gift?.gift ? `GIFT checked ${time(gift.gift.asOf)} IST · 2 min delayed. ` : 'GIFT quote unavailable. '}{futureClose ? `Futures session close: ${futureClose.date}. ` : 'Completed futures close unavailable. '}PCR = total put OI ÷ total call OI for the selected expiry. Change in OI compares with the provider’s previous OI; missing values remain unavailable. Chart shows nearby strikes; totals cover the full chain. India VIX describes expected 30-day volatility for the broader market, not the selected stock. {vix ? `VIX ${vixBand(vix.price).label}; change ${number(vix.change)} (${number(vix.changePercent)}%). ` : ''}Card colours: PCR above 1 green, below 1 red, exactly 1 neutral. VIX bands are indicative: Calm below 15; Watch 15–20; Elevated 20–30; Fear at 30 or above. Higher VIX means higher expected volatility, not market direction. VIX source: Moneycontrol. GIFT NIFTY has a 120-second Upstox delay and is an indication, not a prediction of the next open.</p></details></footer>
    </section>
  </div>;
}
