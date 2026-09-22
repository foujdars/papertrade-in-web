"use client";

import { Check, X } from "lucide-react";
import { useEffect } from "react";
import { CHART_STYLE_GROUPS, CHART_STYLES, chartStyleLabel, type ChartStyleId } from "@/lib/chart-style";
import { useChartPreference } from "@/lib/chart-view-preferences";
import { useTransientBack } from "./useTransientBack";
import { ChartStyleGlyph } from "./ChartStyleGlyph";

export function ChartStyleMenu({ onClose }: { onClose: () => void }) {
  const [chartStyle, setChartStyle] = useChartPreference("chartStyle");
  useTransientBack(true, onClose);
  useEffect(() => {
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [onClose]);

  function choose(id: ChartStyleId) {
    setChartStyle(id);
    onClose();
  }

  return (
    <div className="chart-function-backdrop chart-style-backdrop" role="presentation" onPointerDown={onClose}>
      <section className="chart-function-menu chart-style-menu" role="dialog" aria-modal="true" aria-label="Chart type" onPointerDown={(event) => event.stopPropagation()}>
        <header>
          <div><span><b>Chart type</b><small>Same series as TradingView, in this theme</small></span></div>
          <button type="button" onClick={onClose} aria-label="Close chart type menu"><X size={18} /></button>
        </header>
        <div className="chart-style-groups">
          {CHART_STYLE_GROUPS.map((group, index) => (
            <section key={group.id}>
              {index > 0 && <hr />}
              {group.styles.map((id) => {
                const style = CHART_STYLES.find((item) => item.id === id)!;
                const active = chartStyle === id;
                return (
                  <button key={id} type="button" className={active ? "active" : ""} aria-pressed={active} onClick={() => choose(id)}>
                    <ChartStyleGlyph id={id} />
                    <span>{style.label}</span>
                    {active && <Check size={14} />}
                  </button>
                );
              })}
            </section>
          ))}
        </div>
        <footer><small>Showing {chartStyleLabel(chartStyle)}. Saved on this device.</small></footer>
      </section>
    </div>
  );
}
