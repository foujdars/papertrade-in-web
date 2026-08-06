"use client";

import { Activity, ChevronDown, ChevronsUpDown, Clock3, Minus, PenTool, Plus, Settings, SlidersHorizontal } from "lucide-react";
import { useState, type PointerEvent as ReactPointerEvent } from "react";
import { ChartFunctionMenu } from "@/components/ChartFunctionMenu";
import { DrawingToolLibrary } from "@/components/DrawingToolLibrary";
import { DEFAULT_CHART_INDICATORS, MarketChart, type ChartAction, type ChartActionRequest, type ChartIndicators, type DrawingTool, type FeedStatus } from "@/components/MarketChart";
import { formatInr, type Instrument } from "@/lib/market";

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
  onOptionChain,
  onTimeframeChange,
  onToggleTopMode,
  onToggleOptionType,
  onQuantityChange,
  onOpenOrder,
  onFeedStatus,
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
  onOptionChain: () => void;
  onTimeframeChange: (timeframe: string) => void;
  onToggleTopMode: () => void;
  onToggleOptionType: () => void;
  onQuantityChange: (quantity: number) => void;
  onOpenOrder: (side: "BUY" | "SELL", mode: "Market" | "Limit") => void;
  onFeedStatus: (status: FeedStatus) => void;
}) {
  const [orderMode, setOrderMode] = useState<"Market" | "Limit">("Market");
  const [timeMenuOpen, setTimeMenuOpen] = useState(false);
  const [indicatorMenuOpen, setIndicatorMenuOpen] = useState(false);
  const [drawingMenuOpen, setDrawingMenuOpen] = useState(false);
  const [indicators, setIndicators] = useState<ChartIndicators>(DEFAULT_CHART_INDICATORS);
  const [activeTool, setActiveTool] = useState<DrawingTool>("cursor");
  const [toolSignal, setToolSignal] = useState(0);
  const [chartAction, setChartAction] = useState<ChartActionRequest>();
  const underlyingSymbol = option.underlyingSymbol || topInstrument.underlyingSymbol || topInstrument.symbol;
  const optionLabel = `${option.expiry ? new Date(`${option.expiry}T00:00:00`).toLocaleDateString("en-IN", { day: "2-digit", month: "short" }) : ""} ${option.strikePrice?.toLocaleString("en-IN") ?? ""}`.trim();
  const lots = Math.max(1, Math.round(quantity / lotSize));

  function openTimeMenu(event: React.MouseEvent<HTMLButtonElement>) {
    event.stopPropagation();
    setTimeMenuOpen(true);
  }

  return (
    <section className={`fno-focus-workspace ${tradeDockOpen ? "trade-dock-visible" : ""}`} aria-label="F&O spot and option charts">
      <div
        className="fno-focus-charts"
        style={{ gridTemplateRows: `minmax(0, ${splitPercent}fr) 16px minmax(0, ${100 - splitPercent}fr)` }}
      >
        <section className="fno-chart-card">
          <header>
            <div>
              <button className="fno-instrument-switch" disabled={!canToggleFuture} onClick={(event) => { event.stopPropagation(); onToggleTopMode(); }}>
                <b>{underlyingSymbol}</b><span>{topMode === "FUTURE" ? "Fut" : "Spot"}</span>{canToggleFuture && <ChevronsUpDown size={13} />}
              </button>
              <span>{topPrice > 0 ? topPrice.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—"} <i className={topChange >= 0 ? "positive" : "negative"}>{signedPercent(topChange)}</i></span>
            </div>
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
              magnet={true}
              hiddenDrawings={false}
              lockedDrawings={false}
              clearSignal={0}
              undoSignal={0}
              redoSignal={0}
              indicators={indicators}
              chartAction={chartAction}
              chartTheme="light"
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
                <b>{optionLabel}</b><span>{option.optionType === "CE" ? "Call" : "Put"}</span><ChevronsUpDown size={13} />
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
              magnet={true}
              hiddenDrawings={false}
              lockedDrawings={false}
              clearSignal={0}
              undoSignal={0}
              redoSignal={0}
              indicators={indicators}
              chartAction={chartAction}
              chartTheme="light"
              onChartTap={onToggleTradeDock}
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
              <button className="active"><Clock3 size={16} /><span><b>{timeframe}</b><small>Range</small></span></button>
              <button onClick={() => { setTimeMenuOpen(false); setIndicatorMenuOpen(true); }}><Activity size={16} /><span><b>Indicators</b><small>Studies</small></span></button>
              <button onClick={() => { setTimeMenuOpen(false); setDrawingMenuOpen(true); }}><PenTool size={16} /><span><b>Drawings</b><small>Tools</small></span></button>
              <button onClick={() => { setTimeMenuOpen(false); setIndicatorMenuOpen(true); }}><Settings size={16} /><span><b>Settings</b><small>View</small></span></button>
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
