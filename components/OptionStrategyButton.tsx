"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { ChartNoAxesCombined, X } from "lucide-react";
import { AppDialog } from "./AppDialog";
import { deltaOptionRoot } from "@/lib/global-contracts";
import type { Instrument } from "@/lib/market";

const Builder = dynamic(() => import("./OptionSpreadBuilder").then(module => module.OptionSpreadBuilder));

export function OptionStrategyButton({ option }: { option: Instrument }) {
  const [open, setOpen] = useState(false);
  const root = option.exchange === "DELTA" ? deltaOptionRoot(option.symbol) : null;
  const market = root ? (["BTC", "ETH"].includes(root) ? "crypto" : "tokens") : "india";
  return <>
    <button type="button" className="option-strategy-trigger" onClick={() => setOpen(true)} title="Strategy Builder" aria-label="Open Strategy Builder" aria-haspopup="dialog">
      <ChartNoAxesCombined size={17} aria-hidden="true" />
    </button>
    {open && <AppDialog className="spread-dialog" label="Option Strategy Builder" onClose={() => setOpen(false)}>
      <header className="spread-dialog-heading"><h2>Option Strategy Builder</h2><button className="icon-button" type="button" aria-label="Close Strategy Builder" onClick={() => setOpen(false)}><X size={20} /></button></header>
      <Builder embedded initialMarket={market} initialRoot={root ?? option.underlyingKey ?? ""} initialExpiry={option.expiry ?? ""} initialStrike={option.strikePrice} initialKind={option.optionType} />
    </AppDialog>}
  </>;
}
