"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import { MCX_SPREAD_PRODUCTS } from "@/lib/mcx-spread-chain";
import { loadSpreadChain, loadSpreadSeries, loadSpreadUnderlyings, loadTokenOptionRoots, type SpreadMarket } from "@/lib/spread-chain-client";
import { BasketWorkspace } from "./BasketWorkspace";

const marketLabels = { india: "Indian F&O", crypto: "Crypto", metals: "Gold & Silver", tokens: "Delta Tokens" };
const marketShortLabels = { india: "Indian F&O", crypto: "Crypto", metals: "Metals", tokens: "Tokens" };
const sources = { india: "NSE via Upstox", crypto: "Delta Exchange India", metals: "MCX via Upstox", tokens: "Delta Exchange India" };
const crypto = [{ id: "BTC", label: "BTC · Bitcoin" }, { id: "ETH", label: "ETH · Ethereum" }];
const metals = Object.entries(MCX_SPREAD_PRODUCTS).map(([id, product]) => ({ id, label: `${id} · ${product.label}` }));
const dateFormat = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const timeFormat = new Intl.DateTimeFormat("en-IN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" });

function useResource<T>(key: string, refresh: number, loader: (signal: AbortSignal) => Promise<T>) {
  const [state, setState] = useState<{ key: string; refresh: number; data?: T; error?: string }>();
  useEffect(() => {
    if (!key) return;
    const controller = new AbortController();
    void loader(controller.signal).then(data => {
      if (!controller.signal.aborted) setState({ key, refresh, data });
    }).catch(error => {
      if (!controller.signal.aborted) setState(previous => ({
        key, refresh, data: previous?.key === key ? previous.data : undefined,
        error: error instanceof Error ? error.message : "The option feed is unavailable.",
      }));
    });
    return () => controller.abort();
  }, [key, refresh, loader]);
  const current = state?.key === key ? state : undefined;
  return { data: current?.data, error: current?.error, loading: Boolean(key && current?.refresh !== refresh) };
}

export function OptionSpreadBuilder({ initialMarket, initialRoot, initialExpiry, initialStrike, initialKind, embedded = false }: {
  initialMarket: SpreadMarket;
  initialRoot: string;
  initialExpiry: string;
  initialStrike?: number;
  initialKind?: "CE" | "PE";
  embedded?: boolean;
}) {
  const [market, setMarket] = useState<SpreadMarket>(initialMarket);
  const [requestedRoot, setRoot] = useState(initialRoot);
  const [seriesReload, retrySeries] = useState(0);
  const [chainReload, reloadChain] = useState(0);
  const [requestedSeries, setSeries] = useState(initialExpiry);
  const india = useResource(market === "india" ? "india" : "", seriesReload, loadSpreadUnderlyings);
  const tokens = useResource(market === "tokens" ? "tokens" : "", seriesReload, loadTokenOptionRoots);
  const choices = market === "india" ? (india.data ?? []).map(item => ({
    id: item.instrumentKey,
    label: !item.name || item.name.toLowerCase() === item.symbol.toLowerCase() ? item.symbol : `${item.symbol} · ${item.name}`,
  }))
    : market === "tokens" ? (tokens.data ?? []).map(id => ({ id, label: id === "XAUT" ? "XAUT · Tether Gold" : id }))
    : market === "crypto" ? crypto : metals;
  const root = choices.find(item => item.id === requestedRoot)?.id
    ?? choices.find(item => item.id === "NSE_INDEX|Nifty 50")?.id ?? choices[0]?.id ?? "";
  const underlying = india.data?.find(item => item.instrumentKey === root);
  const loadSeries = useMemo(() => (signal: AbortSignal) => loadSpreadSeries(market, root, underlying, signal), [market, root, underlying]);
  const marketKey = root ? `${market}:${root}` : "";
  const series = useResource(marketKey, seriesReload, loadSeries);
  const expiry = series.data?.find(item => item.id === requestedSeries) ?? series.data?.[0];
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
  const error = india.error ?? tokens.error ?? series.error ?? chain.error;
  const loading = india.loading || tokens.loading || series.loading || chain.loading;

  const seeded = market === initialMarket && root === initialRoot && expiry?.id === initialExpiry;
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

    <section className="spread-card spread-feed" aria-label="Option chain filters">
      <label>Underlying
        <select value={root} disabled={!choices.length} onChange={event => { setRoot(event.target.value); setSeries(""); }}>
          {!choices.length && <option value="">Choose underlying</option>}
          {choices.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
        </select>
      </label>
      <label>Expiry
        <select value={expiry?.id ?? ""} disabled={!expiry} onChange={event => setSeries(event.target.value)}>
          {!expiry && <option value="">{series.loading ? "Loading expiries…" : "Choose expiry"}</option>}
          {series.data?.map(item => <option key={item.id} value={item.id}>
            {dateFormat.format(Date.parse(`${item.expiry}T00:00:00Z`))}
            {isDelta ? ` · ${timeFormat.format(Date.parse(item.id))} IST` : item.detail ? ` · ${item.detail}` : ""}
          </option>)}
        </select>
      </label>
      <button type="button" className="spread-refresh" title="Refresh quotes" aria-label="Refresh quotes" onClick={() => {
        if (error || !expiry) retrySeries(value => value + 1);
        reloadChain(value => value + 1);
      }} disabled={loading}><RefreshCw size={17} aria-hidden="true" /></button>
      <p><span>{sources[market]} · {metal ? metal.unit : currency}</span>
        {chain.data?.reference ? <span>{market === "metals" ? "Futures" : "Underlying"} <strong>{formatter(currency).format(chain.data.reference)}</strong></span> : null}
      </p>
    </section>

    {error && !loading && <p className="spread-message" role="alert">{error}</p>}
    {chain.loading && !chain.data && <p className="spread-message" role="status">Loading option chain…</p>}
    {!loading && !error && (!expiry || !chain.data?.contracts.length) &&
      <p className="spread-message" role="status">No listed options</p>}
    {chain.data?.quoteWarning && !chain.error && <p className="spread-message" role="status">{chain.data.quoteWarning}</p>}
    {!!chain.data?.contracts.length && <BasketWorkspace key={chainKey} chain={chain.data} currency={currency} market={market}
      root={root} rootLabel={underlying?.symbol ?? root} expiry={expiry!.id} dataReady={!chain.error && !chain.data.quoteWarning}
      initialStrike={seeded ? initialStrike : undefined} initialKind={seeded ? initialKind : undefined} />}
  </div>;
}

function formatter(currency: "INR" | "USD") {
  return new Intl.NumberFormat(currency === "INR" ? "en-IN" : "en-US", { style: "currency", currency, maximumFractionDigits: currency === "USD" ? 6 : 2 });
}
