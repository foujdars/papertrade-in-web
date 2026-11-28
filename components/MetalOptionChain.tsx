"use client";

import { useEffect, useState } from "react";
import { Layers2, X } from "lucide-react";
import { AppDialog } from "./AppDialog";
import { OptionChainTable } from "./OptionChainTable";
import { OptionStrategyButton } from "./OptionStrategyButton";
import { useOptionDesk } from "./OptionDeskContext";
import { loadSpreadChain, loadSpreadSeries } from "@/lib/spread-chain-client";
import { startVisiblePolling } from "@/lib/visible-polling";
import type { SpreadChain, SpreadSeries } from "@/lib/vertical-spread";

export function MetalChainButton({ root }: { root: string }) {
  const [open, setOpen] = useState(false);
  return <><button type="button" className="option-strategy-trigger" title="Metal option chain" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}>
    <Layers2 size={17}/><span>Chain</span></button>{open && <MetalOptionChain key={root} root={root} close={() => setOpen(false)}/>}</>;
}

function MetalOptionChain({root,close}: {root: string; close: () => void}) {
  const desk = useOptionDesk();
  const [series,setSeries] = useState<SpreadSeries[]>([]), [id,setId] = useState("");
  const [feed,setFeed] = useState<{id:string; book?:SpreadChain; error?:string}>();
  const [error,setError] = useState(""), [loading, setLoading] = useState(true), [reload,setReload] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    void loadSpreadSeries("metals",root,undefined,controller.signal).then(items => {
      if (!controller.signal.aborted) { setSeries(items); setId(old => items.some(it=>it.id===old) ? old : items[0]?.id ?? ""); setError(""); }
    }).catch(reason => { if (!controller.signal.aborted) setError((reason as Error).message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  },[root,reload]);
  useEffect(() => {
    if (!id) return;
    return startVisiblePolling(async signal => {
      const book = await loadSpreadChain("metals",root,undefined,id,signal);
      if (!signal.aborted) setFeed({id,book});
    },20_000,() => setFeed({id,error:"Metal option quotes are unavailable."}));
  },[root,id,reload]);
  const book = feed?.id === id ? feed.book : undefined;
  return <AppDialog className="delta-option-dialog" label={root + " option chain"} onClose={close} containEscape>
    <header><h2>{root} option chain</h2><button type="button" className="spread-close" aria-label="Close option chain" onClick={close}><X size={17}/></button></header>
    <div className="delta-options-controls"><label>Expiry<select value={id} onChange={e=>setId(e.target.value)}>{series.map(v=><option key={v.id} value={v.id}>{v.expiry}{v.detail ? " · "+v.detail : ""}</option>)}</select></label>
      <OptionStrategyButton context={{ initialMarket:"metals",initialRoot:root,initialExpiry:id }}/><button type="button" onClick={()=>setReload(n=>n+1)}>Refresh</button></div>
    {book?.contracts.length ? <OptionChainTable contracts={book.contracts} currency="INR" reference={book.reference} focusAtm
      onSide={(contract,side) => { const premium = side === "BUY" ? contract.ask : contract.bid; if (premium === null || !desk) return;
        close(); desk.openIndianOrder({market:"metals",root,rootLabel:root,expiry:id,legs:[{contract,side,lots:1,premium}]}); }}
      onChart={c=>{ if (!desk || !c.symbol) return; close(); desk.chartMcx({symbol:c.symbol,name:c.symbol,instrumentKey:c.id,exchange:"MCX",categories:["MCX"],
        price:c.last ?? 0,change:0,assetType:"OPTION",optionType:c.kind,lotSize:c.multiplier ?? undefined,strikePrice:c.strike,expiry:id.slice(0,10),underlyingSymbol:root,underlyingKey:id.split("~")[1]}); }}/>
      : <p role="status">{error || (feed?.id === id && feed.error) || (loading || (id && !book) ? "Loading option chain…" : "No listed options for this expiry.")}</p>}
    {book?.quoteWarning && <p role="status">{book.quoteWarning}</p>}
  </AppDialog>;
}
