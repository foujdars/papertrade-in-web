"use client";

import {
  Activity,
  BarChart3,
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
import type { ChartAction, ChartIndicators } from "@/components/MarketChart";

const studies: Array<{ key: keyof ChartIndicators; name: string; detail: string; color: string }> = [
  { key: "ema5", name: "EMA 5", detail: "Fast exponential average", color: "#0ea5e9" },
  { key: "ema21", name: "EMA 21", detail: "Short trend average", color: "#ff8a00" },
  { key: "ema30", name: "EMA 30", detail: "30-candle exponential average", color: "#22c55e" },
  { key: "ema50", name: "EMA 50", detail: "Medium trend average", color: "#8b5cf6" },
  { key: "ema100", name: "EMA 100", detail: "100-candle exponential average", color: "#f97316" },
  { key: "ema200", name: "EMA 200", detail: "Long trend average", color: "#e11d48" },
  { key: "sma20", name: "SMA 20", detail: "20-candle simple average", color: "#14b8a6" },
  { key: "sma50", name: "SMA 50", detail: "50-candle simple average", color: "#64748b" },
  { key: "sma200", name: "SMA 200", detail: "200-candle simple average", color: "#111827" },
  { key: "vwap", name: "VWAP", detail: "Session volume-weighted price", color: "#d946ef" },
  { key: "supertrend", name: "Supertrend", detail: "ATR 10 · multiplier 3", color: "#00a67e" },
  { key: "bollinger", name: "Bollinger Bands", detail: "20 period · 2 deviation", color: "#6366f1" },
  { key: "rsi", name: "RSI 14", detail: "Separate 0–100 momentum pane", color: "#7c4dff" },
  { key: "macd", name: "MACD", detail: "12, 26, 9 with histogram", color: "#2563eb" },
  { key: "pivots", name: "Classic Pivots", detail: "P, R1–R3 and S1–S3", color: "#7c3aed" },
];

export function ChartFunctionMenu({
  indicators,
  onToggleIndicator,
  onAction,
  onClose,
}: {
  indicators: ChartIndicators;
  onToggleIndicator: (indicator: keyof ChartIndicators) => void;
  onAction: (action: ChartAction) => void;
  onClose: () => void;
}) {
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
      <section className="chart-function-menu" role="dialog" aria-modal="true" aria-label="Functions" onPointerDown={(event) => event.stopPropagation()}>
        <header><div><LineChart size={18} /><span><b>Functions</b><small>Indicators, view, scale and export</small></span></div><button onClick={onClose} aria-label="Close functions"><X size={18} /></button></header>
        <div className="chart-function-section-title"><Activity size={15} /><span><b>Indicators</b><small>Switch each study on or off independently</small></span></div>
        <div className="chart-study-grid">
          {studies.map((study) => (
            <button key={study.key} className={indicators[study.key] ? "active" : ""} onClick={() => onToggleIndicator(study.key)} aria-pressed={indicators[study.key]}>
              <i style={{ background: study.color }} />
              <span><b>{study.name}</b><small>{study.detail}</small></span>
              <em>{indicators[study.key] ? "ON" : "OFF"}</em>
            </button>
          ))}
        </div>
        <div className="chart-function-section-title"><BarChart3 size={15} /><span><b>Chart controls</b><small>Navigation, appearance and export</small></span></div>
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
        <footer>VWAP uses Upstox candle volume · pinch or mouse-wheel to zoom · drag to pan</footer>
      </section>
    </div>
  );
}
