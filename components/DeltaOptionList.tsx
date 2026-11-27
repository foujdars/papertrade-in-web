"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CandlestickChart } from "lucide-react";
import { deltaOptionDirectory, deltaOptionStrikes, type ListedDeltaOption } from "@/lib/delta-option-list";

const expiryLabel = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" });
const strikeLabel = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 6 });

export function DeltaOptionList({ instruments, initialRoot, initialExpiry, selectedSymbol, onOpen }: {
  instruments: readonly ListedDeltaOption[];
  initialRoot?: string | null;
  initialExpiry?: string;
  selectedSymbol?: string;
  onOpen: (symbol: string) => void;
}) {
  const byRoot = useMemo(() => deltaOptionDirectory(instruments), [instruments]);
  const [requestedRoot, setRoot] = useState(initialRoot ?? "");
  const [requestedExpiry, setExpiry] = useState(initialExpiry ?? "");
  const roots = [...byRoot.keys()].sort();
  const root = byRoot.has(requestedRoot) ? requestedRoot : roots[0] ?? "";
  const contracts = byRoot.get(root) ?? [];
  const expiries = [...new Set(contracts.map(item => item.expiry))].sort();
  const expiry = expiries.includes(requestedExpiry) ? requestedExpiry : expiries[0] ?? "";
  const rows = deltaOptionStrikes(contracts, expiry);
  if (!roots.length) return <p className="delta-options-empty" role="status">No listed options</p>;
  return <div className="delta-options">
    <div className="delta-options-controls">
      <label>Underlying<select value={root} onChange={event => { setRoot(event.target.value); setExpiry(""); }}>
        {roots.map(value => <option key={value} value={value}>{value === "XAUT" ? "XAUT · Tether Gold" : value}</option>)}
      </select></label>
      <label>Expiry (IST)<select value={expiry} onChange={event => setExpiry(event.target.value)}>
        {expiries.map(value => <option key={value} value={value}>{expiryLabel.format(Date.parse(value))}</option>)}
      </select></label>
      <Link className="spread-entry-link" href={{ pathname: "/strategy-builder", query: { market: ["BTC", "ETH"].includes(root) ? "crypto" : "tokens", underlying: root, expiry } }}>Strategy Builder</Link>
    </div>
    <div className="delta-options-scroll" role="region" aria-label={`${root} option contracts`} tabIndex={0}>
      <table className="delta-options-table">
        <thead><tr><th scope="col">Call chart</th><th scope="col">Strike</th><th scope="col">Put chart</th></tr></thead>
        <tbody>{rows.map(row => <tr key={row.strike}>
          <td>{row.CE ? <button type="button" aria-pressed={selectedSymbol === row.CE.symbol} aria-label={`Open ${root} ${row.strike} call chart`} onClick={() => onOpen(row.CE!.symbol)}><CandlestickChart size={15} aria-hidden="true" /> Call</button> : "—"}</td>
          <th scope="row">{strikeLabel.format(row.strike)}</th>
          <td>{row.PE ? <button type="button" aria-pressed={selectedSymbol === row.PE.symbol} aria-label={`Open ${root} ${row.strike} put chart`} onClick={() => onOpen(row.PE!.symbol)}><CandlestickChart size={15} aria-hidden="true" /> Put</button> : "—"}</td>
        </tr>)}</tbody>
      </table>
    </div>
  </div>;
}
