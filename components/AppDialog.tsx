"use client";

import { useEffect, useRef, type CSSProperties, type ReactNode, type RefObject } from "react";
import { useTransientBack } from "./useTransientBack";

/** Shared app-themed modal behavior for pickers and drawers. */
export function AppDialog({ children, className, id, label, labelledBy, style, initialFocus, returnFocus, avoidTouchKeyboard = false, onClose }: {
  children: ReactNode; className?: string; id?: string; label?: string; labelledBy?: string; style?: CSSProperties;
  initialFocus?: string; returnFocus?: RefObject<HTMLElement | null>; avoidTouchKeyboard?: boolean; onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useTransientBack(true, onClose);
  useEffect(() => {
    const node = dialog.current;
    const trigger = returnFocus?.current ?? document.activeElement;
    node?.showModal();
    const selector = avoidTouchKeyboard && matchMedia("(pointer: coarse)").matches ? "button" : initialFocus;
    if (selector) node?.querySelector<HTMLElement>(selector)?.focus({ preventScroll: true });
    return () => { node?.close(); if (trigger instanceof HTMLElement && trigger.isConnected) trigger.focus({ preventScroll: true }); };
  }, [initialFocus, returnFocus, avoidTouchKeyboard]);

  return <dialog ref={dialog} id={id} className={`app-dialog ${className ?? ""}`} aria-label={label} aria-labelledby={labelledBy} style={style}
    onCancel={event => { event.preventDefault(); onClose(); }}
    onKeyDown={event => {
      if (event.key !== "Tab") return;
      const controls = [...event.currentTarget.querySelectorAll<HTMLElement>('button, input, select, textarea, a[href], [tabindex]')]
        .filter(control => control.tabIndex >= 0 && !control.matches(":disabled") && control.getClientRects().length > 0);
      const first = controls[0], last = controls[controls.length - 1];
      if (!first || !last) { event.preventDefault(); return; }
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }}
    onClick={event => {
      event.stopPropagation();
      if (event.target !== event.currentTarget) return;
      const bounds = event.currentTarget.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) onClose();
    }}>{children}</dialog>;
}
