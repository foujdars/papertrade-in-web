"use client";

import { Activity, ArrowLeft, Cable, ChevronRight, Search, TrendingUp, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { optionToInstrument, underlyingToInstrument, type FnoUnderlying, type OptionChainRow, type OptionContractSide } from "@/lib/fno";
import { formatInr, type Instrument } from "@/lib/market";
import type { VolumeBreakoutRow } from "@/lib/volume-breakout";

type MarketTab = "volume" | "indices" | "fno";

function compactNumber(value: number) {
  return new Intl.NumberFormat("en-IN", { notation: "compact", maximumFractionDigits: 1 }).format(value || 0);
}

function optionChange(contract: OptionContractSide) {
  const close = contract.marketData.closePrice;
  return close > 0 ? ((contract.marketData.ltp - close) / close) * 100 : 0;
}

export function MarketsWorkspace({
  volumeRows,
  volumeLoading,
  volumeError,
  stockUniverse,
  onSelectCash,
  onSelectOption,
  onSelectSpot,
  onClose,
}: {
  volumeRows: VolumeBreakoutRow[];
  volumeLoading: boolean;
  volumeError: string;
  stockUniverse: Instrument[];
  onSelectCash: (instrument: Instrument, price: number) => void;
  onSelectOption: (option: Instrument, spot: Instrument) => void;
  onSelectSpot: (spot: Instrument) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<MarketTab>("volume");
  const [underlyings, setUnderlyings] = useState<FnoUnderlying[]>([]);
  const [fnoLoading, setFnoLoading] = useState(true);
  const [fnoError, setFnoError] = useState("");
  const [search, setSearch] = useState("");
  const [chainUnderlying, setChainUnderlying] = useState<FnoUnderlying | null>(null);
  const [expiries, setExpiries] = useState<string[]>([]);
  const [expiry, setExpiry] = useState("");
  const [chainRows, setChainRows] = useState<OptionChainRow[]>([]);
  const [chainLoading, setChainLoading] = useState(false);
  const [chainError, setChainError] = useState("");

  useEffect(() => {
    if (underlyings.length) return;
    const controller = new AbortController();
    void fetch("/api/upstox/fno-underlyings", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json() as { ok?: boolean; underlyings?: FnoUnderlying[]; error?: { message?: string } };
        if (!response.ok || !payload.ok) throw new Error(payload.error?.message ?? "F&O instruments are unavailable.");
        setUnderlyings(payload.underlyings ?? []);
      })
      .catch((error) => { if (!controller.signal.aborted) setFnoError(error instanceof Error ? error.message : "F&O instruments are unavailable."); })
      .finally(() => { if (!controller.signal.aborted) setFnoLoading(false); });
    return () => controller.abort();
  }, [underlyings.length]);

  useEffect(() => {
    if (!chainUnderlying) return;
    const controller = new AbortController();
    const params = new URLSearchParams({ instrumentKey: chainUnderlying.instrumentKey });
    void fetch(`/api/upstox/option-chain?${params}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json() as { ok?: boolean; expiries?: string[]; error?: { message?: string } };
        if (!response.ok || !payload.ok || !payload.expiries?.length) throw new Error(payload.error?.message ?? "No active option expiry was returned by Upstox.");
        setExpiries(payload.expiries);
        setExpiry(payload.expiries[0]);
      })
      .catch((error) => {
        if (!controller.signal.aborted) {
          setChainError(error instanceof Error ? error.message : "Option expiries are unavailable.");
          setChainLoading(false);
        }
      });
    return () => controller.abort();
  }, [chainUnderlying]);

  useEffect(() => {
    if (!chainUnderlying || !expiry) return;
    const controller = new AbortController();
    const params = new URLSearchParams({ instrumentKey: chainUnderlying.instrumentKey, expiry });
    void fetch(`/api/upstox/option-chain?${params}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json() as { ok?: boolean; rows?: OptionChainRow[]; error?: { message?: string; code?: string } };
        if (!response.ok || !payload.ok) throw new Error(payload.error?.message ?? "Option chain is unavailable.");
        setChainRows(payload.rows ?? []);
      })
      .catch((error) => { if (!controller.signal.aborted) setChainError(error instanceof Error ? error.message : "Option chain is unavailable."); })
      .finally(() => { if (!controller.signal.aborted) setChainLoading(false); });
    return () => controller.abort();
  }, [chainUnderlying, expiry]);

  const indexUnderlyings = useMemo(() => underlyings.filter((item) => item.underlyingType === "INDEX"), [underlyings]);
  const filteredUnderlyings = useMemo(() => {
    const term = search.trim().toLowerCase();
    return underlyings.filter((item) => !term || item.symbol.toLowerCase().includes(term) || item.name.toLowerCase().includes(term));
  }, [search, underlyings]);
  const spotPrice = chainRows.find((row) => row.underlyingSpotPrice > 0)?.underlyingSpotPrice ?? 0;
  const atmStrike = useMemo(() => spotPrice > 0 && chainRows.length
    ? chainRows.reduce((nearest, row) => Math.abs(row.strikePrice - spotPrice) < Math.abs(nearest - spotPrice) ? row.strikePrice : nearest, chainRows[0].strikePrice)
    : 0, [chainRows, spotPrice]);

  function chooseContract(contract: OptionContractSide | null, row: OptionChainRow) {
    if (!contract || !chainUnderlying || contract.marketData.ltp <= 0) return;
    const spot = underlyingToInstrument(chainUnderlying, row.underlyingSpotPrice);
    onSelectOption(optionToInstrument(contract, row, chainUnderlying), spot);
  }

  function openChain(underlying: FnoUnderlying) {
    setChainLoading(true);
    setChainUnderlying(underlying);
    setChainError("");
    setExpiries([]);
    setExpiry("");
    setChainRows([]);
  }

  if (chainUnderlying) {
    return (
      <section className="market-discovery-panel option-chain-panel" aria-label={`${chainUnderlying.symbol} option chain`}>
        <div className="option-chain-head">
          <button className="icon-button" onClick={() => setChainUnderlying(null)} aria-label="Back to F&O list"><ArrowLeft size={19} /></button>
          <div><span className="eyebrow">NSE F&amp;O · Paper trading</span><h2>{chainUnderlying.symbol} option chain</h2><small>Spot {spotPrice > 0 ? formatInr(spotPrice) : "loading"}</small></div>
          <button className="icon-button" onClick={onClose} aria-label="Close markets"><X size={20} /></button>
        </div>
        <div className="option-chain-actions">
          <button onClick={() => onSelectSpot(underlyingToInstrument(chainUnderlying, spotPrice))}>Open spot chart <ChevronRight size={15} /></button>
          <label>Expiry<select value={expiry} onChange={(event) => { setChainLoading(true); setChainError(""); setChainRows([]); setExpiry(event.target.value); }} disabled={!expiries.length}>{expiries.map((item) => <option key={item} value={item}>{new Date(`${item}T00:00:00`).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</option>)}</select></label>
        </div>
        <div className="option-chain-legend"><span>CALL LTP · OI · IV</span><b>STRIKE</b><span>PUT LTP · OI · IV</span></div>
        <div className="option-chain-list">
          {chainRows.map((row) => {
            const atm = row.strikePrice === atmStrike;
            const callChange = row.call ? optionChange(row.call) : 0;
            const putChange = row.put ? optionChange(row.put) : 0;
            return (
              <div key={row.strikePrice} className={`option-chain-row ${atm ? "atm" : ""}`}>
                <button disabled={!row.call || row.call.marketData.ltp <= 0} onClick={() => chooseContract(row.call, row)}>
                  <b>{row.call ? formatInr(row.call.marketData.ltp) : "—"}</b>
                  <small className={callChange >= 0 ? "positive" : "negative"}>{callChange >= 0 ? "+" : ""}{callChange.toFixed(2)}%</small>
                  <em>OI {row.call ? compactNumber(row.call.marketData.oi) : "—"} · IV {row.call?.greeks.iv.toFixed(1) ?? "—"}</em>
                </button>
                <span><b>{row.strikePrice.toLocaleString("en-IN")}</b>{atm && <small>ATM</small>}</span>
                <button disabled={!row.put || row.put.marketData.ltp <= 0} onClick={() => chooseContract(row.put, row)}>
                  <b>{row.put ? formatInr(row.put.marketData.ltp) : "—"}</b>
                  <small className={putChange >= 0 ? "positive" : "negative"}>{putChange >= 0 ? "+" : ""}{putChange.toFixed(2)}%</small>
                  <em>OI {row.put ? compactNumber(row.put.marketData.oi) : "—"} · IV {row.put?.greeks.iv.toFixed(1) ?? "—"}</em>
                </button>
              </div>
            );
          })}
          {chainLoading && !chainRows.length && <div className="positions-empty"><Activity size={30} /><b>Loading live option chain</b><span>Reading Calls, Puts, OI, IV and contract lot sizes from Upstox.</span></div>}
          {!chainLoading && chainError && <div className="positions-empty"><Cable size={30} /><b>Option chain unavailable</b><span>{chainError}</span></div>}
          {!chainLoading && !chainError && !chainRows.length && <div className="positions-empty"><Activity size={30} /><b>No active contracts</b><span>Try another expiry or underlying.</span></div>}
        </div>
      </section>
    );
  }

  return (
    <section className="market-discovery-panel" aria-label="NSE markets and F&O">
      <div className="market-discovery-head"><div><span className="eyebrow">NSE market lists</span><h2>Markets</h2></div><button className="icon-button" onClick={onClose} aria-label="Close markets"><X size={20} /></button></div>
      <nav className="trend-tabs" aria-label="Market lists">
        <button className={tab === "volume" ? "active" : ""} onClick={() => setTab("volume")}>Volume Stocker</button>
        <button className={tab === "indices" ? "active" : ""} onClick={() => setTab("indices")}>Indices</button>
        <button className={tab === "fno" ? "active" : ""} onClick={() => setTab("fno")}>F&amp;O</button>
      </nav>

      {tab === "fno" && <label className="market-search"><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search F&O stocks and indices" /></label>}

      <div className="market-discovery-list">
        {tab === "volume" && volumeRows.map((row) => {
          const item = stockUniverse.find((instrument) => instrument.symbol === row.symbol);
          if (!item) return null;
          return (
            <button key={row.symbol} className="trend-stock-row" onClick={() => onSelectCash(item, row.lastPrice)}>
              <span className="symbol-avatar">{row.symbol.slice(0, 2)}</span>
              <span><b>{row.symbol}</b><small>{row.name} · NSE</small><small>Volume {compactNumber(row.todayVolume)} · SMA20 {compactNumber(row.sma20Volume)}</small></span>
              <span><b>{formatInr(row.lastPrice)}</b><small className={row.changePercent >= 0 ? "positive" : "negative"}>{row.changePercent >= 0 ? "+" : ""}{row.changePercent.toFixed(2)}%</small><small>{row.volumeMultiple.toFixed(2)}× volume</small></span>
            </button>
          );
        })}
        {tab === "volume" && volumeLoading && !volumeRows.length && <div className="positions-empty"><TrendingUp size={30} /><b>Scanning NSE cash stocks</b><span>Comparing live Upstox volume with 20 daily sessions.</span></div>}
        {tab === "volume" && !volumeLoading && volumeError && <div className="positions-empty"><Cable size={30} /><b>Volume scanner unavailable</b><span>{volumeError}</span></div>}
        {tab === "volume" && !volumeLoading && !volumeError && !volumeRows.length && <div className="positions-empty"><Activity size={30} /><b>No stocks pass the filter</b><span>No NSE cash stock currently passes the configured volume rule.</span></div>}

        {tab === "indices" && indexUnderlyings.map((item) => (
          <button key={item.instrumentKey} className="fno-underlying-row" onClick={() => openChain(item)}>
            <span className="symbol-avatar">{item.symbol.slice(0, 2)}</span><span><b>{item.symbol}</b><small>{item.name}</small></span><span><small>{item.optionContracts} active options</small><b>Option chain</b></span><ChevronRight size={17} />
          </button>
        ))}

        {tab === "fno" && filteredUnderlyings.map((item) => (
          <button key={item.instrumentKey} className="fno-underlying-row" onClick={() => openChain(item)}>
            <span className="symbol-avatar">{item.symbol.slice(0, 2)}</span><span><b>{item.symbol}</b><small>{item.name} · {item.underlyingType}</small></span><span><small>{item.optionContracts} options</small><b>View chain</b></span><ChevronRight size={17} />
          </button>
        ))}
        {(tab === "indices" || tab === "fno") && fnoLoading && !underlyings.length && <div className="positions-empty"><Activity size={30} /><b>Loading current NSE F&amp;O list</b><span>Reading today&apos;s active contracts from Upstox.</span></div>}
        {(tab === "indices" || tab === "fno") && !fnoLoading && fnoError && <div className="positions-empty"><Cable size={30} /><b>F&amp;O list unavailable</b><span>{fnoError}</span></div>}
      </div>
    </section>
  );
}
