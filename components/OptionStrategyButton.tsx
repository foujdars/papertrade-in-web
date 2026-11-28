"use client";

import { useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import dynamic from "next/dynamic";
import { ChartNoAxesCombined, X } from "lucide-react";
import { AppDialog } from "./AppDialog";
import { optionBuilderContext } from "@/lib/option-builder-context";
import type { Instrument } from "@/lib/market";
import { useOptionDesk, type BuilderContext } from "./OptionDeskContext";

const Builder = dynamic(() => import("./OptionSpreadBuilder").then(module => module.OptionSpreadBuilder));

export function StrategyDialog({ context, onClose, returnFocus }: {
  context: BuilderContext; onClose: () => void; returnFocus?: RefObject<HTMLElement | null>;
}) {
  const desk = useOptionDesk();
  return <AppDialog className="spread-dialog" label="Option Strategy Builder" returnFocus={returnFocus} containEscape onClose={onClose}>
    <header className="spread-dialog-heading">
      <span className="spread-dialog-mark"><ChartNoAxesCombined size={20} aria-hidden="true"/></span>
      <h2>Strategy builder</h2><span className="desk-paper-mode">Paper trading</span>
      <button className="spread-close" type="button" aria-label="Close Strategy Builder" onClick={onClose}><X size={18}/></button>
    </header>
    <Builder key={JSON.stringify([desk?.owner, context])} embedded {...context}/>
  </AppDialog>;
}

export function OptionStrategyButton(props: { option: Instrument } | { context: BuilderContext }) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const context = "context" in props ? props.context : optionBuilderContext(props.option);
  return <>
    <button ref={trigger} type="button" className="option-strategy-trigger" onClick={() => setOpen(true)}
      title="Strategy builder" aria-label="Open Strategy Builder" aria-haspopup="dialog" aria-expanded={open}>
      <ChartNoAxesCombined size={18} aria-hidden="true"/><span>Strategy builder</span>
    </button>
    {open && createPortal(<StrategyDialog context={context} returnFocus={trigger} onClose={() => setOpen(false)}/>,
      trigger.current?.closest(".terminal-shell") ?? document.body)}
  </>;
}
