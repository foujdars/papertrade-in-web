"use client";
import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { useTransientBack } from "./useTransientBack";

export function TradeReviewDialog({ symbol, theme, onClose, children }: { symbol: string; theme: "light" | "neon"; onClose: () => void; children: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  useTransientBack(true, onClose);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.showModal(); close.current?.focus();
    const node = dialog.current;
    return () => { node?.close(); previous?.focus(); };
  }, []);
  return <dialog ref={dialog} className="trade-review-dialog" aria-label={`${symbol} entry and exit review`} onCancel={event => { event.preventDefault(); onClose(); }} onClick={event => { event.stopPropagation(); if (event.target === event.currentTarget) onClose(); }}>
    <div className="trade-review-content" data-theme={theme}>
      <header><span><b>{symbol}</b><small>Entry & exit review</small></span><button ref={close} type="button" aria-label="Close trade review" onClick={onClose}><X size={20} /></button></header>
      {children}
    </div>
  </dialog>;
}
