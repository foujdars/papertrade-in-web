"use client";
import { StockLogo } from "@/components/StockLogo";

import { Activity, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { optionToInstrument, underlyingToInstrument, type FnoUnderlying, type OptionChainRow, type OptionContractSide } from "@/lib/fno";
import { loadOptionChain, loadOptionExpiries, nearestAtmRow } from "@/lib/fno-client";
import { formatInr, type Instrument } from "@/lib/market";

function optionChange(contract: OptionContractSide | null) {
  if (!contract?.marketData.closePrice) return 0;
  return ((contract.marketData.ltp - contract.marketData.closePrice) / contract.marketData.closePrice) * 100;
}

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
  const [expiries, setExpiries] = useState<string[]>([]);
  const [expiry, setExpiry] = useState(currentOption?.expiry ?? "");
  const [rows, setRows] = useState<OptionChainRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [sheetHeight, setSheetHeight] = useState(72);
  const atmRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const preferredExpiry = currentOption?.expiry ?? "";
    void loadOptionExpiries(underlying, controller.signal)
      .then((items) => {
        setExpiries(items);
        setExpiry(items.includes(preferredExpiry) ? preferredExpiry : items[0]);
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
    const controller = new AbortController();
    void loadOptionChain(underlying, expiry, controller.signal)
      .then((items) => setRows(items))
      .catch((reason) => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Option chain is unavailable."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [expiry, underlying]);

  const atmRow = useMemo(() => nearestAtmRow(rows), [rows]);
  const spotPrice = atmRow?.underlyingSpotPrice ?? 0;

  useEffect(() => {
    if (!atmRef.current || !rows.length) return;
    const frame = window.requestAnimationFrame(() => atmRef.current?.scrollIntoView({ block: "center" }));
    return () => window.cancelAnimationFrame(frame);
  }, [expiry, rows.length]);

  function selectContract(contract: OptionContractSide | null, row: OptionChainRow) {
    if (!contract || contract.marketData.ltp <= 0) return;
    onSelect(optionToInstrument(contract, row, underlying), underlyingToInstrument(underlying, row.underlyingSpotPrice));
    onClose();
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
          <div><span className="eyebrow">NSE option chain</span><h2 className="stock-identity"><StockLogo symbol={underlying.symbol} instrumentKey={underlying.instrumentKey} size={26} />{underlying.symbol}</h2><small>Spot {spotPrice ? formatInr(spotPrice) : "—"}</small></div>
          <label>Expiry<select value={expiry} disabled={!expiries.length} onChange={(event) => { setLoading(true); setError(""); setRows([]); setExpiry(event.target.value); }}>{expiries.map((item) => <option key={item} value={item}>{new Date(`${item}T00:00:00`).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}</option>)}</select></label>
          <button className="icon-button" onClick={onClose} aria-label="Close option chain"><X size={20} /></button>
        </header>
        <div className="option-sheet-legend"><span>CALL</span><span>STRIKE</span><span>PUT</span></div>
        <div className="option-sheet-columns"><span>CHG% <b>LTP</b></span><span>Strike</span><span><b>LTP</b> CHG%</span></div>
        <div className="option-sheet-list">
          {rows.map((row) => {
            const isAtm = row.strikePrice === atmRow?.strikePrice;
            const callChange = optionChange(row.call);
            const putChange = optionChange(row.put);
            const selectedCall = currentOption?.instrumentKey === row.call?.instrumentKey;
            const selectedPut = currentOption?.instrumentKey === row.put?.instrumentKey;
            return (
              <div key={row.strikePrice} ref={isAtm ? atmRef : undefined} className={`option-sheet-row ${isAtm ? "atm" : ""}`}>
                <button className={selectedCall ? "selected" : ""} disabled={!row.call || row.call.marketData.ltp <= 0} onClick={() => selectContract(row.call, row)}>
                  <small className={callChange >= 0 ? "positive" : "negative"}>{callChange >= 0 ? "+" : ""}{callChange.toFixed(1)}%</small><b>{row.call ? row.call.marketData.ltp.toFixed(2) : "—"}</b>
                </button>
                <span><b>{row.strikePrice.toLocaleString("en-IN")}</b>{isAtm && <small>ATM</small>}</span>
                <button className={selectedPut ? "selected" : ""} disabled={!row.put || row.put.marketData.ltp <= 0} onClick={() => selectContract(row.put, row)}>
                  <b>{row.put ? row.put.marketData.ltp.toFixed(2) : "—"}</b><small className={putChange >= 0 ? "positive" : "negative"}>{putChange >= 0 ? "+" : ""}{putChange.toFixed(1)}%</small>
                </button>
              </div>
            );
          })}
          {loading && !rows.length && <div className="positions-empty"><Activity size={28} /><b>Loading live option chain</b><span>Fetching Calls and Puts from Upstox.</span></div>}
          {!loading && error && <div className="positions-empty"><b>Option chain unavailable</b><span>{error}</span></div>}
          {!loading && !error && !rows.length && <div className="positions-empty"><b>No active contracts</b><span>Select another expiry.</span></div>}
        </div>
      </section>
    </div>
  );
}
