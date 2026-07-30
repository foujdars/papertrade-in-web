"use client";

import {
  Activity,
  ArrowLeft,
  BarChart3,
  BoxSelect,
  ChevronDown,
  Eye,
  EyeOff,
  FlipHorizontal2,
  Fullscreen,
  ListFilter,
  Lock,
  LockOpen,
  Magnet,
  Minus,
  MousePointer2,
  Radio,
  Redo2,
  Ruler,
  Search,
  Settings2,
  Trash2,
  TrendingDown,
  TrendingUp,
  Undo2,
  X,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { MarketChart, type DrawingTool, type FeedStatus } from "@/components/MarketChart";
import { formatInr, instruments, type Instrument } from "@/lib/market";

const timeframes = ["1m", "5m", "15m", "1H", "3H", "4H", "1D"] as const;
const ranges = [
  { label: "1D", bars: 75 },
  { label: "5D", bars: 375 },
  { label: "1M", bars: 900 },
  { label: "3M", bars: 1_200 },
  { label: "6M", bars: 1_400 },
  { label: "YTD", bars: 1_500 },
  { label: "1Y", bars: 1_600 },
  { label: "5Y", bars: 1_600 },
  { label: "All", bars: 1_600 },
] as const;

const tools: { id: DrawingTool; label: string; icon: LucideIcon }[] = [
  { id: "cursor", label: "Cursor", icon: MousePointer2 },
  { id: "trend", label: "Trend line", icon: TrendingUp },
  { id: "horizontal", label: "Horizontal line", icon: Minus },
  { id: "ray", label: "Horizontal ray", icon: Radio },
  { id: "channel", label: "Parallel channel", icon: FlipHorizontal2 },
  { id: "rectangle", label: "Rectangle with midpoint", icon: BoxSelect },
  { id: "fib", label: "Fibonacci retracement", icon: ListFilter },
  { id: "range", label: "Price range", icon: Ruler },
  { id: "long", label: "Long position", icon: TrendingUp },
  { id: "short", label: "Short position", icon: TrendingDown },
];

type QuickOrder = {
  id: string;
  symbol: string;
  side: "BUY" | "SELL";
  quantity: number;
  price: number;
  status: "COMPLETE";
  time: string;
};

function getInitialInstrument(symbol: string) {
  return instruments.find((instrument) => instrument.symbol === symbol) ?? instruments[0];
}

export function AdvancedChartWorkspace({
  initialSymbol,
  initialTimeframe,
}: {
  initialSymbol: string;
  initialTimeframe: string;
}) {
  const [instrument, setInstrument] = useState<Instrument>(() => getInitialInstrument(initialSymbol));
  const [timeframe, setTimeframe] = useState(timeframes.includes(initialTimeframe as typeof timeframes[number]) ? initialTimeframe : "5m");
  const [activeTool, setActiveTool] = useState<DrawingTool>("cursor");
  const [toolSignal, setToolSignal] = useState(0);
  const [clearSignal, setClearSignal] = useState(0);
  const [undoSignal, setUndoSignal] = useState(0);
  const [redoSignal, setRedoSignal] = useState(0);
  const [magnet, setMagnet] = useState(true);
  const [drawingsHidden, setDrawingsHidden] = useState(false);
  const [drawingsLocked, setDrawingsLocked] = useState(false);
  const [visibleBars, setVisibleBars] = useState(375);
  const [activeRange, setActiveRange] = useState("5D");
  const [livePrice, setLivePrice] = useState(instrument.price);
  const [feedStatus, setFeedStatus] = useState<FeedStatus>({ mode: "loading", message: "Connecting to Upstox…" });
  const [clock, setClock] = useState<Date | null>(null);
  const [showSymbols, setShowSymbols] = useState(false);
  const [symbolSearch, setSymbolSearch] = useState("");
  const [showIndicators, setShowIndicators] = useState(false);
  const [orderSide, setOrderSide] = useState<"BUY" | "SELL" | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [toast, setToast] = useState("");

  useEffect(() => {
    const initial = window.setTimeout(() => setClock(new Date()), 0);
    const timer = window.setInterval(() => setClock(new Date()), 1_000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(timer);
    };
  }, []);

  const handlePrice = useCallback((price: number) => setLivePrice(price), []);
  const handleFeedStatus = useCallback((status: FeedStatus) => setFeedStatus(status), []);
  const filteredSymbols = useMemo(() => {
    const term = symbolSearch.trim().toLowerCase();
    return instruments.filter((item) => !term || item.symbol.toLowerCase().includes(term) || item.name.toLowerCase().includes(term));
  }, [symbolSearch]);

  function selectTool(tool: DrawingTool) {
    setActiveTool(tool);
    setToolSignal((value) => value + 1);
  }

  function chooseInstrument(next: Instrument) {
    setInstrument(next);
    setLivePrice(next.price);
    setShowSymbols(false);
    setSymbolSearch("");
    const url = new URL(window.location.href);
    url.searchParams.set("symbol", next.symbol);
    window.history.replaceState({}, "", url);
  }

  function chooseTimeframe(next: string) {
    setTimeframe(next);
    const url = new URL(window.location.href);
    url.searchParams.set("timeframe", next);
    window.history.replaceState({}, "", url);
  }

  function chooseRange(label: string, bars: number) {
    setActiveRange(label);
    setVisibleBars(bars);
  }

  function placeQuickOrder() {
    if (!orderSide || quantity < 1) return;
    const order: QuickOrder = {
      id: `${Date.now()}`,
      symbol: instrument.symbol,
      side: orderSide,
      quantity,
      price: livePrice,
      status: "COMPLETE",
      time: new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }),
    };
    try {
      const existing = JSON.parse(localStorage.getItem("papertrade-orders") ?? "[]") as QuickOrder[];
      localStorage.setItem("papertrade-orders", JSON.stringify([order, ...existing]));
    } catch {
      localStorage.setItem("papertrade-orders", JSON.stringify([order]));
    }
    setToast(`${orderSide === "BUY" ? "Bought" : "Sold"} ${quantity} ${instrument.symbol} at ${formatInr(livePrice)}`);
    setOrderSide(null);
    window.setTimeout(() => setToast(""), 3_000);
  }

  function enterFullscreen() {
    if (!document.fullscreenElement) {
      void document.documentElement.requestFullscreen();
    } else {
      void document.exitFullscreen();
    }
  }

  return (
    <main className="advanced-terminal">
      <header className="advanced-topbar">
        <Link href="/" className="advanced-back" aria-label="Back to trading dashboard"><ArrowLeft size={19} /></Link>
        <div className="advanced-brand"><span><TrendingUp size={18} strokeWidth={3} /></span><b>PaperTrade</b> IN</div>
        <div className="advanced-symbol-picker">
          <button onClick={() => setShowSymbols((value) => !value)}>
            <span><b>{instrument.symbol}</b><small>{instrument.name} · NSE</small></span>
            <ChevronDown size={16} />
          </button>
          {showSymbols && (
            <div className="advanced-symbol-menu">
              <label><Search size={15} /><input autoFocus value={symbolSearch} onChange={(event) => setSymbolSearch(event.target.value)} placeholder="Search NSE symbols" /></label>
              <div>{filteredSymbols.map((item) => <button key={item.symbol} onClick={() => chooseInstrument(item)}><span><b>{item.symbol}</b><small>{item.name}</small></span><em>{item.price.toFixed(2)}</em></button>)}</div>
            </div>
          )}
        </div>
        <div className="advanced-quote">
          <strong>{livePrice.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
          <small className={instrument.change >= 0 ? "positive" : "negative"}>{instrument.change >= 0 ? "+" : ""}{instrument.change.toFixed(2)}%</small>
        </div>
        <div className="advanced-order-buttons">
          <button className="advanced-sell" onClick={() => setOrderSide("SELL")}><small>Sell</small><b>{livePrice.toFixed(2)}</b></button>
          <button className="advanced-buy" onClick={() => setOrderSide("BUY")}><small>Buy</small><b>{livePrice.toFixed(2)}</b></button>
        </div>
      </header>

      <nav className="advanced-commandbar" aria-label="Chart controls">
        <div className="advanced-timeframes">{timeframes.map((period) => <button key={period} className={timeframe === period ? "active" : ""} onClick={() => chooseTimeframe(period)}>{period}</button>)}</div>
        <span />
        <button className={showIndicators ? "active" : ""} onClick={() => setShowIndicators((value) => !value)}><Activity size={18} /> Indicators <em>3</em></button>
        <button><BarChart3 size={18} /> Candles</button>
        <span />
        <button title="Undo last drawing" onClick={() => setUndoSignal((value) => value + 1)}><Undo2 size={18} /></button>
        <button title="Redo drawing" onClick={() => setRedoSignal((value) => value + 1)}><Redo2 size={18} /></button>
        <button title="Chart settings"><Settings2 size={18} /></button>
        <button title="Fullscreen" onClick={enterFullscreen}><Fullscreen size={18} /></button>
        {showIndicators && (
          <div className="advanced-indicator-popover">
            <b>Active indicators</b>
            <span><i className="ema-fast" /> EMA 5</span>
            <span><i className="ema-slow" /> EMA 21</span>
            <span><i className="rsi-color" /> RSI 14</span>
            <small>Volume is disabled.</small>
          </div>
        )}
      </nav>

      <section className="advanced-chart-shell">
        <aside className="advanced-drawing-tools" aria-label="Drawing tools">
          {tools.map(({ id, label, icon: Icon }) => (
            <button key={id} className={activeTool === id ? "active" : ""} onClick={() => selectTool(id)} title={label} aria-label={label}><Icon size={19} /></button>
          ))}
          <span />
          <button className={magnet ? "active" : ""} onClick={() => setMagnet((value) => !value)} title="Magnet mode"><Magnet size={19} /></button>
          <button className={drawingsLocked ? "active" : ""} onClick={() => setDrawingsLocked((value) => !value)} title={drawingsLocked ? "Unlock drawings" : "Lock drawings"}>{drawingsLocked ? <Lock size={19} /> : <LockOpen size={19} />}</button>
          <button className={drawingsHidden ? "active" : ""} onClick={() => setDrawingsHidden((value) => !value)} title={drawingsHidden ? "Show drawings" : "Hide drawings"}>{drawingsHidden ? <EyeOff size={19} /> : <Eye size={19} />}</button>
          <button className="danger" onClick={() => setClearSignal((value) => value + 1)} title="Delete all drawings"><Trash2 size={19} /></button>
        </aside>
        <div className="advanced-chart-canvas">
          <MarketChart
            key={`${instrument.symbol}-${timeframe}`}
            instrument={instrument}
            timeframe={timeframe}
            activeTool={activeTool}
            toolSignal={toolSignal}
            magnet={magnet}
            hiddenDrawings={drawingsHidden}
            lockedDrawings={drawingsLocked}
            clearSignal={clearSignal}
            undoSignal={undoSignal}
            redoSignal={redoSignal}
            visibleBars={visibleBars}
            onPrice={handlePrice}
            onFeedStatus={handleFeedStatus}
          />
        </div>
      </section>

      <footer className="advanced-statusbar">
        <div className="advanced-ranges">{ranges.map((range) => <button key={range.label} className={activeRange === range.label ? "active" : ""} onClick={() => chooseRange(range.label, range.bars)}>{range.label}</button>)}</div>
        <div className={`advanced-feed feed-${feedStatus.mode}`} title={feedStatus.message}><i /> {feedStatus.mode === "live" ? "Upstox live" : feedStatus.mode === "loading" ? "Connecting" : feedStatus.mode === "error" ? "Feed warning" : "Simulation"}</div>
        <time>{clock ? `${clock.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })} · ${clock.toLocaleTimeString("en-IN", { hour12: false })} UTC+5:30` : "India · UTC+5:30"}</time>
        <button>log</button><button>auto</button>
      </footer>

      {orderSide && (
        <div className="advanced-order-dock">
          <button className="advanced-dock-close" onClick={() => setOrderSide(null)} aria-label="Close order"><X size={17} /></button>
          <span className={orderSide === "BUY" ? "buy-tag" : "sell-tag"}>{orderSide}</span>
          <div><b>{instrument.symbol}</b><small>Market · Intraday · Paper order</small></div>
          <label>Qty <input type="number" min="1" value={quantity} onChange={(event) => setQuantity(Math.max(1, Number(event.target.value)))} /></label>
          <div><small>Order value</small><b>{formatInr(livePrice * quantity)}</b></div>
          <button className={orderSide === "BUY" ? "dock-buy" : "dock-sell"} onClick={placeQuickOrder}>Confirm {orderSide}</button>
        </div>
      )}
      {toast && <div className="toast advanced-toast">{toast}</div>}
    </main>
  );
}
