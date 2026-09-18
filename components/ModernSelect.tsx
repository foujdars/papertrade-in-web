"use client";

import { Check, ChevronDown, X } from "lucide-react";
import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { useTransientBack } from "./useTransientBack";

export type SelectChoice<T extends string> = { value: T; label: string; description?: string };

/** Native dialog supplies modality/focus containment; the options stay app-themed on Android. */
export function ModernSelect<T extends string>({ label, ariaLabel = label, value, choices, onChange }: {
  label: string; ariaLabel?: string; value: T; choices: readonly SelectChoice<T>[]; onChange: (value: T) => void;
}) {
  const id = useId(), trigger = useRef<HTMLButtonElement>(null), dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false), [position, setPosition] = useState<CSSProperties>({});
  const chosen = choices.find(choice => choice.value === value);
  useTransientBack(open, () => setOpen(false));

  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const rect = trigger.current?.getBoundingClientRect();
      if (!rect) return;
      const width = Math.min(340, Math.max(260, rect.width), window.innerWidth - 24);
      const left = Math.max(12, Math.min(rect.left, window.innerWidth - width - 12));
      const below = window.innerHeight - rect.bottom - 16;
      const above = rect.top - 16;
      const upward = below < Math.min(320, above);
      setPosition({ "--select-left": `${left}px`, "--select-top": upward ? "auto" : `${rect.bottom + 8}px`, "--select-bottom": upward ? `${window.innerHeight - rect.top + 8}px` : "auto", "--select-width": `${width}px`, "--select-height": `${Math.max(120, upward ? above : below)}px` } as CSSProperties);
    };
    place(); window.addEventListener("resize", place); window.addEventListener("scroll", place, true);
    return () => { window.removeEventListener("resize", place); window.removeEventListener("scroll", place, true); };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const node = dialog.current;
    node?.showModal();
    node?.querySelector<HTMLElement>('[aria-selected="true"]')?.focus({ preventScroll: true });
    return () => { node?.close(); if (trigger.current?.isConnected) trigger.current.focus({ preventScroll: true }); };
  }, [open]);

  function focusOption(event: React.KeyboardEvent, index: number) {
    let next = index;
    if (event.key === "ArrowDown") next = (index + 1) % choices.length;
    else if (event.key === "ArrowUp") next = (index - 1 + choices.length) % choices.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = choices.length - 1;
    else if (event.key.length === 1 && /[a-z0-9]/i.test(event.key)) {
      const match = choices.findIndex((_, offset) => choices[(index + 1 + offset) % choices.length].label.toLowerCase().startsWith(event.key.toLowerCase()));
      if (match < 0) return;
      next = (index + 1 + match) % choices.length;
    } else return;
    event.preventDefault(); dialog.current?.querySelectorAll<HTMLElement>('[role="option"]')[next]?.focus();
  }

  return <div className="modern-select">
    <span className="modern-select-label" id={`${id}-label`}>{label}</span>
    <button ref={trigger} type="button" className="modern-select-trigger" aria-label={ariaLabel} aria-haspopup="dialog" aria-expanded={open} aria-controls={`${id}-dialog`} onClick={() => setOpen(true)} onKeyDown={event => { if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); setOpen(true); } }}><span>{chosen?.label ?? "Choose"}</span><ChevronDown size={15} aria-hidden="true" /></button>
    {open && <dialog ref={dialog} id={`${id}-dialog`} className="modern-select-dialog" style={position} aria-labelledby={`${id}-title`} onCancel={event => { event.preventDefault(); setOpen(false); }} onClick={event => { event.stopPropagation(); if (event.target === event.currentTarget) setOpen(false); }}>
      <div className="modern-select-content">
        <div className="modern-select-handle" aria-hidden="true" />
        <header><div><small>CHOOSE YOUR VIEW</small><h3 id={`${id}-title`}>{label}</h3></div><button type="button" aria-label={`Close ${label.toLowerCase()} choices`} onClick={() => setOpen(false)}><X size={20} /></button></header>
        <div role="listbox" aria-label={ariaLabel} className="modern-select-options">{choices.map((choice, index) => <button key={choice.value} type="button" role="option" aria-selected={choice.value === value} tabIndex={choice.value === value ? 0 : -1} onKeyDown={event => focusOption(event, index)} onClick={() => { onChange(choice.value); setOpen(false); }}><span><b>{choice.label}</b>{choice.description && <small>{choice.description}</small>}</span><span className="modern-select-check" aria-hidden="true">{choice.value === value && <Check size={17} />}</span></button>)}</div>
      </div>
    </dialog>}
  </div>;
}
