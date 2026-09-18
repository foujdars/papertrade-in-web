"use client";
import { Search, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { useTransientBack } from "./useTransientBack";

/** Search takes no permanent row; its query is retained until explicitly cleared. */
export function IpoSearch({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false), id = useId();
  const trigger = useRef<HTMLButtonElement>(null), dialog = useRef<HTMLDialogElement>(null), input = useRef<HTMLInputElement>(null);
  useTransientBack(open, () => setOpen(false));
  useEffect(() => {
    if (!open) return;
    const node = dialog.current;
    node?.showModal(); input.current?.focus({ preventScroll: true });
    return () => { node?.close(); trigger.current?.focus({ preventScroll: true }); };
  }, [open]);
  return <>
    <button ref={trigger} type="button" className={`ipo-search-toggle${value ? " has-query" : ""}`} aria-label={value ? `Search IPOs, filter: ${value}` : "Search IPOs"} aria-haspopup="dialog" aria-expanded={open} aria-controls={id} title={value ? `Search: ${value}` : "Search IPOs"} onClick={() => setOpen(true)}><Search size={18}/>{value && <i aria-hidden="true"/>}</button>
    {open && <dialog ref={dialog} id={id} className="ipo-search-dialog" aria-labelledby={`${id}-title`} onCancel={e => { e.preventDefault(); setOpen(false); }} onClick={e => { e.stopPropagation(); if (e.target === e.currentTarget) setOpen(false); }}>
      <form onSubmit={e => { e.preventDefault(); setOpen(false); }}>
        <header><h3 id={`${id}-title`}>Search IPOs</h3><button type="button" aria-label="Close IPO search" onClick={() => setOpen(false)}><X size={20}/></button></header>
        <label className="ipo-search"><Search size={17}/><input ref={input} type="search" aria-label="Company, symbol or sector" placeholder="Company, symbol or sector" value={value} onChange={e => onChange(e.target.value)}/>{value && <button type="button" aria-label="Clear IPO search" onClick={() => { onChange(""); input.current?.focus(); }}><X size={16}/></button>}</label>
        <p>Search within the current view and market segment.</p>
        <button type="submit" className="ipo-search-apply">Show results</button>
      </form>
    </dialog>}
  </>;
}
