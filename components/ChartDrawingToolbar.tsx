"use client";

import {
  ArrowUpRight,
  BoxSelect,
  Brush,
  Eye,
  EyeOff,
  FlipHorizontal2,
  Layers3,
  Lock,
  LockOpen,
  Magnet,
  MousePointer2,
  MoveDiagonal2,
  MoveVertical,
  Radio,
  Redo2,
  Ruler,
  Target,
  Trash2,
  TrendingDown,
  TrendingUp,
  Undo2,
  type LucideIcon,
} from "lucide-react";
import type { DrawingTool } from "@/components/MarketChart";

const primaryDrawingTools: { id: DrawingTool; label: string; icon: LucideIcon }[] = [
  { id: "cursor", label: "Cursor", icon: MousePointer2 },
  { id: "trend-line", label: "Trend line", icon: TrendingUp },
  { id: "extended-line", label: "Extended line", icon: MoveDiagonal2 },
  { id: "ray", label: "Diagonal ray", icon: ArrowUpRight },
  { id: "horizontal-line", label: "Horizontal line", icon: Radio },
  { id: "horizontal-ray", label: "Horizontal ray", icon: MoveVertical },
  { id: "vertical-line", label: "Vertical line", icon: FlipHorizontal2 },
  { id: "parallel-channel", label: "Parallel channel", icon: Brush },
  { id: "brush", label: "Brush", icon: Brush },
  { id: "rectangle", label: "Rectangle + mid", icon: BoxSelect },
  { id: "fib-retracement", label: "Fibonacci", icon: Target },
  { id: "price-range", label: "Price range", icon: Ruler },
  { id: "long-position", label: "Long position", icon: TrendingUp },
  { id: "short-position", label: "Short position", icon: TrendingDown },
];

export function ChartDrawingToolbar({
  activeTool,
  magnet,
  locked,
  hidden,
  className = "",
  onSelect,
  onAllTools,
  onToggleMagnet,
  onUndo,
  onRedo,
  onToggleLock,
  onToggleHidden,
  onClear,
}: {
  activeTool: DrawingTool;
  magnet: boolean;
  locked: boolean;
  hidden: boolean;
  className?: string;
  onSelect: (tool: DrawingTool) => void;
  onAllTools: () => void;
  onToggleMagnet: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onToggleLock: () => void;
  onToggleHidden: () => void;
  onClear: () => void;
}) {
  return (
    <div className={`drawing-toolbar ${className}`.trim()} aria-label="Drawing tools">
      {primaryDrawingTools.map(({ id, label, icon: Icon }) => (
        <button key={id} className={activeTool === id ? "active" : ""} onClick={() => onSelect(id)} aria-label={label} title={label}><Icon size={18} /></button>
      ))}
      <button className="all-drawing-tools" onClick={onAllTools} aria-label="All 67 drawing tools" title="All 67 drawing tools"><Layers3 size={18} /><small>67</small></button>
      <span />
      <button className={magnet ? "active" : ""} onClick={onToggleMagnet} aria-label="Magnet" title="Magnet"><Magnet size={18} /></button>
      <button onClick={onUndo} aria-label="Undo drawing" title="Undo drawing"><Undo2 size={18} /></button>
      <button onClick={onRedo} aria-label="Redo drawing" title="Redo drawing"><Redo2 size={18} /></button>
      <button className={locked ? "active" : ""} onClick={onToggleLock} aria-label={locked ? "Unlock drawings" : "Lock drawings"} title={locked ? "Unlock drawings" : "Lock drawings"}>{locked ? <Lock size={18} /> : <LockOpen size={18} />}</button>
      <button className={hidden ? "active" : ""} onClick={onToggleHidden} aria-label="Hide drawings" title="Hide drawings">{hidden ? <EyeOff size={18} /> : <Eye size={18} />}</button>
      <button className="danger-tool" onClick={onClear} aria-label="Delete drawings" title="Delete drawings"><Trash2 size={18} /></button>
    </div>
  );
}
