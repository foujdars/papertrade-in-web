"use client";
import { StockLogo } from "@/components/StockLogo";

import { Activity, ChevronDown, ChevronsUpDown, ListFilter, Minus, PenTool, Plus, SlidersHorizontal } from "lucide-react";
import { useState, type PointerEvent as ReactPointerEvent } from "react";
import { ChartFunctionMenu } from "@/components/ChartFunctionMenu";
import { ChartDrawingToolbar } from "@/components/ChartDrawingToolbar";
import { DrawingToolLibrary } from "@/components/DrawingToolLibrary";
import { MarketChart, type ChartAction, type ChartActionRequest, type ChartOrderTool, type ChartTradeMarker, type DrawingTool, type FeedStatus } from "@/components/MarketChart";
import { formatInr, type Instrument } from "@/lib/market";
import { usePersistentChartIndicators } from "@/lib/chart-indicator-preferences";

const FNO_TIMEFRAME_GROUPS = [
  { label: "Minute", values: ["1m", "2m", "3m", "5m", "10m", "15m", "30m"] },
  { label: "Hour", values: ["1H", "2H", "3H", "4H"] },
  { label: "Day & higher", values: ["1D", "1W", "1M", "1Y"] },
] as const;

function signedPercent(value: number) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

export function FnoChartWorkspace({
  topInstrument,
  topMode,
  canToggleFuture,
  option,
  timeframe,
  topPrice,
  topChange,
  optionPrice,
  optionChange,
  splitPercent,
  quantity,
  lotSize,
  margin,
  tradeDockOpen,
  optionSwitching,
  onToggleTradeDock,
  onSplitPointerDown,
  onOpenSymbols,
  onOptionChain,
  onTimeframeChange,
  onToggleTopMode,
  onToggleOptionType,
  onQuantityChange,
  onOpenOrder,
  onFeedStatus,
  orderTool,
  onOrderToolChange,
  onOrderToolClose,
  onOrderToolExit,
  tradeMarkers = [],
  chartTheme,
}: {
  topInstrument: Instrument;
  topMode: "SPOT" | "FUTURE";
  canToggleFuture: boolean;
  option: Instrument;
  timeframe: string;
  topPrice: number;
  topChange: number;
  optionPrice: number;
  optionChange: number;
  splitPercent: number;
  quantity: number;
  lotSize: number;
  margin: number;
  tradeDockOpen: boolean;
  optionSwitching: boolean;
  onToggleTradeDock: () => void;
  onSplitPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onOpenSymbols: () => void;
  onOptionChain: () => void;
  onTimeframeChange: (timeframe: string) => void;
  onToggleTopMode: () => void;
  onToggleOptionType: () => void;
  onQuantityChange: (quantity: number) => void;
  onOpenOrder: (side: "BUY" | "SELL", mode: "Market" | "Limit") => void;
  onFeedStatus: (status: FeedStatus) => void;
  orderTool?: ChartOrderTool;
  onOrderToolChange?: (level: "target" | "stopLoss", value: number, committed: boolean) => void;
  onOrderToolClose?: () => void;
  onOrderToolExit?: () => void;
  tradeMarkers?: ChartTradeMarker[];
  chartTheme: "light" | "neon";
}) {
  const [orderMode, setOrderMode] = useState<"Market" | "Limit">("Market");
  const [timeMenuOpen, setTimeMenuOpen] = useState(false);
  const [indicatorMenuOpen, setIndicatorMenuOpen] = useState(false);
  const [drawingMenuOpen, setDrawingMenuOpen] = useState(false);
  const [indicators, setIndicators] = usePersistentChartIndicators();
  const [activeTool, setActiveTool] = useState<DrawingTool>("cursor");
  const [toolSignal, setToolSignal] = useState(0);
  const [chartAction, setChartAction] = useState<ChartActionRequest>();
  const [magnet, setMagnet] = useState(true);
  const [lockedDrawings, setLockedDrawings] = useState(false);
  const [hiddenDrawings, setHiddenDrawings] = useState(false);
  const [clearSignal, setClearSignal] = useState(0);
  const [undoSignal, setUndoSignal] = useState(0);
  const [redoSignal, setRedoSignal] = useState(0);
  const [toolbarCollapsed, setToolbarCollapsed] = useState(true);
  const underlyingSymbol = option.underlyingSymbol || topInstrument.underlyingSymbol || topInstrument.symbol;
  const optionLabel = `${option.expiry ? new Date(`${option.expiry}T00:00:00`).toLocaleDateString("en-IN", { day: "2-digit", month: "short" }) : ""} ${option.strikePrice?.toLocaleString("en-IN") ?? ""}`.trim();
  const lots = Math.max(1, Math.round(quantity / lotSize));

  function openTimeMenu(event: React.MouseEvent<HTMLButtonElement>) {
    event.stopPropagation();
    setTimeMenuOpen(true);
  }

  return (
    <section className={`fno-focus-workspace ${tradeDockOpen ? "trade-dock-visible" : ""} ${toolbarCollapsed ? "toolbar-collapsed" : ""}`} aria-label="F&O spot and option charts">
      <ChartDrawingToolbar
        className="fno-drawing-toolbar"
        activeTool={activeTool}
        magnet={magnet}
        locked={lockedDrawings}
        hidden={hiddenDrawings}
        collapsed={toolbarCollapsed}
        onToggleCollapsed={() => setToolbarCollapsed((value) => !value)}
        onSelect={(tool) => { setActiveTool(tool); setToolSignal((value) => value + 1); }}
        onAllTools={() => setDrawingMenuOpen(true)}
        onToggleMagnet={() => setMagnet((value) => !value)}
        onUndo={() => setUndoSignal((value) => value + 1)}
        onRedo={() => setRedoSignal((value) => value + 1)}
        onToggleLock={() => setLockedDrawings((value) => !value)}
        onToggleHidden={() => setHiddenDrawings((value) => !value)}
        onClear={() => setClearSignal((value) => value + 1)}
      />
      <div
        className="fno-focus-charts"
        style={{ gridTemplateRows: `minmax(0, ${splitPercent}fr) 16px minmax(0, ${100 - splitPercent}fr)` }}
      >
        <section className="fno-chart-card">
          <header>
            <div>
              <button className="fno-instrument-switch" disabled={!canToggleFuture} onClick={(event) => { event.stopPropagation(); onToggleTopMode(); }}>
                <StockLogo {...topInstrument} size={24} /><b>{underlyingSymbol}</b><span>{topMode === "FUTURE" ? "Fut" : "Spot"}</span>{canToggleFuture && <ChevronsUpDown size={13} />}
              </button>
              <span>{topPrice > 0 ? topPrice.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—"} <i className={topChange >= 0 ? "positive" : "negative"}>{signedPercent(topChange)}</i></span>
            </div>
            <button className="fno-symbol-list-link" onClick={(event) => { event.stopPropagation(); onOpenSymbols(); }} aria-label="Open indices and F&O symbols"><ListFilter size={15} /></button>
            <button className="fno-option-chain-link" onClick={(event) => { event.stopPropagation(); onOptionChain(); }}>Option Chain</button>
            <button className="fno-timeframe-trigger" onClick={openTimeMenu}>{timeframe}<SlidersHorizontal size={15} /></button>
          </header>
          <div className="fno-clean-chart">
            <MarketChart
              key={`focus-top-${topInstrument.instrumentKey}-${timeframe}`}
              instrument={topInstrument}
              timeframe={timeframe}
              activeTool={activeTool}
              toolSignal={toolSignal}
              onDrawingComplete={() => setActiveTool("cursor")}
              magnet={magnet}
              hiddenDrawings={hiddenDrawings}
              lockedDrawings={lockedDrawings}
              clearSignal={clearSignal}
              undoSignal={undoSignal}
              redoSignal={redoSignal}
              indicators={indicators}
              chartAction={chartAction}
              chartTheme={chartTheme}
              onChartTap={onToggleTradeDock}
              onFeedStatus={() => undefined}
            />
          </div>
        </section>

        <button className="fno-window-slider" onPointerDown={onSplitPointerDown} aria-label="Drag to resize both chart windows"><span /></button>

        <section className="fno-chart-card">
          <header>
            <div>
              <button className="fno-instrument-switch" disabled={optionSwitching} onClick={(event) => { event.stopPropagation(); onToggleOptionType(); }}>
                <StockLogo {...option} size={24} /><b>{optionLabel}</b><span>{option.optionType === "CE" ? "Call" : "Put"}</span><ChevronsUpDown size={13} />
              </button>
              <span>{optionPrice > 0 ? optionPrice.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—"} <i className={optionChange >= 0 ? "positive" : "negative"}>{signedPercent(optionChange)}</i></span>
            </div>
            <button className="fno-timeframe-trigger" onClick={openTimeMenu}>{timeframe}<SlidersHorizontal size={15} /></button>
          </header>
          <div className="fno-clean-chart">
            <MarketChart
              key={`focus-option-${option.instrumentKey}-${timeframe}`}
              instrument={option}
              timeframe={timeframe}
              activeTool={activeTool}
              toolSignal={toolSignal}
              onDrawingComplete={() => setActiveTool("cursor")}
              magnet={magnet}
              hiddenDrawings={hiddenDrawings}
              lockedDrawings={lockedDrawings}
              clearSignal={clearSignal}
              undoSignal={undoSignal}
              redoSignal={redoSignal}
              indicators={indicators}
              chartAction={chartAction}
              chartTheme={chartTheme}
              onChartTap={onToggleTradeDock}
              orderTool={orderTool}
              onOrderToolChange={onOrderToolChange}
              onOrderToolClose={onOrderToolClose}
              onOrderToolExit={onOrderToolExit}
              tradeMarkers={tradeMarkers}
              onFeedStatus={onFeedStatus}
            />
          </div>
        </section>
      </div>

      {tradeDockOpen && (
        <div className="fno-trade-dock">
          <div className="fno-order-modes"><button className={orderMode === "Market" ? "active" : ""} onClick={() => setOrderMode("Market")}>1-Tap Market</button><button className={orderMode === "Limit" ? "active" : ""} onClick={() => setOrderMode("Limit")}>Limit/Trigger on Chart</button></div>
          <div className="fno-trade-actions">
            <button className="sell" onClick={() => onOpenOrder("SELL", orderMode)}>Sell at <b>{orderMode === "Market" ? "Mkt" : optionPrice.toFixed(2)}</b><small>Margin {formatInr(margin)}</small></button>
            <div className="fno-lot-stepper"><button onClick={() => onQuantityChange(Math.max(lotSize, quantity - lotSize))}><Minus size={16} /></button><span><b>{quantity}</b><small>{lots} lot{lots === 1 ? "" : "s"}</small></span><button onClick={() => onQuantityChange(quantity + lotSize)}><Plus size={16} /></button></div>
            <button className="buy" onClick={() => onOpenOrder("BUY", orderMode)}>Buy at <b>{orderMode === "Market" ? "Mkt" : optionPrice.toFixed(2)}</b><small>Margin {formatInr(margin)}</small></button>
          </div>
        </div>
      )}

      {timeMenuOpen && (
        <>
          <button className="fno-time-menu-backdrop" onClick={() => setTimeMenuOpen(false)} aria-label="Close timeframe menu" />
          <section className="fno-timeframe-menu" aria-label="Chart timeframe">
            <header><b>Chart interval</b><button onClick={() => setTimeMenuOpen(false)}><ChevronDown size={17} /></button></header>
            <nav className="fno-chart-menu-tabs" aria-label="Chart menu sections">
              <button onClick={() => { setTimeMenuOpen(false); setIndicatorMenuOpen(true); }}><Activity size={16} /><span><b>Indicators</b><small>Studies</small></span></button>
              <button onClick={() => { setTimeMenuOpen(false); setDrawingMenuOpen(true); }}><PenTool size={16} /><span><b>Tools</b><small>Drawings</small></span></button>
            </nav>
            {FNO_TIMEFRAME_GROUPS.map((group) => (
              <div key={group.label}><span>{group.label}</span><nav>{group.values.map((value) => <button key={value} className={timeframe === value ? "active" : ""} onClick={() => { onTimeframeChange(value); setTimeMenuOpen(false); }}>{value}</button>)}</nav></div>
            ))}
          </section>
        </>
      )}
      {indicatorMenuOpen && <ChartFunctionMenu indicators={indicators} onToggleIndicator={(indicator) => setIndicators((current) => ({ ...current, [indicator]: !current[indicator] }))} onAction={(type: ChartAction) => setChartAction((current) => ({ type, token: (current?.token ?? 0) + 1 }))} onClose={() => setIndicatorMenuOpen(false)} />}
      {drawingMenuOpen && <DrawingToolLibrary activeTool={activeTool} onSelect={(tool) => { setActiveTool(tool); setToolSignal((value) => value + 1); }} onClose={() => setDrawingMenuOpen(false)} />}
    </section>
  );
}
