"use client";
import { ModernSelect } from "./ModernSelect";
import { CandleLoader } from "./CandleLoader";
import { StockLogo } from "@/components/StockLogo";

import { OptionChainTable } from "./OptionChainTable";
import { OptionStrategyButton } from "./OptionStrategyButton";
import { normalizeNseSpreadChain } from "@/lib/spread-chain-client";
import { startVisiblePolling } from "@/lib/visible-polling";
import { useOptionDesk } from "./OptionDeskContext";
import { X } from "lucide-react";
import { useEffect, useMemo, useState, type PointerEvent as ReactPointerEvent } from "react";
import { optionToInstrument, underlyingToInstrument, type FnoUnderlying, type OptionChainRow } from "@/lib/fno";
import { loadOptionChain, loadOptionExpiries, nearestAtmRow } from "@/lib/fno-client";
import { formatInr, type Instrument } from "@/lib/market";

export function OptionChainSheet({
  underlying,
  currentOption,
  onSelect,
  onClose,
}: {
  underlying: FnoUnderlying;
  currentOption: Instrument | null;
  onSelect: (option: Instrument, spot: Instrument) => void;
  onClose: () => void;
}) {
  const desk = useOptionDesk();
  const [expiries, setExpiries] = useState<string[]>([]);
  const [expiry, setExpiry] = useState(currentOption?.expiry ?? "");
  const [rows, setRows] = useState<OptionChainRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [sheetHeight, setSheetHeight] = useState(72);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const preferredExpiry = currentOption?.expiry ?? "";
    void loadOptionExpiries(underlying, controller.signal)
      .then((items) => {
        setExpiries(items);
        setExpiry(items.includes(preferredExpiry) ? preferredExpiry : items[0] ?? "");
        if (!items.length) setLoading(false);
      })
      .catch((reason) => {
        if (!controller.signal.aborted) {
          setError(reason instanceof Error ? reason.message : "Option expiries are unavailable.");
          setLoading(false);
        }
      });
    return () => controller.abort();
  }, [currentOption?.expiry, underlying]);

  useEffect(() => {
    if (!expiry) return;
    return startVisiblePolling(async signal => {
      const items = await loadOptionChain(underlying, expiry, signal);
      if (!signal.aborted) { setRows(items); setLoading(false); setError(""); }
    }, 20_000, () => { setRows([]); setError("Option chain quotes are unavailable."); setLoading(false); });
  }, [expiry, underlying, refresh]);

  const atmRow = useMemo(() => nearestAtmRow(rows), [rows]);
  const spotPrice = atmRow?.underlyingSpotPrice ?? 0;

  const contracts = useMemo(() => normalizeNseSpreadChain(rows, expiry).contracts, [rows, expiry]);
  function selectContract(id: string) {
    const row = rows.find(item => item.call?.instrumentKey === id || item.put?.instrumentKey === id);
    const contract = row?.call?.instrumentKey === id ? row.call : row?.put;
    if (!row || !contract) return;
    onClose();
    onSelect(optionToInstrument(contract, row, underlying), underlyingToInstrument(underlying, row.underlyingSpotPrice));
  }

  function beginSheetDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    event.preventDefault();
    const startY = event.clientY;
    const startHeight = sheetHeight;
    const move = (nextEvent: PointerEvent) => {
      const delta = ((startY - nextEvent.clientY) / window.innerHeight) * 100;
      setSheetHeight(Math.max(42, Math.min(92, startHeight + delta)));
    };
    const stop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
    };
    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", stop, { once: true });
    window.addEventListener("pointercancel", stop, { once: true });
  }

  return (
    <div className="option-sheet-backdrop" role="presentation" onPointerDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="option-chain-sheet" style={{ height: `${sheetHeight}dvh` }} role="dialog" aria-modal="true" aria-label={`${underlying.symbol} option chain`}>
        <button className="option-sheet-handle" onPointerDown={beginSheetDrag} aria-label="Drag option chain up or down"><span /></button>
        <header className="option-sheet-header">
          <div><span className="eyebrow">NSE option chain</span><h2 className="stock-identity"><StockLogo symbol={underlying.symbol} instrumentKey={underlying.instrumentKey} size={26} />{underlying.symbol}</h2><small>Spot {spotPrice ? formatInr(spotPrice) : "—"}</small>
          </div>
          <label>Expiry<ModernSelect hideLabel label="Expiry" value={expiry} disabled={!expiries.length} choices={expiries.map(value=>({value,label:new Date(`${value}T00:00:00`).toLocaleDateString("en-IN",{day:"2-digit",month:"short"})}))} onChange={value=>{setLoading(true);setError("");setRows([]);setExpiry(value);}}/></label>
          <button className="icon-button" onClick={onClose} aria-label="Close option chain"><X size={20} /></button>
        </header>
        <div className="chain-sheet-tools">
          <OptionStrategyButton context={{ initialMarket: "india", initialRoot: underlying.instrumentKey, initialExpiry: expiry }}/>
          <button type="button" disabled={loading || !expiry} onClick={() => { setLoading(true); setRefresh(value => value + 1); }}>Refresh</button>
        </div>
        <div className="option-sheet-list option-sheet-book">
          {contracts.length > 0 && <OptionChainTable contracts={contracts} reference={spotPrice || null} currency="INR" selected={currentOption?.instrumentKey} focusAtm
            onChart={contract => selectContract(contract.id)} onSide={(contract, side) => {
              const premium = side === "BUY" ? contract.ask : contract.bid;
              if (!desk || premium === null) return;
              onClose();
              desk.openIndianOrder({ market: "india", root: underlying.instrumentKey, rootLabel: underlying.symbol, expiry,
                legs: [{ contract, side, lots: 1, premium }] });
            }}/>}
          {loading && !rows.length && <CandleLoader label="Loading live option chain" />}
          {!loading && error && <div className="positions-empty"><b>Option chain unavailable</b><span>{error}</span></div>}
          {!loading && !error && !rows.length && <div className="positions-empty"><b>No active contracts</b><span>Select another expiry.</span></div>}
        </div>
      </section>
    </div>
  );
}
