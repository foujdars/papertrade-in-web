"use client";

import {
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  Layers3,
  Lock,
  LockOpen,
  Magnet,
  MousePointer2,
  Redo2,
  Trash2,
  Undo2,
} from "lucide-react";
import { DRAWING_TOOL_CATALOG, type DrawingTool } from "@/components/MarketChart";
import { DrawingToolIcon, QUICK_DRAWING_TOOLS } from "./DrawingToolIcons";

export function ChartDrawingToolbar({
  activeTool,
  magnet,
  locked,
  hidden,
  collapsed = false,
  className = "",
  onSelect,
  onAllTools,
  onToggleMagnet,
  onUndo,
  onRedo,
  onToggleLock,
  onToggleHidden,
  onClear,
  onToggleCollapsed,
}: {
  activeTool: DrawingTool;
  magnet: boolean;
  locked: boolean;
  hidden: boolean;
  collapsed?: boolean;
  className?: string;
  onSelect: (tool: DrawingTool) => void;
  onAllTools: () => void;
  onToggleMagnet: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onToggleLock: () => void;
  onToggleHidden: () => void;
  onClear: () => void;
  onToggleCollapsed?: () => void;
}) {
  return (
    <div className={`drawing-toolbar ${collapsed ? "collapsed" : ""} ${className}`.trim()} aria-label="Drawing tools">
      {onToggleCollapsed && <button className="drawing-toolbar-toggle" onClick={onToggleCollapsed} aria-label={collapsed ? "Show drawing toolbar" : "Hide drawing toolbar"} title={collapsed ? "Show tools" : "Hide tools"}>{collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}</button>}
      {!collapsed && <>
        <button className={activeTool === "cursor" ? "active" : ""} onClick={() => onSelect("cursor")} aria-label="Cursor" title="Cursor"><MousePointer2 size={18} /></button>
        {QUICK_DRAWING_TOOLS.map(({ id, label }) => (
          <button key={id} className={activeTool === id ? "active" : ""} onClick={() => onSelect(id)} aria-label={label} title={label} aria-pressed={activeTool === id}><DrawingToolIcon tool={id} /></button>
        ))}
        <button className="all-drawing-tools" onClick={onAllTools} aria-label={`All ${DRAWING_TOOL_CATALOG.length} drawing tools`} title="Full drawing tools library"><Layers3 size={18} /><small>{DRAWING_TOOL_CATALOG.length}</small></button>
        <span />
        <button className={magnet ? "active" : ""} onClick={onToggleMagnet} aria-label="Magnet" aria-pressed={magnet} title="Magnet"><Magnet size={18} /></button>
        <button onClick={onUndo} aria-label="Undo drawing" title="Undo drawing"><Undo2 size={18} /></button>
        <button onClick={onRedo} aria-label="Redo drawing" title="Redo drawing"><Redo2 size={18} /></button>
        <button className={locked ? "active" : ""} onClick={onToggleLock} aria-label={locked ? "Unlock drawings" : "Lock drawings"} title={locked ? "Unlock drawings" : "Lock drawings"}>{locked ? <Lock size={18} /> : <LockOpen size={18} />}</button>
        <button className={hidden ? "active" : ""} onClick={onToggleHidden} aria-label={hidden ? "Show drawings and indicators" : "Hide drawings and indicators"} aria-pressed={hidden} title={hidden ? "Show drawings and indicators" : "Candles only"}>{hidden ? <EyeOff size={18} /> : <Eye size={18} />}</button>
        <button className="danger-tool" onClick={onClear} aria-label="Delete drawings" title="Delete drawings"><Trash2 size={18} /></button>
      </>}
    </div>
  );
}
