"use client";

import { useEffect, useRef } from "react";
import { Trash2, X } from "lucide-react";
import type { ClosedPaperTrade } from "@/lib/trade-analytics";

export function TradeDeleteDialog({ trades, error, onCancel, onConfirm, global = false, busy = false }: {
  global?: boolean;
  busy?: boolean;
  trades: ClosedPaperTrade[];
  error: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    dialog?.showModal();
    cancelRef.current?.focus();
    return () => { dialog?.close(); previousFocus?.focus(); };
  }, []);

  const count = trades.length;
  return <dialog ref={dialogRef} className="trade-delete-dialog" aria-labelledby="trade-delete-title" aria-describedby="trade-delete-description" onCancel={(event) => { event.preventDefault(); onCancel(); }}>
    <header><span className="trade-delete-icon"><Trash2 size={23} /></span><button type="button" className="trade-delete-close" aria-label="Cancel deletion" onClick={onCancel}><X size={20} /></button></header>
    <span className="trade-delete-eyebrow">Manage trade history</span>
    <h2 id="trade-delete-title">Delete {count} {count === 1 ? "trade" : "trades"}?</h2>
    <p id="trade-delete-description">{global ? 'The selected trades will be removed from P&L reports. Their original fills remain in wallet history.' : 'The selected trades and their entry/exit fills will be removed from this device. This cannot be undone.'}</p>
    <ul className="trade-delete-preview">{trades.map((trade) => <li key={trade.id}><b>{trade.symbol}</b><span>{trade.quantity.toLocaleString("en-IN")} units · {trade.closedAt ? new Date(trade.closedAt).toLocaleDateString("en-IN") : "Legacy trade"}</span></li>)}</ul>
    <p className="trade-delete-note">{global ? 'P&L totals and the calendar will update. Wallet balance, open positions and bot limits will not change.' : 'Virtual cash, P&L, charges and the calendar will be recalculated.'}</p>
    {error && <p className="trade-delete-error" role="alert">{error}</p>}
    <footer><button ref={cancelRef} type="button" disabled={busy} onClick={onCancel}>Keep trades</button><button type="button" className="trade-delete-confirm" disabled={busy || Boolean(error) || !count} onClick={onConfirm}><Trash2 size={16} /> {busy ? 'Deleting…' : `Delete ${count === 1 ? 'trade' : `${count} trades`}`}</button></footer>
  </dialog>;
}
