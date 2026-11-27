"use client";

import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import dynamic from "next/dynamic";
import { X } from "lucide-react";
import { AppDialog } from "./AppDialog";
import { deltaOptionRoot } from "@/lib/global-contracts";
import type { Instrument } from "@/lib/market";

const Builder = dynamic(() => import("./OptionSpreadBuilder").then(module => module.OptionSpreadBuilder));

function PayoffIcon() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 4v16h18" opacity=".5" /><path d="M5 16h4l6-10h6" />
  </svg>;
}

export function OptionStrategyButton({ option }: { option: Instrument }) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const root = option.exchange === "DELTA" ? deltaOptionRoot(option.symbol) : null;
  const market = root ? (["BTC", "ETH"].includes(root) ? "crypto" : "tokens") : "india";
  return <>
    <button ref={trigger} type="button" className="option-strategy-trigger" onClick={() => setOpen(true)} title="Strategy Builder" aria-label="Open Strategy Builder" aria-haspopup="dialog" aria-expanded={open}>
      <PayoffIcon />
    </button>
    {open && createPortal(<AppDialog className="spread-dialog" label="Option Strategy Builder" returnFocus={trigger} onClose={() => setOpen(false)}>
      <header className="spread-dialog-heading">
        <span className="spread-dialog-mark"><PayoffIcon /></span>
        <h2>Option Strategy Builder</h2>
        <button className="spread-close" type="button" aria-label="Close Strategy Builder" onClick={() => setOpen(false)}><X size={18} /></button>
      </header>
      <Builder embedded initialMarket={market} initialRoot={root ?? option.underlyingKey ?? ""} initialExpiry={option.expiry ?? ""} initialStrike={option.strikePrice} initialKind={option.optionType} />
    </AppDialog>, trigger.current?.closest(".terminal-shell") ?? document.body)}
  </>;
}
