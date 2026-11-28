"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Clock3, RefreshCw } from "lucide-react";
import { MCX_SPREAD_PRODUCTS } from "@/lib/mcx-spread-chain";
import { loadCryptoOptionRoots, loadSpreadChain, loadSpreadSeries, loadSpreadUnderlyings, loadTokenOptionRoots, type SpreadMarket } from "@/lib/spread-chain-client";
import { BasketWorkspace, type BasketDraft } from "./BasketWorkspace";
import type { BuilderContext } from "@/lib/option-builder-context";

const marketLabels = { india: "Indian F&O", crypto: "Crypto", metals: "Gold & Silver", tokens: "Delta Tokens" };
const marketShortLabels = { india: "Indian F&O", crypto: "Crypto", metals: "Metals", tokens: "Tokens" };
const sources = { india: "NSE via Upstox", crypto: "Delta Exchange India", metals: "MCX via Upstox", tokens: "Delta Exchange India" };
const cryptoNames: Record<string,string> = { BTC: "BTC · Bitcoin", ETH: "ETH · Ethereum" };
const metals = Object.entries(MCX_SPREAD_PRODUCTS).map(([id, product]) => ({ id, label: `${id} · ${product.label}` }));
const dateFormat = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const timeFormat = new Intl.DateTimeFormat("en-IN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" });
const shortDate = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "2-digit", timeZone: "UTC" });

function useResource<T>(key: string, refresh: number, loader: (signal: AbortSignal) => Promise<T>) {
  const [state, setState] = useState<{ key: string; refresh: number; data?: T; error?: string; asOf?: number }>();
  useEffect(() => {
    if (!key) return;
    const controller = new AbortController();
    void loader(controller.signal).then(data => {
      if (!controller.signal.aborted) setState({ key, refresh, data, asOf: Date.now() });
    }).catch(error => {
      if (!controller.signal.aborted) setState(previous => ({
        key, refresh, ...(previous?.key === key ? { data: previous.data, asOf: previous.asOf } : {}),
        error: error instanceof Error ? error.message : "The option feed is unavailable.",
      }));
    });
    return () => controller.abort();
  }, [key, refresh, loader]);
  const current = state?.key === key ? state : undefined;
  return { data: current?.data, error: current?.error, asOf: current?.asOf, loading: Boolean(key && current?.refresh !== refresh) };
}

export function OptionSpreadBuilder({ initialMarket, initialRoot, initialExpiry, initialContract, initialStrike, initialKind, embedded = false }: BuilderContext & { embedded?: boolean }) {
  const [market, setMarket] = useState<SpreadMarket>(initialMarket);
  const [requestedRoot, setRoot] = useState(initialRoot);
  const [seriesReload, retrySeries] = useState(0);
  const [chainReload, reloadChain] = useState(0);
  const [requestedSeries, setSeries] = useState(initialExpiry);
  const drafts = useRef(new Map<string, BasketDraft>());
  const expiryStrip = useRef<HTMLDivElement>(null);
  const india = useResource(market === "india" ? "india" : "", seriesReload, loadSpreadUnderlyings);
  const tokens = useResource(market === "tokens" ? "tokens" : "", seriesReload, loadTokenOptionRoots);
  const crypto = useResource(market === "crypto" ? "crypto" : "", seriesReload, loadCryptoOptionRoots);
  const choices = market === "india" ? (india.data ?? []).map(item => ({
    id: item.instrumentKey,
    label: !item.name || item.name.toLowerCase() === item.symbol.toLowerCase() ? item.symbol : `${item.symbol} · ${item.name}`,
  }))
    : market === "tokens" ? (tokens.data ?? []).map(id => ({ id, label: id === "XAUT" ? "XAUT · Tether Gold" : id }))
    : market === "crypto" ? (crypto.data ?? []).map(id => ({id, label: cryptoNames[id] ?? id})) : metals;
  const root = requestedRoot ? choices.find(item => item.id === requestedRoot)?.id
    ?? india.data?.find(item => market === "india" && item.symbol === requestedRoot)?.instrumentKey ?? ""
    : choices.find(item => item.id === "NSE_INDEX|Nifty 50")?.id ?? choices[0]?.id ?? "";
  const underlying = india.data?.find(item => item.instrumentKey === root);
  const loadSeries = useMemo(() => (signal: AbortSignal) => loadSpreadSeries(market, root, underlying, signal), [market, root, underlying]);
  const marketKey = root ? `${market}:${root}` : "";
  const series = useResource(marketKey, seriesReload, loadSeries);
  const dateMatches = series.data?.filter(item => item.expiry === requestedSeries);
  const expiry = requestedSeries ? series.data?.find(item => item.id === requestedSeries) ?? (dateMatches?.length === 1 ? dateMatches[0] : undefined) : series.data?.[0];
  useEffect(() => {
    const strip = expiryStrip.current, active = strip?.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (strip && active) strip.scrollLeft += active.getBoundingClientRect().left - strip.getBoundingClientRect().left - (strip.clientWidth - active.offsetWidth) / 2;
  }, [expiry?.id]);
  const loadChain = useMemo(() => (signal: AbortSignal) => loadSpreadChain(market, root, underlying, expiry?.id ?? "", signal),
    [market, root, underlying, expiry?.id]);
  const chainKey = expiry ? `${marketKey}:${expiry.id}` : "";
  const chain = useResource(chainKey, chainReload, loadChain);
  useEffect(() => {
    if (!chainKey) return;
    const update = () => { if (document.visibilityState === "visible") reloadChain(count => count + 1); };
    const timer = window.setInterval(update, 20_000);
    document.addEventListener("visibilitychange", update);
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", update); };
  }, [chainKey]);
  const isDelta = market === "crypto" || market === "tokens";
  const currency = isDelta ? "USD" : "INR";
  const metal = market === "metals" ? MCX_SPREAD_PRODUCTS[root as keyof typeof MCX_SPREAD_PRODUCTS] : undefined;
  const error = india.error ?? tokens.error ?? crypto.error ?? series.error ?? chain.error;
  const loading = india.loading || tokens.loading || crypto.loading || series.loading || chain.loading;

  const expiryAt = expiry && (isDelta ? Date.parse(expiry.id) : market === "india" ? Date.parse(expiry.expiry + "T15:30:00+05:30") : undefined);
  const minutes = expiryAt && chain.asOf ? Math.max(0, Math.ceil((expiryAt - chain.asOf) / 60_000)) : 0;
  const seeded = market === initialMarket && requestedRoot === initialRoot && requestedSeries === initialExpiry;
  return <div className={`spread-builder${embedded ? " spread-builder-embedded" : ""}`}>
    <header className="spread-top">
      {!embedded && <div><Link className="spread-back" href="/">← PaperTrade IN</Link>
        <h1>Option Strategy Builder</h1></div>}
      <div className="spread-market" role="group" aria-label="Market">
        {(Object.keys(marketLabels) as SpreadMarket[]).map(value => <button type="button" key={value}
          title={marketLabels[value]} aria-label={marketLabels[value]} aria-pressed={market === value}
          onClick={() => { if (market !== value) { setMarket(value); setRoot(""); setSeries(""); } }}>{marketShortLabels[value]}</button>)}
      </div>
    </header>

    <div className="desk-feed-block">
    <section className="spread-card desk-feed" aria-label="Option chain filters">
      <label>Underlying
        <select aria-label="Underlying" value={root} disabled={!choices.length} onChange={event => { setRoot(event.target.value); setSeries(""); }}>
          {!root && <option value="">Choose underlying</option>}
          {choices.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
        </select>
      </label>
      <div className="desk-feed-reference"><small>{market === "metals" ? "Underlying future" : "Underlying price"}</small>
        <strong>{chain.data?.reference ? formatter(currency).format(chain.data.reference) : "—"}</strong></div>
      <div className="desk-feed-source"><strong>{sources[market]}</strong><small>{chain.asOf ? `Updated ${timeFormat.format(chain.asOf)} IST` : "Awaiting quotes"}</small></div>
      <button type="button" className="spread-refresh" title="Refresh quotes" aria-label="Refresh quotes" onClick={() => {
        if (error || !expiry) retrySeries(value => value + 1);
        reloadChain(value => value + 1);
      }} disabled={loading}><RefreshCw size={17} aria-hidden="true" /></button>
      <div className="desk-expiries">
        <div className="desk-expiry-heading"><strong>Expiry</strong>{expiryAt && chain.asOf ? <span><Clock3 size={12}/>{minutes ? `${Math.floor(minutes/1440)}d ${Math.floor(minutes%1440/60)}h ${minutes%60}m` : "Expired"}</span> : metal ? <span>{metal.unit}</span> : null}</div>
        <div className="desk-expiry-strip" ref={expiryStrip} role="group" aria-label="Option expiry">
          {series.data?.map(item => <button type="button" key={item.id} aria-pressed={item.id === expiry?.id}
            title={dateFormat.format(Date.parse(item.expiry)) + (isDelta ? ` · ${timeFormat.format(Date.parse(item.id))} IST` : item.detail ? " · " + item.detail : "")}
            onClick={() => setSeries(item.id)}>{shortDate.format(Date.parse(item.expiry))}{item.detail && <small>{item.detail}</small>}</button>)}
          {!series.data?.length && <span>{series.loading ? "Loading expiries…" : "No expiries available"}</span>}
        </div>
      </div>
    </section>

    {error && !loading && <p className="spread-message" role="alert">{error}</p>}
    {chain.loading && !chain.data && <p className="spread-message" role="status">Loading option chain…</p>}
    {!loading && !error && (!expiry || !chain.data?.contracts.length) &&
      <p className="spread-message" role="status">{(!root && requestedRoot && choices.length) ? "This chart’s underlying is no longer listed. Choose another underlying." :
        (requestedSeries && series.data?.length && !expiry) ? "This chart’s expiry is unavailable. Choose a listed expiry." : "No listed options"}</p>}
    {chain.data?.quoteWarning && !chain.error && <p className="spread-message" role="status">{chain.data.quoteWarning}</p>}
    </div>
    {!!chain.data?.contracts.length && <BasketWorkspace key={chainKey} chain={chain.data} currency={currency} market={market}
      root={root} rootLabel={underlying?.symbol ?? root} expiry={expiry!.id} dataReady={!chain.error && !chain.data.quoteWarning}
      expiryAt={expiryAt} asOf={chain.asOf!} draft={drafts.current.get(chainKey)} onDraft={draft => drafts.current.set(chainKey, draft)}
      initialContract={seeded ? initialContract : undefined} initialStrike={seeded ? initialStrike : undefined} initialKind={seeded ? initialKind : undefined} />}
  </div>;
}

function formatter(currency: "INR" | "USD") {
  return new Intl.NumberFormat(currency === "INR" ? "en-IN" : "en-US", { style: "currency", currency, maximumFractionDigits: currency === "USD" ? 6 : 2 });
}
