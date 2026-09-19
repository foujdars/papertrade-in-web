"use client";
import { MousePointer2, Search, Star, X, PencilRuler } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { DRAWING_TOOL_CATALOG, type DrawingTool } from "./MarketChart";
import { DrawingToolIcon } from "./DrawingToolIcons";
import { useChartPreference } from "@/lib/chart-view-preferences";
import { useTransientBack } from "./useTransientBack";

export function drawingCategory(tool: { id: string; category: string }) {
  if (["brush", "highlighter", "arrow-marker", "arrow-mark-up", "arrow-mark-down", "arrow"].includes(tool.id)) return "Geometric shapes";
  return ({ Lines: "Trend lines", Channels: "Trend lines", Pitchforks: "Trend lines", Fibonacci: "Gann and Fibonacci", Gann: "Gann and Fibonacci", Trading: "Forecasting and measurement", Measurement: "Forecasting and measurement", Shapes: "Geometric shapes", Annotations: "Annotation", Patterns: "Patterns", Visuals: "Visuals" } as Record<string, string>)[tool.category] ?? tool.category;
}
const groups = ["Trend lines", "Gann and Fibonacci", "Patterns", "Forecasting and measurement", "Geometric shapes", "Annotation", "Visuals"];
const categories = ["Favorites", "Tools", ...groups];

export function DrawingToolLibrary({ activeTool, onSelect, onClose }: { activeTool: DrawingTool; onSelect: (tool: DrawingTool) => void; onClose: () => void }) {
  const [query, setQuery] = useState(""), [category, setCategory] = useState("Favorites");
  const [favorites, setFavorites] = useChartPreference("drawingFavorites");
  const [showFavorites, setShowFavorites] = useChartPreference("showDrawingFavorites");
  const panel = useRef<HTMLElement>(null);
  useTransientBack(true, onClose);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    panel.current?.focus();
    return () => { if (previous?.isConnected) previous.focus(); };
  }, []);
  const term = query.trim().toLowerCase();
  const filtered = DRAWING_TOOL_CATALOG.filter(tool => (term ? `${tool.label} ${drawingCategory(tool)}`.toLowerCase().includes(term) : category === "Tools" || (category === "Favorites" ? favorites.includes(tool.id) : drawingCategory(tool) === category)));
  const choose = (tool: DrawingTool) => { onSelect(tool); onClose(); };
  return <div className="drawing-library-backdrop drawing-studio-backdrop" onPointerDown={onClose}>
    <section ref={panel} tabIndex={-1} className="drawing-library drawing-studio" role="dialog" aria-modal="true" aria-label="Drawing tools" onPointerDown={e => e.stopPropagation()} onKeyDown={e => {
      if (e.key !== "Tab") return;
      const nodes = Array.from(panel.current?.querySelectorAll<HTMLElement>('button:not([disabled]),input,[tabindex="0"]') ?? []).filter(el => el.getClientRects().length);
      if (e.shiftKey && (document.activeElement === nodes[0] || document.activeElement === panel.current)) { e.preventDefault(); nodes.at(-1)?.focus(); }
      else if (!e.shiftKey && document.activeElement === nodes.at(-1)) { e.preventDefault(); nodes[0]?.focus(); }
    }}>
      <div className="drawing-sheet-grip" aria-hidden="true" />
      <header><h2>Drawings</h2><button onClick={onClose} aria-label="Close drawing tools"><X size={21} /></button></header>
      <label className="drawing-library-search"><Search size={20} /><input aria-label="Search drawing tools" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search drawings" />{query && <button aria-label="Clear drawing search" onClick={() => setQuery("")}><X size={17} /></button>}</label>
      <nav aria-label="Drawing tool categories">{categories.map(item => <button key={item} aria-pressed={category === item && !term} className={category === item && !term ? "active" : ""} onClick={e => { setCategory(item); setQuery(""); e.currentTarget.scrollIntoView({ block: "nearest", inline: "nearest" }); }}>{item}</button>)}</nav>
      <div className="drawing-studio-content">
        {category === "Tools" && !term && <button className="drawing-pointer" onClick={() => choose("cursor")}><MousePointer2 size={20} />Pointer <small>Move and select drawings</small></button>}
        {groups.map(group => {
          const tools = filtered.filter(t => drawingCategory(t) === group);
          return tools.length ? <section key={group} className="drawing-tool-group"><h3>{group}</h3>{group === "Patterns" && <p className="drawing-group-hint">Manual templates. Place each turning point; no automatic detection or ratio validation.</p>}{group === "Forecasting and measurement" && <p className="drawing-group-hint">Positions: place entry → stop → target. Labels show price, per-unit change and percentage; the middle ratio is reward ÷ risk. No order is placed.</p>}<div className="drawing-tile-grid">{tools.map(tool => <div key={tool.id} className={`drawing-tile ${activeTool === tool.id ? "selected" : ""}`}>
            <button className="drawing-tile-select" aria-label={tool.label} aria-pressed={activeTool === tool.id} onClick={() => choose(tool.id)}><DrawingToolIcon tool={tool.id} width={30} height={30} /><span>{tool.label}</span></button>
            <button className={`drawing-favorite ${favorites.includes(tool.id) ? "saved" : ""}`} aria-label={`${favorites.includes(tool.id) ? "Unfavorite" : "Favorite"} ${tool.label}`} aria-pressed={favorites.includes(tool.id)} onClick={() => setFavorites(current => current.includes(tool.id) ? current.filter(id => id !== tool.id) : [...current, tool.id])}><Star size={16} fill={favorites.includes(tool.id) ? "currentColor" : "none"} /></button>
          </div>)}</div></section> : null;
        })}
        {!filtered.length && <p className="drawing-empty">{term ? "No matching drawings. Try a different name." : "No favorites yet. Tap a star on any tool to keep it here."}</p>}
      </div>
      <footer><PencilRuler size={20} /><span>Show favorites on chart</span><button role="switch" aria-label="Show favorites on chart" aria-checked={showFavorites} className="drawing-favorites-switch" onClick={() => setShowFavorites(v => !v)}><i /></button></footer>
    </section>
  </div>;
}
