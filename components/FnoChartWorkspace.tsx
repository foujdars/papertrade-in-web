"use client";

import { Minus, Plus } from "lucide-react";
import { useState, type PointerEvent as ReactPointerEvent } from "react";
import { DEFAULT_CHART_INDICATORS, MarketChart, type FeedStatus } from "@/components/MarketChart";
import { formatInr, type Instrument } from "@/lib/market";

function signedPercent(value: number) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

export function FnoChartWorkspace({
  spot,
  option,
  timeframe,
  spotPrice,
  spotChange,
  optionPrice,
  optionChange,
  splitPercent,
  quantity,
  lotSize,
  margin,
  tradeDockOpen,
  onShowTradeDock,
  onSplitPointerDown,
  onOptionChain,
  onQuantityChange,
  onOpenOrder,
  onFeedStatus,
}: {
  spot: Instrument;
  option: Instrument;
  timeframe: string;
  spotPrice: number;
  spotChange: number;
  optionPrice: number;
  optionChange: number;
  splitPercent: number;
  quantity: number;
  lotSize: number;
  margin: number;
  tradeDockOpen: boolean;
  onShowTradeDock: () => void;
  onSplitPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onOptionChain: () => void;
  onQuantityChange: (quantity: number) => void;
  onOpenOrder: (side: "BUY" | "SELL", mode: "Market" | "Limit") => void;
  onFeedStatus: (status: FeedStatus) => void;
}) {
  const [orderMode, setOrderMode] = useState<"Market" | "Limit">("Market");
  const optionLabel = `${option.expiry ? new Date(`${option.expiry}T00:00:00`).toLocaleDateString("en-IN", { day: "2-digit", month: "short" }) : ""} ${option.strikePrice?.toLocaleString("en-IN") ?? ""} ${option.optionType === "CE" ? "Call" : "Put"}`.trim();
  const lots = Math.max(1, Math.round(quantity / lotSize));

  return (
    <section className={`fno-focus-workspace ${tradeDockOpen ? "trade-dock-visible" : ""}`} aria-label="F&O spot and option charts">
      <div
        className="fno-focus-charts"
        style={{ gridTemplateRows: `minmax(0, ${splitPercent}fr) 36px minmax(0, ${100 - splitPercent}fr)` }}
      >
        <section className="fno-chart-card" onClick={onShowTradeDock}>
          <header>
            <div><b>{spot.symbol} · Spot</b><span>{spotPrice > 0 ? spotPrice.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—"} <i className={spotChange >= 0 ? "positive" : "negative"}>{signedPercent(spotChange)}</i></span></div>
            <button onClick={(event) => { event.stopPropagation(); onOptionChain(); }}>Option Chain</button>
            <small>{timeframe}</small>
          </header>
          <div className="fno-clean-chart">
            <MarketChart
              key={`focus-spot-${spot.instrumentKey}-${timeframe}`}
              instrument={spot}
              timeframe={timeframe}
              activeTool="cursor"
              toolSignal={0}
              magnet={true}
              hiddenDrawings={true}
              lockedDrawings={true}
              clearSignal={0}
              undoSignal={0}
              redoSignal={0}
              indicators={DEFAULT_CHART_INDICATORS}
              chartTheme="light"
              onFeedStatus={() => undefined}
            />
          </div>
        </section>

        <button className="fno-window-slider" onPointerDown={onSplitPointerDown} aria-label="Drag to resize both chart windows"><span /></button>

        <section className="fno-chart-card" onClick={onShowTradeDock}>
          <header>
            <div><b>{optionLabel}</b><span>{optionPrice > 0 ? optionPrice.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—"} <i className={optionChange >= 0 ? "positive" : "negative"}>{signedPercent(optionChange)}</i></span></div>
            <small>{timeframe}</small>
          </header>
          <div className="fno-clean-chart">
            <MarketChart
              key={`focus-option-${option.instrumentKey}-${timeframe}`}
              instrument={option}
              timeframe={timeframe}
              activeTool="cursor"
              toolSignal={0}
              magnet={true}
              hiddenDrawings={true}
              lockedDrawings={true}
              clearSignal={0}
              undoSignal={0}
              redoSignal={0}
              indicators={DEFAULT_CHART_INDICATORS}
              chartTheme="light"
              onFeedStatus={onFeedStatus}
            />
          </div>
        </section>
      </div>

      {tradeDockOpen && (
        <div className="fno-trade-dock">
          <div className="fno-order-modes"><button className={orderMode === "Market" ? "active" : ""} onClick={() => setOrderMode("Market")}>1-Tap Market</button><button className={orderMode === "Limit" ? "active" : ""} onClick={() => setOrderMode("Limit")}>Limit/Trigger on Chart</button></div>
          <div className="fno-trade-actions">
            <button className="buy" onClick={() => onOpenOrder("BUY", orderMode)}>Buy at<br /><b>{orderMode === "Market" ? "Mkt" : optionPrice.toFixed(2)}</b><small>Margin: {formatInr(margin)}</small></button>
            <div className="fno-lot-stepper"><button onClick={() => onQuantityChange(Math.max(lotSize, quantity - lotSize))}><Minus size={17} /></button><span><b>{quantity}</b><small>{lots} lot{lots === 1 ? "" : "s"}</small></span><button onClick={() => onQuantityChange(quantity + lotSize)}><Plus size={17} /></button></div>
            <button className="sell" onClick={() => onOpenOrder("SELL", orderMode)}>Sell at<br /><b>{orderMode === "Market" ? "Mkt" : optionPrice.toFixed(2)}</b><small>Margin: {formatInr(margin)}</small></button>
          </div>
        </div>
      )}
    </section>
  );
}
