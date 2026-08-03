"use client";

import {
  Camera,
  Crosshair,
  Expand,
  Grid3X3,
  LineChart,
  Radio,
  Scan,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useEffect, useState } from "react";
import type { ChartAction } from "@/components/MarketChart";

export function ChartFunctionMenu({ onAction, onClose }: { onAction: (action: ChartAction) => void; onClose: () => void }) {
  const [gridVisible, setGridVisible] = useState(true);
  const [crosshairVisible, setCrosshairVisible] = useState(true);
  const [scale, setScale] = useState<"normal" | "log" | "percent" | "indexed">("normal");

  useEffect(() => {
    const closeWithEscape = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", closeWithEscape);
    return () => window.removeEventListener("keydown", closeWithEscape);
  }, [onClose]);

  return (
    <div className="chart-function-backdrop" role="presentation" onPointerDown={onClose}>
      <section className="chart-function-menu" role="dialog" aria-modal="true" aria-label="Chart functions" onPointerDown={(event) => event.stopPropagation()}>
        <header><div><LineChart size={18} /><span><b>Chart functions</b><small>View, scale and export controls</small></span></div><button onClick={onClose} aria-label="Close chart functions"><X size={18} /></button></header>
        <div className="chart-function-grid">
          <button onClick={() => onAction("fit")}><Scan size={18} /><span><b>Fit all data</b><small>Show complete loaded range</small></span></button>
          <button onClick={() => onAction("live")}><Radio size={18} /><span><b>Go to live</b><small>Jump to latest candle</small></span></button>
          <button onClick={() => onAction("zoom-in")}><ZoomIn size={18} /><span><b>Zoom in</b><small>Show fewer candles</small></span></button>
          <button onClick={() => onAction("zoom-out")}><ZoomOut size={18} /><span><b>Zoom out</b><small>Show more candles</small></span></button>
          <button className={gridVisible ? "active" : ""} onClick={() => { setGridVisible((value) => !value); onAction("toggle-grid"); }}><Grid3X3 size={18} /><span><b>Grid</b><small>{gridVisible ? "Visible" : "Hidden"}</small></span></button>
          <button className={crosshairVisible ? "active" : ""} onClick={() => { setCrosshairVisible((value) => !value); onAction("toggle-crosshair"); }}><Crosshair size={18} /><span><b>Crosshair</b><small>{crosshairVisible ? "Visible" : "Hidden"}</small></span></button>
          <button onClick={() => onAction("screenshot")}><Camera size={18} /><span><b>Save image</b><small>Download PNG chart</small></span></button>
          <button onClick={() => onAction("reset")}><Expand size={18} /><span><b>Reset view</b><small>Restore default live range</small></span></button>
        </div>
        <div className="chart-scale-options">
          <b>Price scale</b>
          {(["normal", "log", "percent", "indexed"] as const).map((item) => <button key={item} className={scale === item ? "active" : ""} onClick={() => { setScale(item); onAction(`scale-${item}` as ChartAction); }}>{item === "indexed" ? "Indexed 100" : item === "percent" ? "Percentage" : item === "log" ? "Logarithmic" : "Normal"}</button>)}
        </div>
        <footer>Pinch or mouse-wheel to zoom · drag to pan · double-tap the price scale to reset it</footer>
      </section>
    </div>
  );
}
