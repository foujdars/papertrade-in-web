"use client";

import {
  Activity,
  ArrowLeft,
  ArrowUpRight,
  BoxSelect,
  Brush,
  ChevronDown,
  Eye,
  EyeOff,
  FlipHorizontal2,
  Fullscreen,
  Layers3,
  ListFilter,
  Lock,
  LockOpen,
  Magnet,
  Minus,
  MoveDiagonal2,
  MoveVertical,
  MousePointer2,
  Radio,
  Redo2,
  Ruler,
  Search,
  Trash2,
  TrendingDown,
  TrendingUp,
  Undo2,
  X,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { App as CapacitorApp } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { MarketChart, type ChartAction, type ChartActionRequest, type ChartIndicators, type DrawingTool, type FeedStatus } from "@/components/MarketChart";
import { DrawingToolLibrary } from "@/components/DrawingToolLibrary";
import { ChartFunctionMenu } from "@/components/ChartFunctionMenu";
import { BrandMark } from "@/components/BrandMark";
import { usePersistentChartIndicators } from "@/lib/chart-indicator-preferences";
import { formatInr, instruments, mergeInstrumentUniverse, type Instrument } from "@/lib/market";
import { getNseMarketStatus } from "@/lib/market-hours";
import {
  calculatePosition,
  readPaperOrders,
  writePaperOrders,
  type PaperOrder,
} from "@/lib/paper-trading";

const timeframes = ["1m", "5m", "15m", "1H", "3H", "4H", "1D", "1W", "1M", "1Y"] as const;
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
  { id: "trend-line", label: "Trend line", icon: TrendingUp },
  { id: "extended-line", label: "Extended line", icon: MoveDiagonal2 },
  { id: "ray", label: "Diagonal ray", icon: ArrowUpRight },
  { id: "horizontal-line", label: "Horizontal line", icon: Minus },
  { id: "horizontal-ray", label: "Horizontal ray", icon: Radio },
  { id: "vertical-line", label: "Vertical line", icon: MoveVertical },
  { id: "parallel-channel", label: "Parallel channel", icon: FlipHorizontal2 },
  { id: "brush", label: "Brush", icon: Brush },
  { id: "rectangle", label: "Rectangle with midpoint", icon: BoxSelect },
  { id: "fib-retracement", label: "Fibonacci retracement", icon: ListFilter },
  { id: "price-range", label: "Price range", icon: Ruler },
  { id: "long-position", label: "Long position", icon: TrendingUp },
  { id: "short-position", label: "Short position", icon: TrendingDown },
];

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
  const [availableInstruments, setAvailableInstruments] = useState<Instrument[]>(instruments);
  const [timeframe, setTimeframe] = useState(timeframes.includes(initialTimeframe as typeof timeframes[number]) ? initialTimeframe : "5m");
  const [activeTool, setActiveTool] = useState<DrawingTool>("cursor");
  const [showDrawingLibrary, setShowDrawingLibrary] = useState(false);
  const [showChartFunctions, setShowChartFunctions] = useState(false);
  const [chartAction, setChartAction] = useState<ChartActionRequest>();
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
  const [indicators, setIndicators] = usePersistentChartIndicators();
  const [orderSide, setOrderSide] = useState<"BUY" | "SELL" | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [exitQuantity, setExitQuantity] = useState(1);
  const [orders, setOrders] = useState<PaperOrder[]>([]);
  const [toast, setToast] = useState("");
  const symbolPickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const initial = window.setTimeout(() => setClock(new Date()), 0);
    const timer = window.setInterval(() => setClock(new Date()), 1_000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    const returnToTrade = () => {
      const params = new URLSearchParams(window.location.search);
      const symbol = params.get("symbol") ?? initialSymbol;
      const period = params.get("timeframe") ?? initialTimeframe;
      window.location.replace(`/?symbol=${encodeURIComponent(symbol)}&timeframe=${encodeURIComponent(period)}`);
    };
    window.history.pushState({ ...window.history.state, papertradeFullChartGuard: true }, "", window.location.href);
    window.addEventListener("popstate", returnToTrade);
    return () => window.removeEventListener("popstate", returnToTrade);
  }, [initialSymbol, initialTimeframe]);

  useEffect(() => {
    if (Capacitor.getPlatform() !== "android") return;
    let listener: { remove: () => Promise<void> } | undefined;
    let disposed = false;
    const returnToTrade = () => {
      const params = new URLSearchParams(window.location.search);
      const symbol = params.get("symbol") ?? instrument.symbol ?? initialSymbol;
      const period = params.get("timeframe") ?? timeframe ?? initialTimeframe;
      window.location.replace(`/?symbol=${encodeURIComponent(symbol)}&timeframe=${encodeURIComponent(period)}`);
    };
    void CapacitorApp.addListener("backButton", returnToTrade).then((handle) => {
      if (disposed) void handle.remove();
      else listener = handle;
    });
    return () => {
      disposed = true;
      if (listener) void listener.remove();
    };
  }, [initialSymbol, initialTimeframe, instrument.symbol, timeframe]);

  useEffect(() => {
    const restore = window.setTimeout(() => setOrders(readPaperOrders()), 0);
    const refresh = () => setOrders(readPaperOrders());
    window.addEventListener("storage", refresh);
    window.addEventListener("papertrade-orders-updated", refresh);
    return () => {
      window.clearTimeout(restore);
      window.removeEventListener("storage", refresh);
      window.removeEventListener("papertrade-orders-updated", refresh);
    };
  }, []);

  useEffect(() => {
    if (!showSymbols) return;
    const closeSymbolList = (event: PointerEvent) => {
      if (!symbolPickerRef.current?.contains(event.target as Node)) {
        setShowSymbols(false);
        setSymbolSearch("");
      }
    };
    const closeWithEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setShowSymbols(false);
        setSymbolSearch("");
      }
    };
    document.addEventListener("pointerdown", closeSymbolList);
    document.addEventListener("keydown", closeWithEscape);
    return () => {
      document.removeEventListener("pointerdown", closeSymbolList);
      document.removeEventListener("keydown", closeWithEscape);
    };
  }, [showSymbols]);

  useEffect(() => {
    const controller = new AbortController();
    async function loadInstrumentUniverse() {
      try {
        const response = await fetch("/api/upstox/instruments", { signal: controller.signal });
        const payload = await response.json() as { ok?: boolean; instruments?: Instrument[] };
        if (!response.ok || !payload.ok || !payload.instruments?.length) return;
        const merged = mergeInstrumentUniverse(payload.instruments);
        setAvailableInstruments(merged);
        const requested = merged.find((item) => item.symbol === initialSymbol);
        if (requested) {
          setInstrument((current) => current.symbol === getInitialInstrument(initialSymbol).symbol ? requested : current);
        }
      } catch {
        // The built-in liquid-stock list remains available if the daily master cannot load.
      }
    }
    void loadInstrumentUniverse();
    return () => controller.abort();
  }, [initialSymbol]);

  const handlePrice = useCallback((price: number) => setLivePrice(price), []);
  const handleFeedStatus = useCallback((status: FeedStatus) => setFeedStatus(status), []);
  const filteredSymbols = useMemo(() => {
    const term = symbolSearch.trim().toLowerCase();
    return availableInstruments.filter((item) => !term || item.symbol.toLowerCase().includes(term) || item.name.toLowerCase().includes(term));
  }, [availableInstruments, symbolSearch]);
  const position = useMemo(
    () => calculatePosition(orders, instrument.symbol, livePrice),
    [instrument.symbol, livePrice, orders],
  );
  const marketStatus = useMemo(
    () => clock ? getNseMarketStatus(clock) : { isOpen: false, message: "Checking NSE market hours…" },
    [clock],
  );
  const activeIndicatorCount = Object.values(indicators).filter(Boolean).length;
  const safeExitQuantity = position.quantity > 0 ? Math.min(Math.max(1, exitQuantity), position.quantity) : 1;

  function selectTool(tool: DrawingTool) {
    setActiveTool(tool);
    setToolSignal((value) => value + 1);
  }

  function chooseInstrument(next: Instrument) {
    setInstrument(next);
    setLivePrice(next.price > 0 ? next.price : 100);
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
    if (!marketStatus.isOpen) {
      setToast(marketStatus.message);
      window.setTimeout(() => setToast(""), 3_500);
      return;
    }
    const order: PaperOrder = {
      id: `${Date.now()}`,
      symbol: instrument.symbol,
      side: orderSide,
      quantity,
      price: livePrice,
      status: "COMPLETE",
      time: new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
      product: "INTRADAY",
    };
    const nextOrders = [order, ...orders];
    setOrders(nextOrders);
    writePaperOrders(nextOrders);
    setToast(`${orderSide === "BUY" ? "Bought" : "Sold"} ${quantity} ${instrument.symbol} at ${formatInr(livePrice)}`);
    setOrderSide(null);
    window.setTimeout(() => setToast(""), 3_000);
  }

  function exitPosition(requestedQuantity: number) {
    if (position.quantity <= 0 || position.side === "FLAT") return;
    if (!marketStatus.isOpen) {
      setToast(marketStatus.message);
      window.setTimeout(() => setToast(""), 3_500);
      return;
    }
    const closingQuantity = Math.min(position.quantity, Math.max(1, Math.floor(requestedQuantity)));
    const closingSide = position.side === "LONG" ? "SELL" : "BUY";
    const order: PaperOrder = {
      id: `${Date.now()}`,
      symbol: instrument.symbol,
      side: closingSide,
      quantity: closingQuantity,
      price: livePrice,
      status: "COMPLETE",
      time: new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
      product: "INTRADAY",
    };
    const nextOrders = [order, ...orders];
    setOrders(nextOrders);
    writePaperOrders(nextOrders);
    setToast(`Exited ${closingQuantity} ${instrument.symbol} at ${formatInr(livePrice)}`);
    window.setTimeout(() => setToast(""), 3_000);
  }

  function toggleIndicator(name: keyof ChartIndicators) {
    setIndicators((current) => ({ ...current, [name]: !current[name] }));
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
        <Link href={`/?symbol=${instrument.symbol}&timeframe=${timeframe}`} onClick={(event) => { event.preventDefault(); window.history.back(); }} className="advanced-back" aria-label="Back to trading dashboard"><ArrowLeft size={19} /></Link>
        <div className="advanced-brand"><span><BrandMark size={31} /></span><b>PaperTrade</b> IN</div>
        <div ref={symbolPickerRef} className="advanced-symbol-picker">
          <button onClick={() => setShowSymbols((value) => !value)}>
            <span><b>{instrument.symbol}</b><small>{instrument.name} · NSE</small></span>
            <ChevronDown size={16} />
          </button>
          {showSymbols && (
            <div className="advanced-symbol-menu">
              <label><Search size={15} /><input value={symbolSearch} onChange={(event) => setSymbolSearch(event.target.value)} placeholder="Search NSE symbols" /></label>
              <div>{filteredSymbols.slice(0, 150).map((item) => <button key={item.symbol} onClick={() => chooseInstrument(item)}><span><b>{item.symbol}</b><small>{item.name}</small></span><em>{item.price > 0 ? item.price.toFixed(2) : "NSE"}</em></button>)}</div>
            </div>
          )}
        </div>
        <div className="advanced-quote">
          <strong>{livePrice.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
          <small className={instrument.change >= 0 ? "positive" : "negative"}>{instrument.change >= 0 ? "+" : ""}{instrument.change.toFixed(2)}%</small>
        </div>
        <div className="advanced-order-buttons">
          <button className="advanced-sell" title="Open sell paper order" onClick={() => setOrderSide("SELL")}><small>Sell</small><b>{livePrice.toFixed(2)}</b></button>
          <button className="advanced-buy" title="Open buy paper order" onClick={() => setOrderSide("BUY")}><small>Buy</small><b>{livePrice.toFixed(2)}</b></button>
        </div>
      </header>

      <nav className="advanced-commandbar" aria-label="Chart controls">
        <div className="advanced-timeframes">{timeframes.map((period) => <button key={period} className={timeframe === period ? "active" : ""} onClick={() => chooseTimeframe(period)}>{period}</button>)}</div>
        <span />
        <button className={`advanced-indicator-button ${showChartFunctions ? "active" : ""}`} onClick={() => setShowChartFunctions(true)}><Activity size={18} /> Functions <em>{activeIndicatorCount}</em></button>
        <span />
        <button title="Undo last drawing" onClick={() => setUndoSignal((value) => value + 1)}><Undo2 size={18} /></button>
        <button title="Redo drawing" onClick={() => setRedoSignal((value) => value + 1)}><Redo2 size={18} /></button>
        <button title="Fullscreen" onClick={enterFullscreen}><Fullscreen size={18} /></button>
      </nav>

      <section className="advanced-chart-shell">
        <aside className="advanced-drawing-tools" aria-label="Drawing tools">
          {tools.map(({ id, label, icon: Icon }) => (
            <button key={id} className={activeTool === id ? "active" : ""} onClick={() => selectTool(id)} title={label} aria-label={label}><Icon size={19} /></button>
          ))}
          <button className="all-drawing-tools" onClick={() => setShowDrawingLibrary(true)} title="All 67 drawing tools" aria-label="All 67 drawing tools"><Layers3 size={19} /><small>67</small></button>
          <span />
          <button className={magnet ? "active" : ""} onClick={() => setMagnet((value) => !value)} title="Magnet mode"><Magnet size={19} /></button>
          <button className={drawingsLocked ? "active" : ""} onClick={() => setDrawingsLocked((value) => !value)} title={drawingsLocked ? "Unlock drawings" : "Lock drawings"}>{drawingsLocked ? <Lock size={19} /> : <LockOpen size={19} />}</button>
          <button className={drawingsHidden ? "active" : ""} onClick={() => setDrawingsHidden((value) => !value)} title={drawingsHidden ? "Show drawings" : "Hide drawings"}>{drawingsHidden ? <EyeOff size={19} /> : <Eye size={19} />}</button>
          <button className="danger" onClick={() => setClearSignal((value) => value + 1)} title="Delete all drawings"><Trash2 size={19} /></button>
        </aside>
        <div className="advanced-chart-canvas">
          {showDrawingLibrary && <DrawingToolLibrary activeTool={activeTool} onSelect={selectTool} onClose={() => setShowDrawingLibrary(false)} />}
          {showChartFunctions && <ChartFunctionMenu indicators={indicators} onToggleIndicator={toggleIndicator} onAction={(type: ChartAction) => setChartAction((current) => ({ type, token: (current?.token ?? 0) + 1 }))} onClose={() => setShowChartFunctions(false)} />}
          <MarketChart
            key={`${instrument.symbol}-${timeframe}`}
            instrument={instrument}
            timeframe={timeframe}
            activeTool={activeTool}
            toolSignal={toolSignal}
            onDrawingComplete={() => setActiveTool("cursor")}
            magnet={magnet}
            hiddenDrawings={drawingsHidden}
            lockedDrawings={drawingsLocked}
            clearSignal={clearSignal}
            undoSignal={undoSignal}
            redoSignal={redoSignal}
            visibleBars={visibleBars}
            indicators={indicators}
            chartAction={chartAction}
            onPrice={handlePrice}
            onFeedStatus={handleFeedStatus}
          />
          {(position.quantity > 0 || position.realizedPnl !== 0) && (
            <aside className="live-position-card" aria-live="polite">
              <div className="live-position-head">
                <span className={position.side === "SHORT" ? "short" : position.side === "LONG" ? "long" : "flat"}>{position.side}</span>
                <div><b>{instrument.symbol}</b><small>{position.quantity > 0 ? `${position.quantity} shares · Intraday` : "Position closed"}</small></div>
                <em>LIVE P&amp;L</em>
              </div>
              <div className="live-position-pnl">
                <strong className={position.unrealizedPnl >= 0 ? "positive" : "negative"}>{position.unrealizedPnl >= 0 ? "+" : ""}{formatInr(position.unrealizedPnl)}</strong>
                <small className={position.returnPercent >= 0 ? "positive" : "negative"}>{position.returnPercent >= 0 ? "+" : ""}{position.returnPercent.toFixed(2)}%</small>
              </div>
              <dl>
                <div><dt>Average</dt><dd>{position.averagePrice > 0 ? formatInr(position.averagePrice) : "—"}</dd></div>
                <div><dt>Live price</dt><dd>{formatInr(position.livePrice)}</dd></div>
                <div><dt>Realized</dt><dd className={position.realizedPnl >= 0 ? "positive" : "negative"}>{formatInr(position.realizedPnl)}</dd></div>
                <div><dt>Total P&amp;L</dt><dd className={position.totalPnl >= 0 ? "positive" : "negative"}>{formatInr(position.totalPnl)}</dd></div>
              </dl>
              {position.quantity > 0 && (
                <div className="position-exit-controls">
                  <label>Exit quantity<input type="number" min="1" max={position.quantity} value={safeExitQuantity} onChange={(event) => setExitQuantity(Math.min(position.quantity, Math.max(1, Number(event.target.value))))} /></label>
                  <button disabled={!marketStatus.isOpen} onClick={() => exitPosition(safeExitQuantity)}>Exit {safeExitQuantity}</button>
                  <button disabled={!marketStatus.isOpen} onClick={() => exitPosition(position.quantity)}>Exit all</button>
                  {!marketStatus.isOpen && <small>{marketStatus.message}</small>}
                </div>
              )}
            </aside>
          )}
        </div>
      </section>

      <footer className="advanced-statusbar">
        <div className="advanced-ranges">{ranges.map((range) => <button key={range.label} className={activeRange === range.label ? "active" : ""} onClick={() => chooseRange(range.label, range.bars)}>{range.label}</button>)}</div>
        <div className={`advanced-feed feed-${feedStatus.mode}`} title={feedStatus.message}><i /> {feedStatus.mode === "live" ? "Upstox live" : feedStatus.mode === "loading" ? "Connecting" : feedStatus.mode === "error" ? "Feed warning" : "Simulation"}</div>
        <time>{clock ? `${clock.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })} · ${clock.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })} UTC+5:30` : "India · UTC+5:30"}</time>
        <button>log</button><button>auto</button>
      </footer>

      {orderSide && (
        <div className="advanced-order-backdrop" role="presentation" onPointerDown={() => setOrderSide(null)}>
          <section className="advanced-order-dock" role="dialog" aria-modal="true" aria-label={`Place ${orderSide.toLowerCase()} paper order`} onPointerDown={(event) => event.stopPropagation()}>
          <button className="advanced-dock-close" onClick={() => setOrderSide(null)} aria-label="Close order"><X size={17} /></button>
          <span className={orderSide === "BUY" ? "buy-tag" : "sell-tag"}>{orderSide}</span>
          <div><b>{instrument.symbol}</b><small>Market · Intraday · Paper order</small></div>
          <label>Qty <input type="number" min="1" value={quantity} onChange={(event) => setQuantity(Math.max(1, Number(event.target.value)))} /></label>
          <div><small>Estimated amount</small><b>{formatInr(livePrice * quantity)}</b></div>
          <button className="advanced-dock-cancel" onClick={() => setOrderSide(null)}>Cancel</button>
          <button disabled={!marketStatus.isOpen} className={orderSide === "BUY" ? "dock-buy" : "dock-sell"} onClick={placeQuickOrder}>Confirm {orderSide}</button>
          {!marketStatus.isOpen && <small className="advanced-market-closed">{marketStatus.message}</small>}
          </section>
        </div>
      )}
      {toast && <div className="toast advanced-toast">{toast}</div>}
    </main>
  );
}
