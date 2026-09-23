"use client";
import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/** Keep chart dialogs outside chart stacking and clipping contexts, with the app theme. */
export function ChartDialogPortal({ children }: { children: ReactNode }) {
  const [host, setHost] = useState<Element | null>(null);
  useEffect(() => { setHost(document.querySelector(".terminal-shell") ?? document.body); }, []);
  return host ? createPortal(children, host) : null;
}
