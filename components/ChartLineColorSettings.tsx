"use client";

import { X } from "lucide-react";
import { useEffect } from "react";
import { ChartDialogPortal } from "./ChartDialogPortal";

const COLORS = ["#2962FF", "#E91E63", "#FF6D00", "#089981", "#9C27B0", "#00BCD4", "#F04458", "#1E293B"];

export function ChartLineColorSettings({ name, color, onChange, onClose }: {
  name: string;
  color: string;
  onChange: (color: string) => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [onClose]);
  return <ChartDialogPortal>
    <div className="chart-function-backdrop chart-line-color-backdrop" onPointerDown={onClose} role="presentation">
      <section className="chart-function-menu chart-line-color-menu" role="dialog" aria-modal="true" aria-label={`${name} line settings`} onPointerDown={(event) => event.stopPropagation()}>
        <header><div><span><b>{name}</b><small>Line color</small></span></div><button type="button" aria-label="Close line settings" onClick={onClose}><X size={18}/></button></header>
        <div className="chart-line-color-swatches" role="group" aria-label="Choose line color">
          {COLORS.map((choice) => <button key={choice} type="button" aria-label={`Set line color ${choice}`} aria-pressed={choice.toLowerCase() === color.toLowerCase()} className={choice.toLowerCase() === color.toLowerCase() ? "active" : ""} style={{ background: choice }} onClick={() => onChange(choice)} />)}
        </div>
        <label className="chart-line-custom-color">Custom color <input type="color" value={color} aria-label="Custom line color" onChange={(event) => onChange(event.target.value)} /></label>
        <footer><button type="button" onClick={onClose}>Done</button></footer>
      </section>
    </div>
  </ChartDialogPortal>;
}
