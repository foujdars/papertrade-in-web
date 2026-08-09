"use client";

import {
  Activity,
  ArrowUpRight,
  BoxSelect,
  Crosshair,
  GitBranch,
  Grid2X2,
  MousePointer2,
  PenTool,
  Ruler,
  Search,
  Shapes,
  Target,
  TrendingUp,
  Type,
  X,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { DRAWING_TOOL_CATALOG, type DrawingTool } from "@/components/MarketChart";

const categories = ["All", ...Array.from(new Set(DRAWING_TOOL_CATALOG.map((tool) => tool.category)))] as const;
const categoryIcons: Record<string, LucideIcon> = {
  Lines: ArrowUpRight,
  Channels: GitBranch,
  Fibonacci: Activity,
  Pitchforks: TrendingUp,
  Gann: Grid2X2,
  Trading: Target,
  Measurement: Ruler,
  Shapes: Shapes,
  Annotations: Type,
};

export function DrawingToolLibrary({
  activeTool,
  onSelect,
  onClose,
}: {
  activeTool: DrawingTool;
  onSelect: (tool: DrawingTool) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<(typeof categories)[number]>("All");

  useEffect(() => {
    const closeWithEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", closeWithEscape);
    return () => window.removeEventListener("keydown", closeWithEscape);
  }, [onClose]);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    return DRAWING_TOOL_CATALOG.filter((tool) =>
      (category === "All" || tool.category === category)
      && (!term || tool.label.toLowerCase().includes(term) || tool.category.toLowerCase().includes(term)),
    );
  }, [category, query]);

  return (
    <div className="drawing-library-backdrop" role="presentation" onPointerDown={onClose}>
      <section className="drawing-library" role="dialog" aria-modal="true" aria-label="All drawing tools" onPointerDown={(event) => event.stopPropagation()}>
        <header>
          <div><PenTool size={18} /><span><b>Drawing tools</b><small>{DRAWING_TOOL_CATALOG.length} TradingView-compatible tools</small></span></div>
          <button onClick={onClose} aria-label="Close drawing tools"><X size={18} /></button>
        </header>
        <label className="drawing-library-search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search lines, Fibonacci, Gann, shapes…" /></label>
        <nav aria-label="Drawing tool categories">
          {categories.map((item) => <button key={item} className={category === item ? "active" : ""} onClick={() => setCategory(item)}>{item}</button>)}
        </nav>
        <div className="drawing-library-grid">
          {!query.trim() && category === "All" && <button className={activeTool === "cursor" ? "active" : ""} onClick={() => { onSelect("cursor"); onClose(); }}><i><MousePointer2 size={17} /></i><span><b>Pointer</b><small>Move, zoom and select drawings</small></span></button>}
          {filtered.map((tool) => {
            const Icon = categoryIcons[tool.category] ?? BoxSelect;
            return (
              <button key={tool.id} className={activeTool === tool.id ? "active" : ""} onClick={() => { onSelect(tool.id); onClose(); }}>
                <i><Icon size={17} /></i>
                <span><b>{tool.label}</b><small>{tool.category} · {tool.anchors} {tool.anchors === 1 ? "point" : "points"}</small></span>
              </button>
            );
          })}
          {!filtered.length && <p>No matching drawing tool.</p>}
        </div>
        <footer><Crosshair size={14} /> Select a tool, then tap its anchor points on the chart. Magnet snaps to candle OHLC.</footer>
      </section>
    </div>
  );
}
