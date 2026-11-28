"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { ChevronDown, RefreshCw } from "lucide-react";
import { OptionChainTable } from "./OptionChainTable";
import { OptionStrategyButton } from "./OptionStrategyButton";
import { useOptionDesk } from "./OptionDeskContext";
import { startVisiblePolling } from "@/lib/visible-polling";
import { loadSpreadChain } from "@/lib/spread-chain-client";
import type { SpreadChain, SpreadContract } from "@/lib/vertical-spread";
import { deltaOptionDirectory, isTokenisedDelta, type ListedDeltaOption } from "@/lib/delta-option-list";

const expiryLabel = new Intl.DateTimeFormat("en-GB", {
  day: "numeric", month: "short", year: "2-digit", hour: "2-digit", minute: "2-digit",
  hourCycle: "h23", timeZone: "Asia/Kolkata",
});

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
  const desk = useOptionDesk();
  const controlsId = useId();
  const [reload, setReload] = useState(0);
  const [feed, setFeed] = useState<{ key: string; chain?: SpreadChain; error?: string }>();
  const key = root + ":" + expiry;
  const market = contracts[0] && isTokenisedDelta(contracts[0]) ? "tokens" : "crypto";
  useEffect(() => {
    if (!root || !expiry) return;
    return startVisiblePolling(async signal => {
      const chain = await loadSpreadChain(market, root, undefined, expiry, signal);
      if (!signal.aborted) setFeed({key,chain});
    }, 20_000, () => setFeed({key,error:"Option quotes are unavailable."}));
  }, [root, expiry, key, market, reload]);
  const live = feed?.key === key ? feed : undefined;
  const book = useMemo(() => {
    const quotes = new Map(live?.chain?.contracts.map(item => [item.id, item]));
    return (byRoot.get(root) ?? []).filter(item => item.expiry === expiry).map((item): SpreadContract =>
      quotes.get(item.symbol) ?? { id: item.symbol, series: expiry, strike: item.strikePrice, kind: item.optionType,
        multiplier: null, bid: null, ask: null, last: null });
  }, [byRoot, root, expiry, live]);
  if (!roots.length) return <p className="delta-options-empty" role="status">No listed options</p>;
  return <div className="delta-options">
    <div className="delta-options-toolbar">
      <div className="delta-options-controls">
        <div className="delta-options-field">
          <label htmlFor={controlsId + "-root"}>Underlying</label>
          <span className="delta-options-select">
            <select id={controlsId + "-root"} value={root} onChange={event => { setRoot(event.target.value); setExpiry(""); }}>
              {roots.map(value => <option key={value} value={value}>{value === "XAUT" ? "XAUT · Tether Gold" : value}</option>)}
            </select>
            <ChevronDown size={15} aria-hidden="true" />
          </span>
        </div>
        <div className="delta-options-field">
          <label htmlFor={controlsId + "-expiry"}>Expiry (IST)</label>
          <span className="delta-options-select">
            <select id={controlsId + "-expiry"} value={expiry} onChange={event => setExpiry(event.target.value)}>
              {expiries.map(value => <option key={value} value={value}>{expiryLabel.format(Date.parse(value))}</option>)}
            </select>
            <ChevronDown size={15} aria-hidden="true" />
          </span>
        </div>
      </div>
      <div className="delta-options-tools">
        <OptionStrategyButton context={{ initialMarket: market, initialRoot: root, initialExpiry: expiry }} />
        <button className="delta-options-refresh" type="button" title="Refresh option quotes" aria-label="Refresh option quotes"
          onClick={() => setReload(value => value + 1)}><RefreshCw size={17} aria-hidden="true" /></button>
      </div>
    </div>
    {(!live || live.error || live.chain?.quoteWarning) && <p className="delta-options-empty" role="status">{live?.error ?? live?.chain?.quoteWarning ?? "Loading quotes…"}</p>}
    <OptionChainTable contracts={book} reference={live?.chain?.reference ?? null} currency="USD" selected={selectedSymbol} focusAtm
      onChart={contract => onOpen(contract.id)} onSide={(contract, side) => desk?.tradeDelta(contract.id, side)}/>
  </div>;
}
