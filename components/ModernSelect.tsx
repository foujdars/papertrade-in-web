"use client";

import { Check, ChevronDown, X } from "lucide-react";
import { useId, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { AppDialog } from "./AppDialog";

export type SelectChoice<T extends string> = { value: T; label: string; description?: string; disabled?: boolean };

/** Native dialog supplies modality/focus containment; the options stay app-themed on Android. */
export function ModernSelect<T extends string>({ label, ariaLabel = label, value, choices, onChange, hideLabel = false }: {
  label: string; ariaLabel?: string; value: T; choices: readonly SelectChoice<T>[]; onChange: (value: T) => void; hideLabel?: boolean;
}) {
  const id = useId(), trigger = useRef<HTMLButtonElement>(null), options = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false), [position, setPosition] = useState<CSSProperties>({});
  const [focusedValue, setFocusedValue] = useState(value);
  const chosen = choices.find(choice => choice.value === value);
  const openChoices = () => { setFocusedValue(value); setOpen(true); };

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

  function focusOption(event: React.KeyboardEvent, index: number) {
    const enabled = choices.map((choice, i) => choice.disabled ? -1 : i).filter(i => i >= 0);
    if (!enabled.length) return;
    let next = index;
    const current = enabled.indexOf(index);
    if (event.key === "ArrowDown") next = enabled[(current + 1) % enabled.length];
    else if (event.key === "ArrowUp") next = enabled[(current - 1 + enabled.length) % enabled.length];
    else if (event.key === "Home") next = enabled[0];
    else if (event.key === "End") next = enabled[enabled.length - 1];
    else if (event.key.length === 1 && /[a-z0-9]/i.test(event.key)) {
      const ordered = [...enabled.slice(current + 1), ...enabled.slice(0, current + 1)];
      const match = ordered.find(i => choices[i].label.toLowerCase().startsWith(event.key.toLowerCase()));
      if (match == null) return;
      next = match;
    } else return;
    event.preventDefault(); options.current?.querySelectorAll<HTMLElement>('[role="option"]')[next]?.focus();
  }

  return <div className="modern-select">
    {!hideLabel && <span className="modern-select-label" id={`${id}-label`}>{label}</span>}
    <button ref={trigger} type="button" className="modern-select-trigger" aria-label={ariaLabel} aria-haspopup="dialog" aria-expanded={open} aria-controls={`${id}-dialog`} onClick={openChoices} onKeyDown={event => { if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); openChoices(); } }}><span>{chosen?.label ?? "Choose"}</span><ChevronDown size={15} aria-hidden="true" /></button>
    {open && <AppDialog id={`${id}-dialog`} className="modern-select-dialog" style={position} labelledBy={`${id}-title`} returnFocus={trigger} initialFocus='[aria-selected="true"]:not(:disabled)' onClose={() => setOpen(false)}>
      <div className="modern-select-content">
        <div className="modern-select-handle" aria-hidden="true" />
        <header><div><h3 id={`${id}-title`}>{label}</h3></div><button type="button" aria-label={`Close ${label.toLowerCase()} choices`} onClick={() => setOpen(false)}><X size={20} /></button></header>
        <div ref={options} role="listbox" aria-label={ariaLabel} className="modern-select-options">{choices.map((choice, index) => <button key={choice.value} type="button" role="option" aria-selected={choice.value === value} aria-disabled={choice.disabled || undefined} disabled={choice.disabled} tabIndex={!choice.disabled && choice.value === focusedValue ? 0 : -1} onFocus={() => setFocusedValue(choice.value)} onKeyDown={event => focusOption(event, index)} onClick={() => { onChange(choice.value); setOpen(false); }}><span><b>{choice.label}</b>{choice.description && <small>{choice.description}</small>}</span><span className="modern-select-check" aria-hidden="true">{choice.value === value && <Check size={17} />}</span></button>)}</div>
      </div>
    </AppDialog>}
  </div>;
}
