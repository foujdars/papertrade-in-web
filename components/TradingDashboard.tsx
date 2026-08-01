"use client";

import {
  Activity, Bot, BoxSelect, BriefcaseBusiness, Cable, ChevronDown, ChevronRight,
  Eye, EyeOff, FlipHorizontal2, Layers3, LineChart, ListFilter, LockKeyhole,
  Magnet, Minus, MousePointer2, Plus, Radio, Ruler,
  Search, Star, Target, Trash2,
  TrendingDown, TrendingUp, WalletCards, X, type LucideIcon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MarketChart, type ChartIndicators, type DrawingTool, type FeedStatus } from "@/components/MarketChart";
import { formatInr, instruments, mergeInstrumentUniverse, type Instrument } from "@/lib/market";
import { getNseMarketStatus } from "@/lib/market-hours";
import { calculatePosition, readPaperOrders, writePaperOrders, type PaperOrder } from "@/lib/paper-trading";
import { buildClosedTrades, getOrderCharges } from "@/lib/trade-analytics";
import { calculateUpstoxEquityCharges } from "@/lib/trading-charges";
import type { NormalizedQuote } from "@/lib/upstox";

const watchlistTabs = ["NIFTY 50", "BANK NIFTY", "NIFTY 500", "ALL NSE"] as const;
const periods = ["1m", "5m", "15m", "1H", "3H", "4H", "1D", "1W", "1M", "1Y"];
const CUSTOM_WATCHLIST_STORAGE_KEY = "papertrade-custom-watchlists";

type CustomWatchlist = {
  id: string;
  name: string;
  symbols: string[];
};

function getPaperOrderTimestamp(order: PaperOrder) {
  const idTimestamp = Number(order.id);
  return order.createdAt ?? (Number.isFinite(idTimestamp) && idTimestamp > 1_000_000_000_000 ? idTimestamp : 0);
}
const drawingTools: { id: DrawingTool; label: string; icon: LucideIcon }[] = [
  { id: "cursor", label: "Cursor", icon: MousePointer2 },
  { id: "trend", label: "Trend line", icon: TrendingUp },
  { id: "horizontal", label: "Horizontal line", icon: Minus },
  { id: "ray", label: "Horizontal ray", icon: Radio },
  { id: "channel", label: "Parallel channel", icon: FlipHorizontal2 },
  { id: "rectangle", label: "Rectangle + mid", icon: BoxSelect },
  { id: "fib", label: "Fibonacci", icon: ListFilter },
  { id: "range", label: "Price range", icon: Ruler },
  { id: "long", label: "Long position", icon: TrendingUp },
  { id: "short", label: "Short position", icon: TrendingDown },
];

function Brand() {
  return (
    <div className="brand">
      <span className="brand-mark"><TrendingUp size={20} strokeWidth={3} /></span>
      <span>PaperTrade <b>IN</b></span>
    </div>
  );
}

function ApiSettings({ onClose }: { onClose: () => void }) {
  const [broker, setBroker] = useState("Upstox");
  const [configured, setConfigured] = useState<boolean | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/upstox/status", { cache: "no-store", signal: controller.signal })
      .then((response) => response.json())
      .then((payload: { configured?: boolean }) => setConfigured(Boolean(payload.configured)))
      .catch(() => {
        if (!controller.signal.aborted) setConfigured(false);
      });
    return () => controller.abort();
  }, []);

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="modal" role="dialog" aria-modal="true" aria-labelledby="api-title" onMouseDown={(event) => event.stopPropagation()}>
        <div className="modal-head">
          <div><span className="eyebrow">Market data connection</span><h2 id="api-title">Broker API settings</h2></div>
          <button className="icon-button" onClick={onClose} aria-label="Close settings"><X size={20} /></button>
        </div>
        <div className="security-note"><LockKeyhole size={17} /> Broker tokens are read only by secure server routes. They are never sent to the browser.</div>
        <div className="connection-settings">
          <label>Broker
            <select name="broker" value={broker} onChange={(event) => setBroker(event.target.value)}>
              <option>Upstox</option><option>Dhan</option><option>Zerodha Kite</option><option>Angel One</option><option>Fyers</option>
            </select>
          </label>
          {broker === "Upstox" ? (
            <div className={`connection-state ${configured ? "connected" : configured === false ? "missing" : "checking"}`}>
              <span />
              <div>
                <b>{configured === null ? "Checking Vercel…" : configured ? "Upstox token configured" : "Upstox token not found"}</b>
                <small>
                  {configured
                    ? "Charts and quotes will use authenticated Upstox market data when available."
                    : "Add UPSTOX_ACCESS_TOKEN in Vercel Production environment variables, then redeploy."}
                </small>
              </div>
            </div>
          ) : (
            <p className="field-help">This broker adapter is not implemented yet. Upstox is the active market-data provider.</p>
          )}
          <p className="field-help">Paper orders remain local simulations and never reach Upstox or an exchange.</p>
          <button className="primary-button" type="button" onClick={onClose}>Done</button>
        </div>
      </section>
    </div>
  );
}

export function TradingDashboard() {
  const [selected, setSelected] = useState<Instrument>(instruments[0]);
  const [stockUniverse, setStockUniverse] = useState<Instrument[]>(instruments);
  const [watchlistLoading, setWatchlistLoading] = useState(true);
  const [watchlistLimit, setWatchlistLimit] = useState(60);
  const [watchlist, setWatchlist] = useState<string>("NIFTY 50");
  const [customWatchlists, setCustomWatchlists] = useState<CustomWatchlist[]>([]);
  const [watchlistPickerOpen, setWatchlistPickerOpen] = useState(false);
  const [watchlistTarget, setWatchlistTarget] = useState<Instrument | null>(null);
  const [newWatchlistName, setNewWatchlistName] = useState("");
  const [search, setSearch] = useState("");
  const [timeframe, setTimeframe] = useState("5m");
  const [livePrice, setLivePrice] = useState(selected.price);
  const [activeTool, setActiveTool] = useState<DrawingTool>("cursor");
  const [toolSignal, setToolSignal] = useState(0);
  const [magnet, setMagnet] = useState(true);
  const [hiddenDrawings, setHiddenDrawings] = useState(false);
  const [clearSignal, setClearSignal] = useState(0);
  const [side, setSide] = useState<"BUY" | "SELL">("BUY");
  const [quantity, setQuantity] = useState(1);
  const [orderType, setOrderType] = useState("Market");
  const [product, setProduct] = useState<"INTRADAY" | "DELIVERY">("INTRADAY");
  const [indicators, setIndicators] = useState<ChartIndicators>({ ema5: false, ema21: false, rsi: false });
  const [showIndicators, setShowIndicators] = useState(false);
  const [exitQuantity, setExitQuantity] = useState("1");
  const [orders, setOrders] = useState<PaperOrder[]>([]);
  const [balance, setBalance] = useState(1000000);
  const [showApi, setShowApi] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [ordersOpen, setOrdersOpen] = useState(false);
  const [positionsOpen, setPositionsOpen] = useState(false);
  const [gainersOpen, setGainersOpen] = useState(false);
  const [gainersLoading, setGainersLoading] = useState(false);
  const [pnlOpen, setPnlOpen] = useState(false);
  const [showTradeSymbols, setShowTradeSymbols] = useState(false);
  const [tradeSymbolSearch, setTradeSymbolSearch] = useState("");
  const [toast, setToast] = useState("");
  const [clock, setClock] = useState<Date | null>(null);
  const [feedStatus, setFeedStatus] = useState<FeedStatus>({
    mode: "loading",
    message: "Connecting to Upstox…",
  });
  const [marketQuotes, setMarketQuotes] = useState<Record<string, NormalizedQuote>>({});
  const indicatorButtonRef = useRef<HTMLButtonElement>(null);
  const indicatorPopoverRef = useRef<HTMLDivElement>(null);
  const tradeSymbolPickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const restore = window.setTimeout(() => {
      try {
        setOrders(readPaperOrders());
        setBalance(Number(localStorage.getItem("papertrade-balance") ?? "1000000"));
        const savedWatchlists = JSON.parse(localStorage.getItem(CUSTOM_WATCHLIST_STORAGE_KEY) ?? "[]") as CustomWatchlist[];
        if (Array.isArray(savedWatchlists)) {
          setCustomWatchlists(savedWatchlists.slice(0, 5).filter((list) => list?.id && list?.name && Array.isArray(list.symbols)));
        }
      } catch { /* Ignore malformed local demo data. */ }
    }, 0);
    return () => window.clearTimeout(restore);
  }, []);

  useEffect(() => {
    const initial = window.setTimeout(() => setClock(new Date()), 0);
    const interval = window.setInterval(() => setClock(new Date()), 1_000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    const applyRequestedChart = window.setTimeout(() => {
      const params = new URLSearchParams(window.location.search);
      const requestedSymbol = params.get("symbol")?.toUpperCase();
      const requestedTimeframe = params.get("timeframe");
      if (requestedTimeframe && periods.includes(requestedTimeframe)) {
        setTimeframe(requestedTimeframe);
      }
      if (requestedSymbol) {
        const fallbackInstrument = instruments.find((item) => item.symbol === requestedSymbol);
        if (fallbackInstrument) {
          setSelected(fallbackInstrument);
          setLivePrice(fallbackInstrument.price);
        }
      }
    }, 0);
    return () => window.clearTimeout(applyRequestedChart);
  }, []);

  useEffect(() => {
    if (!showIndicators) return;
    const closeOnOutsideTap = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!indicatorButtonRef.current?.contains(target) && !indicatorPopoverRef.current?.contains(target)) {
        setShowIndicators(false);
      }
    };
    document.addEventListener("pointerdown", closeOnOutsideTap);
    return () => document.removeEventListener("pointerdown", closeOnOutsideTap);
  }, [showIndicators]);

  useEffect(() => {
    if (!showTradeSymbols) return;
    const closeSymbolSearch = (event: PointerEvent) => {
      if (!tradeSymbolPickerRef.current?.contains(event.target as Node)) {
        setShowTradeSymbols(false);
        setTradeSymbolSearch("");
      }
    };
    const closeWithEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setShowTradeSymbols(false);
        setTradeSymbolSearch("");
      }
    };
    document.addEventListener("pointerdown", closeSymbolSearch);
    document.addEventListener("keydown", closeWithEscape);
    return () => {
      document.removeEventListener("pointerdown", closeSymbolSearch);
      document.removeEventListener("keydown", closeWithEscape);
    };
  }, [showTradeSymbols]);

  useEffect(() => {
    const controller = new AbortController();
    async function loadInstrumentUniverse() {
      try {
        const response = await fetch("/api/upstox/instruments", { signal: controller.signal });
        const payload = await response.json() as { ok?: boolean; instruments?: Instrument[] };
        if (!response.ok || !payload.ok || !payload.instruments?.length) return;
        const merged = mergeInstrumentUniverse(payload.instruments);
        const requestedSymbol = new URLSearchParams(window.location.search).get("symbol")?.toUpperCase();
        setStockUniverse(merged);
        setSelected((current) => merged.find((item) => item.symbol === (requestedSymbol ?? current.symbol)) ?? current);
      } catch {
        // Keep the built-in liquid-stock list available while the daily master is unavailable.
      } finally {
        if (!controller.signal.aborted) setWatchlistLoading(false);
      }
    }
    void loadInstrumentUniverse();
    return () => controller.abort();
  }, []);

  const filtered = useMemo(() => stockUniverse.filter((item) => {
    const term = search.trim().toLowerCase();
    const customList = customWatchlists.find((list) => `custom:${list.id}` === watchlist);
    const standardList = watchlistTabs.find((tab) => tab === watchlist);
    const matchesList = Boolean(term)
      || customList?.symbols.includes(item.symbol)
      || standardList === "ALL NSE"
      || (standardList !== undefined && item.categories.includes(standardList));
    return matchesList && (!term || item.symbol.toLowerCase().includes(term) || item.name.toLowerCase().includes(term));
  }), [customWatchlists, search, stockUniverse, watchlist]);
  const tradeSymbolMatches = useMemo(() => {
    const term = tradeSymbolSearch.trim().toLowerCase();
    return stockUniverse
      .filter((item) => !term || item.symbol.toLowerCase().includes(term) || item.name.toLowerCase().includes(term))
      .slice(0, 120);
  }, [stockUniverse, tradeSymbolSearch]);
  const positionSymbols = useMemo(() => [...new Set(orders.map((order) => order.symbol))].filter((symbol) => {
    const lastFill = orders.find((order) => order.symbol === symbol);
    return calculatePosition(orders, symbol, lastFill?.price ?? 0, "INTRADAY").quantity > 0 || calculatePosition(orders, symbol, lastFill?.price ?? 0, "DELIVERY").quantity > 0;
  }), [orders]);
  const visibleInstruments = filtered.slice(0, watchlistLimit);
  const quoteKeys = useMemo(
    () => [...new Set([
      selected.instrumentKey,
      ...positionSymbols.map((symbol) => stockUniverse.find((item) => item.symbol === symbol)?.instrumentKey).filter((value): value is string => Boolean(value)),
      ...visibleInstruments.map((item) => item.instrumentKey),
    ])].slice(0, 100).join(","),
    [positionSymbols, selected.instrumentKey, stockUniverse, visibleInstruments],
  );
  const watchlistCounts = useMemo(() => ({
    "NIFTY 50": stockUniverse.filter((item) => item.categories.includes("NIFTY 50")).length,
    "BANK NIFTY": stockUniverse.filter((item) => item.categories.includes("BANK NIFTY")).length,
    "NIFTY 500": stockUniverse.filter((item) => item.categories.includes("NIFTY 500")).length,
    "ALL NSE": stockUniverse.length,
  }), [stockUniverse]);

  const intradayRecoveryRows = useMemo(() => stockUniverse
    .map((item) => ({ item, quote: marketQuotes[item.instrumentKey] ?? marketQuotes[item.symbol] }))
    .filter((entry): entry is { item: Instrument; quote: NormalizedQuote } => Boolean(entry.quote))
    .map(({ item, quote }) => ({
      item,
      quote,
      recoveryPercent: quote.low > 0 ? ((quote.lastPrice - quote.low) / quote.low) * 100 : 0,
    }))
    .filter(({ recoveryPercent }) => recoveryPercent > 0)
    .sort((a, b) => b.recoveryPercent - a.recoveryPercent)
    .slice(0, 100), [marketQuotes, stockUniverse]);
  const activeCustomList = useMemo(() => customWatchlists.find((list) => `custom:${list.id}` === watchlist) ?? null, [customWatchlists, watchlist]);

  useEffect(() => {
    const controller = new AbortController();
    if (!quoteKeys) return;

    async function loadWatchlistQuotes() {
      try {
        const response = await fetch(`/api/upstox/quotes?keys=${encodeURIComponent(quoteKeys)}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const payload = await response.json() as {
          ok?: boolean;
          quotes?: Record<string, NormalizedQuote>;
        };
        if (response.ok && payload.ok && payload.quotes) {
          setMarketQuotes((current) => ({ ...current, ...payload.quotes }));
        }
      } catch {
        // The chart reports the connection error; static watchlist values remain usable.
      }
    }

    void loadWatchlistQuotes();
    const interval = window.setInterval(() => void loadWatchlistQuotes(), 10_000);
    return () => {
      controller.abort();
      window.clearInterval(interval);
    };
  }, [quoteKeys]);

  useEffect(() => {
    if (!gainersOpen) return;
    const controller = new AbortController();
    const candidateKeys = stockUniverse
      .map((item) => item.instrumentKey);
    const batches = Array.from({ length: Math.ceil(candidateKeys.length / 500) }, (_, index) => candidateKeys.slice(index * 500, index * 500 + 500));

    async function loadIntradayRecovery() {
      setGainersLoading(true);
      try {
        const responses = await Promise.all(batches.map(async (keys) => {
          const response = await fetch("/api/upstox/quotes", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ keys }),
            cache: "no-store",
            signal: controller.signal,
          });
          const payload = await response.json() as { ok?: boolean; quotes?: Record<string, NormalizedQuote> };
          return response.ok && payload.ok && payload.quotes ? payload.quotes : {};
        }));
        if (!controller.signal.aborted) {
          setMarketQuotes((current) => Object.assign({}, current, ...responses));
        }
      } catch {
        // The market panel explains when authenticated Upstox quotes are unavailable.
      } finally {
        if (!controller.signal.aborted) setGainersLoading(false);
      }
    }

    if (batches.length) void loadIntradayRecovery();
    return () => controller.abort();
  }, [gainersOpen, stockUniverse]);

  useEffect(() => {
    if (!clock || !orders.length) return;
    const todayStart = new Date(clock);
    todayStart.setHours(0, 0, 0, 0);
    const weekday = clock.getDay() >= 1 && clock.getDay() <= 5;
    const afterSquareOff = weekday && (clock.getHours() > 15 || (clock.getHours() === 15 && clock.getMinutes() >= 20));
    const symbols = [...new Set(orders.map((order) => order.symbol))];
    const automaticOrders: PaperOrder[] = [];
    let nextBalance = balance;

    symbols.forEach((symbol, index) => {
      const symbolOrders = orders.filter((order) => order.symbol === symbol && (order.product ?? "INTRADAY") === "INTRADAY").sort((a, b) => getPaperOrderTimestamp(b) - getPaperOrderTimestamp(a));
      const latestOrder = symbolOrders[0];
      if (!latestOrder) return;
      const position = calculatePosition(orders, symbol, latestOrder.price, "INTRADAY");
      if (!position.quantity || position.side === "FLAT") return;
      const carriedOver = getPaperOrderTimestamp(latestOrder) < todayStart.getTime();
      if (!carriedOver && !afterSquareOff) return;
      const instrument = stockUniverse.find((item) => item.symbol === symbol);
      const quote = instrument ? marketQuotes[instrument.instrumentKey] ?? marketQuotes[symbol] : marketQuotes[symbol];
      const squareOffPrice = quote?.lastPrice ?? latestOrder.price;
      const closingSide = position.side === "LONG" ? "SELL" : "BUY";
      const charges = calculateUpstoxEquityCharges({ side: closingSide, product: "INTRADAY", quantity: position.quantity, price: squareOffPrice });
      const order: PaperOrder = {
        id: `${clock.getTime() + index}`,
        symbol,
        side: closingSide,
        quantity: position.quantity,
        price: squareOffPrice,
        status: "COMPLETE",
        time: clock.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
        product: "INTRADAY",
        createdAt: clock.getTime(),
        charges,
        autoSquareOff: true,
      };
      automaticOrders.push(order);
      const releasedMargin = squareOffPrice * position.quantity * 0.2;
      nextBalance = closingSide === "SELL" ? nextBalance + releasedMargin - charges.total : nextBalance - releasedMargin - charges.total;
    });

    if (!automaticOrders.length) return;
    const nextOrders = [...automaticOrders, ...orders];
    // Automatic square-off is intentionally synchronized with the live market clock.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOrders(nextOrders);
    setBalance(nextBalance);
    writePaperOrders(nextOrders);
    localStorage.setItem("papertrade-balance", String(nextBalance));
    setToast(`${automaticOrders.length} intraday position${automaticOrders.length > 1 ? "s" : ""} auto squared off at 3:20 PM`);
    window.setTimeout(() => setToast(""), 4_000);
  }, [balance, clock, marketQuotes, orders, stockUniverse]);
  const handlePrice = useCallback((value: number) => setLivePrice(value), []);
  const handleFeedStatus = useCallback((status: FeedStatus) => setFeedStatus(status), []);
  const selectedQuote = marketQuotes[selected.instrumentKey] ?? marketQuotes[selected.symbol];
  const selectedChange = selectedQuote?.changePercent ?? selected.change;
  const selectedNetChange = selectedQuote?.netChange ?? livePrice * selected.change / 100;
  const orderValue = livePrice * quantity;
  const margin = orderValue * 0.2;
  const estimatedOrderCharges = useMemo(() => calculateUpstoxEquityCharges({ side, product, quantity, price: livePrice }), [livePrice, product, quantity, side]);
  const selectedPositions = useMemo(
    () => ({
      intraday: calculatePosition(orders, selected.symbol, livePrice, "INTRADAY"),
      delivery: calculatePosition(orders, selected.symbol, livePrice, "DELIVERY"),
    }),
    [livePrice, orders, selected.symbol],
  );
  const selectedPosition = selectedPositions.intraday.quantity > 0 ? selectedPositions.intraday : selectedPositions.delivery;
  const positionProduct: "INTRADAY" | "DELIVERY" = selectedPositions.intraday.quantity > 0 ? "INTRADAY" : "DELIVERY";
  const openPositions = useMemo(() => positionSymbols.flatMap((symbol) => {
    const instrument = stockUniverse.find((item) => item.symbol === symbol);
    const quote = instrument ? marketQuotes[instrument.instrumentKey] ?? marketQuotes[symbol] : marketQuotes[symbol];
    const lastFill = orders.find((order) => order.symbol === symbol);
    const positionLivePrice = symbol === selected.symbol
      ? livePrice
      : quote?.lastPrice ?? (instrument && instrument.price > 0 ? instrument.price : lastFill?.price ?? 0);
    return (["INTRADAY", "DELIVERY"] as const).map((positionProductName) => ({
      ...calculatePosition(orders, symbol, positionLivePrice, positionProductName),
      name: instrument?.name ?? symbol,
      product: positionProductName,
    })).filter((position) => position.quantity > 0);
  }), [livePrice, marketQuotes, orders, positionSymbols, selected.symbol, stockUniverse]);
  const totalOpenPnl = openPositions.reduce((total, position) => total + position.unrealizedPnl, 0);
  const marketStatus = useMemo(
    () => clock ? getNseMarketStatus(clock) : { isOpen: false, message: "Checking NSE market hours…" },
    [clock],
  );
  const todayOrders = useMemo(() => {
    if (!clock) return [];
    const start = new Date(clock);
    start.setHours(0, 0, 0, 0);
    return orders.filter((order) => getPaperOrderTimestamp(order) >= start.getTime());
  }, [clock, orders]);
  const closedTrades = useMemo(() => buildClosedTrades(orders), [orders]);
  const pnlStats = useMemo(() => {
    const totalProfit = closedTrades.filter((trade) => trade.netPnl > 0).reduce((sum, trade) => sum + trade.netPnl, 0);
    const totalLoss = Math.abs(closedTrades.filter((trade) => trade.netPnl < 0).reduce((sum, trade) => sum + trade.netPnl, 0));
    const totalCharges = closedTrades.reduce((sum, trade) => sum + trade.charges, 0);
    const wins = closedTrades.filter((trade) => trade.netPnl > 0).length;
    return {
      totalProfit,
      totalLoss,
      totalCharges,
      netPnl: totalProfit - totalLoss,
      winRate: closedTrades.length ? wins / closedTrades.length * 100 : 0,
    };
  }, [closedTrades]);
  const pnlChartTrades = closedTrades.slice(0, 14).reverse();
  const pnlChartMaximum = Math.max(1, ...pnlChartTrades.map((trade) => Math.abs(trade.netPnl)));
  const activeIndicatorCount = Object.values(indicators).filter(Boolean).length;
  const requestedExitQuantity = Number.parseInt(exitQuantity, 10);
  const safeExitQuantity = selectedPosition.quantity > 0
    ? Math.min(Math.max(1, Number.isFinite(requestedExitQuantity) ? requestedExitQuantity : 1), selectedPosition.quantity)
    : 1;

  function placeOrder() {
    if (!Number.isFinite(quantity) || quantity < 1) return;
    if (product === "INTRADAY" && !marketStatus.isOpen) {
      setToast(marketStatus.message);
      window.setTimeout(() => setToast(""), 3_500);
      return;
    }
    const order: PaperOrder = {
      id: `${Date.now()}`, symbol: selected.symbol, side, quantity, price: livePrice,
      status: "COMPLETE", time: new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
      product, createdAt: Date.now(), charges: estimatedOrderCharges,
    };
    const nextOrders = [order, ...orders];
    const nextBalance = (side === "BUY" ? balance - margin : balance + margin) - estimatedOrderCharges.total;
    setOrders(nextOrders);
    setBalance(nextBalance);
    writePaperOrders(nextOrders);
    localStorage.setItem("papertrade-balance", String(nextBalance));
    setToast(`${side === "BUY" ? "Bought" : "Sold"} ${quantity} ${selected.symbol} · charges ${formatInr(estimatedOrderCharges.total)}`);
    window.setTimeout(() => setToast(""), 3200);
  }

  function exitPosition(requestedQuantity: number) {
    if (selectedPosition.quantity <= 0 || selectedPosition.side === "FLAT") return;
    if (positionProduct === "INTRADAY" && !marketStatus.isOpen) {
      setToast(marketStatus.message);
      window.setTimeout(() => setToast(""), 3_500);
      return;
    }
    const closingQuantity = Math.min(selectedPosition.quantity, Math.max(1, Math.floor(requestedQuantity)));
    const closingSide = selectedPosition.side === "LONG" ? "SELL" : "BUY";
    const exitCharges = calculateUpstoxEquityCharges({ side: closingSide, product: positionProduct, quantity: closingQuantity, price: livePrice });
    const order: PaperOrder = {
      id: `${Date.now()}`,
      symbol: selected.symbol,
      side: closingSide,
      quantity: closingQuantity,
      price: livePrice,
      status: "COMPLETE",
      time: new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
      product: positionProduct,
      createdAt: Date.now(),
      charges: exitCharges,
    };
    const nextOrders = [order, ...orders];
    const exitMargin = livePrice * closingQuantity * 0.2;
    const nextBalance = (closingSide === "BUY" ? balance - exitMargin : balance + exitMargin) - exitCharges.total;
    setOrders(nextOrders);
    setBalance(nextBalance);
    setExitQuantity("1");
    writePaperOrders(nextOrders);
    localStorage.setItem("papertrade-balance", String(nextBalance));
    setToast(`Exited ${closingQuantity} ${selected.symbol} · charges ${formatInr(exitCharges.total)}`);
    window.setTimeout(() => setToast(""), 3_200);
  }

  function toggleIndicator(name: keyof ChartIndicators) {
    setIndicators((current) => ({ ...current, [name]: !current[name] }));
  }

  function chooseTradeInstrument(item: Instrument) {
    const quote = marketQuotes[item.instrumentKey] ?? marketQuotes[item.symbol];
    const price = quote?.lastPrice ?? item.price;
    setSelected({ ...item, price: price > 0 ? price : 1 });
    setLivePrice(price > 0 ? price : 1);
    setShowTradeSymbols(false);
    setTradeSymbolSearch("");
    setSidebarOpen(false);
    const url = new URL(window.location.href);
    url.searchParams.set("symbol", item.symbol);
    url.searchParams.set("timeframe", timeframe);
    window.history.replaceState({}, "", url);
  }

  function saveCustomWatchlists(nextLists: CustomWatchlist[]) {
    setCustomWatchlists(nextLists);
    localStorage.setItem(CUSTOM_WATCHLIST_STORAGE_KEY, JSON.stringify(nextLists));
  }

  function openWatchlistPicker(item: Instrument | null) {
    setWatchlistTarget(item);
    setNewWatchlistName("");
    setWatchlistPickerOpen(true);
  }

  function toggleWatchlistMembership(listId: string) {
    if (!watchlistTarget) return;
    const nextLists = customWatchlists.map((list) => list.id !== listId ? list : {
      ...list,
      symbols: list.symbols.includes(watchlistTarget.symbol)
        ? list.symbols.filter((symbol) => symbol !== watchlistTarget.symbol)
        : [...list.symbols, watchlistTarget.symbol],
    });
    saveCustomWatchlists(nextLists);
  }

  function createCustomWatchlist() {
    const name = newWatchlistName.trim();
    if (!name || customWatchlists.length >= 5) return;
    if (customWatchlists.some((list) => list.name.toLowerCase() === name.toLowerCase())) {
      setToast("A watchlist with this name already exists");
      window.setTimeout(() => setToast(""), 3_000);
      return;
    }
    const list: CustomWatchlist = {
      id: `${Date.now()}`,
      name,
      symbols: watchlistTarget ? [watchlistTarget.symbol] : [],
    };
    saveCustomWatchlists([...customWatchlists, list]);
    setWatchlist(`custom:${list.id}`);
    setWatchlistLimit(60);
    setWatchlistPickerOpen(false);
    setToast(watchlistTarget ? `${watchlistTarget.symbol} added to ${name}` : `${name} created`);
    window.setTimeout(() => setToast(""), 3_000);
  }

  function renameCustomWatchlist(listId: string, name: string) {
    const trimmedName = name.trim();
    if (!trimmedName) return;
    saveCustomWatchlists(customWatchlists.map((list) => list.id === listId ? { ...list, name: trimmedName.slice(0, 24) } : list));
  }

  function deleteCustomWatchlist(listId: string) {
    saveCustomWatchlists(customWatchlists.filter((list) => list.id !== listId));
    if (watchlist === `custom:${listId}`) setWatchlist("NIFTY 50");
  }

  function removeStockFromCustomWatchlist(listId: string, symbol: string) {
    saveCustomWatchlists(customWatchlists.map((list) => list.id === listId ? { ...list, symbols: list.symbols.filter((item) => item !== symbol) } : list));
    setToast(`${symbol} removed from watchlist`);
    window.setTimeout(() => setToast(""), 2_500);
  }

  function openPositionChart(symbol: string) {
    setPositionsOpen(false);
    window.location.assign(`/?symbol=${encodeURIComponent(symbol)}&timeframe=${encodeURIComponent(timeframe)}`);
  }

  return (
    <main className="terminal-shell">
      <header className="topbar">
        <Brand />
        <nav className="main-nav" aria-label="Main navigation">
          <button className="nav-active">Trade</button><button onClick={() => setOrdersOpen(true)}>Orders</button><button onClick={() => setGainersOpen(true)}>Markets</button><button onClick={() => setPositionsOpen(true)}>Positions</button><button onClick={() => setPnlOpen(true)}>P&amp;L</button>
        </nav>
        <div className="top-actions">
          <div className={`market-status ${feedStatus.mode}`} title={feedStatus.message}>
            <span /> {feedStatus.mode === "live" ? "Upstox data" : feedStatus.mode === "loading" ? "Connecting" : "Fallback data"}
          </div>
          <div className="funds-button"><WalletCards size={16} /> {formatInr(balance)}</div>
          <button className="api-button" onClick={() => setShowApi(true)}><Cable size={16} /> Broker API</button>
        </div>
      </header>

      <div className="workspace">
        <aside className={`watchlist-panel ${sidebarOpen ? "mobile-open" : ""}`}>
          <div className="mobile-panel-head"><b>Watchlist</b><button className="icon-button" onClick={() => setSidebarOpen(false)} aria-label="Close watchlist"><X size={20} /></button></div>
          <div className="search-box"><Search size={16} /><input value={search} onChange={(event) => { setSearch(event.target.value); setWatchlistLimit(60); }} placeholder="Search all NSE stocks" /></div>
          <div className="watchlist-tabs">
            {watchlistTabs.map((tab) => <button key={tab} onClick={() => { setWatchlist(tab); setWatchlistLimit(60); }} className={watchlist === tab ? "active" : ""}><span>{tab}</span><small>{watchlistCounts[tab]}</small></button>)}
            {customWatchlists.map((list) => <button key={list.id} onClick={() => { setWatchlist(`custom:${list.id}`); setWatchlistLimit(60); }} className={watchlist === `custom:${list.id}` ? "active" : ""}><span>{list.name}</span><small>{list.symbols.length}</small></button>)}
            {customWatchlists.length < 5 && <button className="new-watchlist-tab" onClick={() => openWatchlistPicker(null)}><Plus size={12} /><span>New list</span></button>}
          </div>
          {activeCustomList && <div className="custom-list-bar"><b>{activeCustomList.name}</b><span>{activeCustomList.symbols.length} stocks</span><button onClick={() => openWatchlistPicker(null)}>Edit list</button></div>}
          <div className="instrument-list">
            {visibleInstruments.map((item) => {
              const quote = marketQuotes[item.instrumentKey] ?? marketQuotes[item.symbol];
              const price = quote?.lastPrice ?? item.price;
              const change = quote?.changePercent ?? item.change;
              const saved = customWatchlists.some((list) => list.symbols.includes(item.symbol));
              return (
                <div key={item.symbol} className={`instrument-row ${selected.symbol === item.symbol ? "selected" : ""}`} role="button" tabIndex={0} onClick={() => chooseTradeInstrument(item)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") chooseTradeInstrument(item); }}>
                  <span className="symbol-avatar">{item.symbol.slice(0, 2)}</span>
                  <span className="instrument-name"><b>{item.symbol}</b><small>{item.name}</small></span>
                  <span className="instrument-price"><b>{price > 0 ? price.toLocaleString("en-IN", { minimumFractionDigits: 2 }) : "—"}</b><small className={price > 0 ? change >= 0 ? "positive" : "negative" : ""}>{price > 0 ? `${change >= 0 ? "+" : ""}${change.toFixed(2)}%` : "Quote loading"}</small></span>
                  {activeCustomList?.symbols.includes(item.symbol) ? (
                    <button className="watchlist-star remove" onClick={(event) => { event.stopPropagation(); removeStockFromCustomWatchlist(activeCustomList.id, item.symbol); }} aria-label={`Remove ${item.symbol} from ${activeCustomList.name}`}><X size={15} /></button>
                  ) : (
                    <button className={`watchlist-star ${saved ? "saved" : ""}`} onClick={(event) => { event.stopPropagation(); openWatchlistPicker(item); }} aria-label={`Add ${item.symbol} to a custom watchlist`}><Star size={15} fill={saved ? "currentColor" : "none"} /></button>
                  )}
                </div>
              );
            })}
            {watchlistLoading && <div className="watchlist-loading">Loading complete NSE lists…</div>}
            {!watchlistLoading && !filtered.length && <div className="empty-list">No matching NSE stocks.</div>}
            {visibleInstruments.length < filtered.length && <button className="load-more-stocks" onClick={() => setWatchlistLimit((value) => value + 60)}>Load 60 more <small>{visibleInstruments.length} of {filtered.length}</small></button>}
          </div>
        </aside>

        <section className="chart-area">
          <div className="instrument-header">
            <div ref={tradeSymbolPickerRef} className="instrument-title trade-symbol-picker">
              <button className="trade-symbol-trigger" onClick={() => setShowTradeSymbols((value) => !value)} aria-expanded={showTradeSymbols}>
                <div className="title-line"><h1>{selected.symbol}</h1><span>NSE</span><ChevronDown size={16} /></div>
                <p>{selected.name}</p>
              </button>
              <button
                className={`chart-watchlist-star ${customWatchlists.some((list) => list.symbols.includes(selected.symbol)) ? "saved" : ""}`}
                onClick={() => openWatchlistPicker(selected)}
                aria-label={`Add ${selected.symbol} to a custom watchlist`}
                title="Add to custom watchlist"
              >
                <Star size={17} fill={customWatchlists.some((list) => list.symbols.includes(selected.symbol)) ? "currentColor" : "none"} />
              </button>
              {showTradeSymbols && (
                <div className="trade-symbol-menu">
                  <label><Search size={16} /><input autoFocus value={tradeSymbolSearch} onChange={(event) => setTradeSymbolSearch(event.target.value)} placeholder="Search all NSE symbols" /></label>
                  <div>
                    {tradeSymbolMatches.map((item) => (
                      <button key={item.symbol} onClick={() => chooseTradeInstrument(item)}>
                        <span><b>{item.symbol}</b><small>{item.name}</small></span><em>NSE</em>
                      </button>
                    ))}
                    {!tradeSymbolMatches.length && <p>No matching NSE stock.</p>}
                  </div>
                </div>
              )}
            </div>
            <div className="quote-block"><strong>{livePrice.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong><span className={selectedChange >= 0 ? "positive" : "negative"}>{selectedNetChange >= 0 ? "+" : ""}{selectedNetChange.toFixed(2)} ({selectedChange >= 0 ? "+" : ""}{selectedChange.toFixed(2)}%)</span></div>
            <div className="ohlc-strip"><span>O <b>{(selectedQuote?.open ?? livePrice * 0.995).toFixed(2)}</b></span><span>H <b>{(selectedQuote?.high ?? livePrice * 1.008).toFixed(2)}</b></span><span>L <b>{(selectedQuote?.low ?? livePrice * 0.988).toFixed(2)}</b></span><span>C <b>{(selectedQuote?.previousClose ?? livePrice).toFixed(2)}</b></span></div>
            <div className="header-order-buttons"><button className="compact-sell" onClick={() => setSide("SELL")}>Sell <b>{livePrice.toFixed(2)}</b></button><button className="compact-buy" onClick={() => setSide("BUY")}>Buy <b>{livePrice.toFixed(2)}</b></button></div>
          </div>

          <div className="chart-controls">
            <div className="period-tabs">{periods.map((period) => <button key={period} className={timeframe === period ? "active" : ""} onClick={() => setTimeframe(period)}>{period}</button>)}</div>
            <span className="control-divider" />
            <button ref={indicatorButtonRef} className={`control-button mobile-indicator-control ${showIndicators ? "active" : ""}`} onClick={() => setShowIndicators((value) => !value)}><Activity size={16} /> Indicators <span className="pill-count">{activeIndicatorCount}</span></button>
            {showIndicators && (
              <div ref={indicatorPopoverRef} className="dashboard-indicator-popover">
                <b>Indicators</b>
                <label><input type="checkbox" checked={indicators.ema5} onChange={() => toggleIndicator("ema5")} /><i className="ema-five" /> EMA 5</label>
                <label><input type="checkbox" checked={indicators.ema21} onChange={() => toggleIndicator("ema21")} /><i className="ema-twenty-one" /> EMA 21</label>
                <label><input type="checkbox" checked={indicators.rsi} onChange={() => toggleIndicator("rsi")} /><i className="rsi-color" /> RSI 14</label>
              </div>
            )}
            <div className="chart-right-controls">
              <button className="control-button" onClick={() => setShowApi(true)}><Cable size={16} /> Data source</button>
            </div>
          </div>

          <div className="chart-body">
            <div className="drawing-toolbar" aria-label="Drawing tools">
              {drawingTools.map(({ id, label, icon: Icon }) => <button key={id} className={activeTool === id ? "active" : ""} onClick={() => { setActiveTool(id); setToolSignal((value) => value + 1); }} aria-label={label} title={label}><Icon size={18} /></button>)}
              <span />
              <button className={magnet ? "active" : ""} onClick={() => setMagnet((value) => !value)} aria-label="Magnet" title="Magnet"><Magnet size={18} /></button>
              <button className={hiddenDrawings ? "active" : ""} onClick={() => setHiddenDrawings((value) => !value)} aria-label="Hide drawings" title="Hide drawings">{hiddenDrawings ? <EyeOff size={18} /> : <Eye size={18} />}</button>
              <button className="danger-tool" onClick={() => setClearSignal((value) => value + 1)} aria-label="Delete drawings" title="Delete drawings"><Trash2 size={18} /></button>
            </div>
            <MarketChart key={`${selected.symbol}-${timeframe}`} instrument={selected} timeframe={timeframe} activeTool={activeTool} toolSignal={toolSignal} magnet={magnet} hiddenDrawings={hiddenDrawings} clearSignal={clearSignal} indicators={indicators} onPrice={handlePrice} onFeedStatus={handleFeedStatus} />
          </div>
          <div className={`chart-statusbar feed-${feedStatus.mode}`} title={feedStatus.message}>
            <div><Radio size={14} /> {feedStatus.message}</div>
            <div>{activeTool === "cursor" ? "Drag to pan · Scroll/pinch to zoom" : "Drawing locked · drag the tool · select cursor to move chart"}</div>
            <div>{clock ? `India · ${clock.toLocaleDateString("en-IN")} · ${clock.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })} IST` : "India · IST"}</div>
          </div>
        </section>

        <aside className="order-ticket">
          <div className="ticket-heading"><div><span className="eyebrow">Paper order</span><h2>{selected.symbol}</h2></div><span className="paper-badge">No real money</span></div>
          <div className="side-switch"><button className={side === "BUY" ? "buy-active" : ""} onClick={() => setSide("BUY")}>Buy</button><button className={side === "SELL" ? "sell-active" : ""} onClick={() => setSide("SELL")}>Sell</button></div>
          <div className="order-type-tabs">{["Market", "Limit", "SL"].map((type) => <button key={type} className={orderType === type ? "active" : ""} onClick={() => setOrderType(type)}>{type}</button>)}</div>
          <div className="input-grid">
            <label>Quantity<div className="stepper"><button onClick={() => setQuantity(Math.max(1, quantity - 1))}><Minus size={15} /></button><input type="number" min="1" value={quantity} onChange={(event) => setQuantity(Math.max(1, Number(event.target.value)))} /><button onClick={() => setQuantity(quantity + 1)}><Plus size={15} /></button></div></label>
            {orderType !== "Market" && <label>Price (₹)<input className="text-input" type="number" value={livePrice.toFixed(2)} readOnly /></label>}
          </div>
          <div className="product-select"><label className={!marketStatus.isOpen ? "disabled-product" : ""}><input type="radio" name="product" checked={product === "INTRADAY"} disabled={!marketStatus.isOpen} onChange={() => setProduct("INTRADAY")} /><span><b>Intraday</b><small>{marketStatus.isOpen ? "MIS · 5x leverage" : "Closed · 09:15–15:30 IST"}</small></span></label><label><input type="radio" name="product" checked={product === "DELIVERY"} onChange={() => setProduct("DELIVERY")} /><span><b>Delivery</b><small>CNC · no leverage</small></span></label></div>
          <div className="margin-card"><div><span>Order value</span><b>{formatInr(orderValue)}</b></div><div><span>Est. margin</span><b>{formatInr(margin)}</b></div><div><span>Est. taxes &amp; charges</span><b>{formatInr(estimatedOrderCharges.total)}</b></div><div><span>Available cash</span><b>{formatInr(balance)}</b></div></div>
          {selectedPosition.quantity > 0 && (
            <div className="ticket-live-position">
              <div><span>{selectedPosition.side} · {selectedPosition.quantity} shares</span><b className={selectedPosition.unrealizedPnl >= 0 ? "positive" : "negative"}>{selectedPosition.unrealizedPnl >= 0 ? "+" : ""}{formatInr(selectedPosition.unrealizedPnl)}</b></div>
              <small>Avg {formatInr(selectedPosition.averagePrice)} · Live {formatInr(livePrice)} · {selectedPosition.returnPercent >= 0 ? "+" : ""}{selectedPosition.returnPercent.toFixed(2)}%</small>
              <div className="ticket-exit-controls">
                <label>Exit qty<input type="text" inputMode="numeric" value={exitQuantity} onFocus={() => setExitQuantity("")} onChange={(event) => setExitQuantity(event.target.value.replace(/\D/g, ""))} onBlur={() => setExitQuantity(String(safeExitQuantity))} /></label>
                <button disabled={positionProduct === "INTRADAY" && !marketStatus.isOpen} onClick={() => exitPosition(safeExitQuantity)}>Exit {safeExitQuantity}</button>
                <button disabled={positionProduct === "INTRADAY" && !marketStatus.isOpen} onClick={() => exitPosition(selectedPosition.quantity)}>Exit all</button>
              </div>
              {positionProduct === "INTRADAY" && !marketStatus.isOpen && <small className="market-closed-note">{marketStatus.message}</small>}
            </div>
          )}
          <button disabled={product === "INTRADAY" && !marketStatus.isOpen} className={`place-order ${side.toLowerCase()}`} onClick={placeOrder}>{product === "INTRADAY" && !marketStatus.isOpen ? "INTRADAY CLOSED" : `${side} ${quantity} ${selected.symbol}`}<ChevronRight size={18} /></button>
          <p className="disclaimer"><Bot size={15} /> Simulation only. Orders are saved on this device and never reach an exchange.</p>
          <div className="recent-orders-mini">
            <div className="section-line"><b>Recent orders</b><button onClick={() => setOrdersOpen(true)}>View all</button></div>
            {todayOrders.slice(0, 3).map((order) => <div className="mini-order" key={order.id}><span className={order.side === "BUY" ? "buy-tag" : "sell-tag"}>{order.side}</span><span><b>{order.symbol}</b><small>{order.quantity} × {order.price.toFixed(2)}</small></span><small>{order.time}</small></div>)}
            {!todayOrders.length && <div className="no-orders">Today&apos;s simulated trades will appear here.</div>}
          </div>
        </aside>
      </div>

      <nav className="mobile-bottom-nav"><button className="active" onClick={() => setSidebarOpen(false)}><LineChart size={19} /><span>Trade</span></button><button onClick={() => setSidebarOpen(true)}><Layers3 size={19} /><span>Watchlist</span></button><button onClick={() => setPositionsOpen(true)}><BriefcaseBusiness size={19} /><span>Positions</span></button><button onClick={() => setOrdersOpen(true)}><WalletCards size={19} /><span>Orders</span></button><button onClick={() => setGainersOpen(true)}><TrendingUp size={19} /><span>Markets</span></button><button onClick={() => setPnlOpen(true)}><Activity size={19} /><span>P&amp;L</span></button></nav>

      {showApi && <ApiSettings onClose={() => setShowApi(false)} />}
      {ordersOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setOrdersOpen(false)}>
          <section className="modal orders-modal" role="dialog" aria-modal="true" aria-label="Paper orders" onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-head"><div><span className="eyebrow">Local account</span><h2>Paper order book</h2></div><button className="icon-button" onClick={() => setOrdersOpen(false)}><X size={20} /></button></div>
            <div className="order-table">
              <div className="order-row table-head"><span>Time</span><span>Symbol</span><span>Side</span><span>Qty</span><span>Price</span><span>Charges</span><span>Status</span></div>
              {todayOrders.map((order) => <div className="order-row" key={order.id}><span>{order.time}</span><b>{order.symbol}</b><span className={order.side === "BUY" ? "positive" : "negative"}>{order.side}</span><span>{order.quantity}</span><span>{formatInr(order.price)}</span><span>{formatInr(getOrderCharges(order).total)}</span><span className="complete-tag">{order.autoSquareOff ? "Auto 3:20" : "Complete"}</span></div>)}
              {!todayOrders.length && <div className="order-empty"><WalletCards size={28} /><b>No orders today</b><span>The daily order book resets at midnight; completed trades remain in P&amp;L.</span></div>}
            </div>
          </section>
        </div>
      )}
      {positionsOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setPositionsOpen(false)}>
          <section className="modal positions-modal" role="dialog" aria-modal="true" aria-label="Open positions" onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-head"><div><span className="eyebrow">Paper portfolio</span><h2>Open positions</h2></div><button className="icon-button" onClick={() => setPositionsOpen(false)} aria-label="Close positions"><X size={20} /></button></div>
            <div className="positions-summary"><span>{openPositions.length} open</span><div><small>Live P&amp;L</small><b className={totalOpenPnl >= 0 ? "positive" : "negative"}>{totalOpenPnl >= 0 ? "+" : ""}{formatInr(totalOpenPnl)}</b></div></div>
            <div className="positions-list">
              {openPositions.map((position) => (
                <button key={`${position.symbol}-${position.product}`} className="position-row" onClick={() => openPositionChart(position.symbol)}>
                  <span className={position.side === "LONG" ? "buy-tag" : "sell-tag"}>{position.side}</span>
                  <span><b>{position.symbol}</b><small>{position.name} · {position.product} · {position.quantity} shares</small></span>
                  <span><b className={position.unrealizedPnl >= 0 ? "positive" : "negative"}>{position.unrealizedPnl >= 0 ? "+" : ""}{formatInr(position.unrealizedPnl)}</b><small>{formatInr(position.livePrice)} · {position.returnPercent >= 0 ? "+" : ""}{position.returnPercent.toFixed(2)}%</small></span>
                  <ChevronRight size={17} />
                </button>
              ))}
              {!openPositions.length && <div className="positions-empty"><BriefcaseBusiness size={30} /><b>No open positions</b><span>Open a paper buy or sell order to track it here.</span></div>}
            </div>
          </section>
        </div>
      )}
      {gainersOpen && (
        <section className="market-discovery-panel" aria-label="Intraday recovery stocks from Upstox">
          <div className="market-discovery-head"><div><span className="eyebrow">Upstox · Stocks</span><h2>Intraday Recovery</h2><small>Stocks recovering the most from today&apos;s low</small></div><button className="icon-button" onClick={() => setGainersOpen(false)} aria-label="Close markets"><X size={20} /></button></div>
          <div className="market-discovery-list">
            {intradayRecoveryRows.map(({ item, quote, recoveryPercent }) => (
              <button key={item.symbol} className="trend-stock-row" onClick={() => { chooseTradeInstrument(item); setGainersOpen(false); }}>
                <span className="symbol-avatar">{item.symbol.slice(0, 2)}</span>
                <span><b>{item.symbol}</b><small>{item.name} · NSE</small></span>
                <span><b>{formatInr(quote.lastPrice)}</b><small className="positive">+{recoveryPercent.toFixed(2)}% from low</small></span>
              </button>
            ))}
            {gainersLoading && !intradayRecoveryRows.length && <div className="positions-empty"><TrendingUp size={30} /><b>Loading Intraday Recovery</b><span>Scanning live quotes for all NSE stocks.</span></div>}
            {!gainersLoading && !intradayRecoveryRows.length && <div className="positions-empty"><Cable size={30} /><b>Intraday Recovery unavailable</b><span>Check the Upstox token in Broker API settings.</span></div>}
          </div>
        </section>
      )}
      {watchlistPickerOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setWatchlistPickerOpen(false)}>
          <section className="modal watchlist-picker-modal" role="dialog" aria-modal="true" aria-label="Custom watchlists" onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-head"><div><span className="eyebrow">Custom watchlists</span><h2>{watchlistTarget ? `Add ${watchlistTarget.symbol}` : "Manage watchlists"}</h2></div><button className="icon-button" onClick={() => setWatchlistPickerOpen(false)} aria-label="Close custom watchlists"><X size={20} /></button></div>
            {!watchlistTarget && customWatchlists.length > 0 && (
              <div className="custom-list-editor">
                {customWatchlists.map((list) => <div key={list.id}><input defaultValue={list.name} maxLength={24} aria-label={`Rename ${list.name}`} onBlur={(event) => renameCustomWatchlist(list.id, event.target.value)} /><small>{list.symbols.length} stocks</small><button onClick={() => deleteCustomWatchlist(list.id)} aria-label={`Delete ${list.name}`}><Trash2 size={16} /></button></div>)}
              </div>
            )}
            {watchlistTarget && customWatchlists.length > 0 && (
              <div className="custom-watchlist-choices">
                {customWatchlists.map((list) => {
                  const included = list.symbols.includes(watchlistTarget.symbol);
                  return <button key={list.id} onClick={() => toggleWatchlistMembership(list.id)}><span className={included ? "checked" : ""}>{included ? "✓" : ""}</span><span><b>{list.name}</b><small>{list.symbols.length} stocks</small></span><em>{included ? "Added" : "Add"}</em></button>;
                })}
              </div>
            )}
            {customWatchlists.length < 5 ? (
              <div className="new-watchlist-form">
                <label>New watchlist name<input value={newWatchlistName} maxLength={24} onChange={(event) => setNewWatchlistName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") createCustomWatchlist(); }} placeholder="Example: Swing trades" autoFocus={!watchlistTarget || !customWatchlists.length} /></label>
                <button className="primary-button" type="button" disabled={!newWatchlistName.trim()} onClick={createCustomWatchlist}><Plus size={17} /> Create {watchlistTarget ? "and add" : "watchlist"}</button>
              </div>
            ) : <p className="watchlist-limit-note">You have created the maximum of 5 custom watchlists.</p>}
            {watchlistTarget && customWatchlists.length > 0 && <button className="watchlist-done" onClick={() => setWatchlistPickerOpen(false)}>Done</button>}
          </section>
        </div>
      )}
      {pnlOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setPnlOpen(false)}>
          <section className="modal pnl-modal" role="dialog" aria-modal="true" aria-label="Paper trading profit and loss" onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-head"><div><span className="eyebrow">Complete trade record</span><h2>Profit &amp; loss</h2></div><button className="icon-button" onClick={() => setPnlOpen(false)} aria-label="Close profit and loss"><X size={20} /></button></div>
            <div className="pnl-stat-grid">
              <div><span>Net P&amp;L</span><b className={pnlStats.netPnl >= 0 ? "positive" : "negative"}>{pnlStats.netPnl >= 0 ? "+" : ""}{formatInr(pnlStats.netPnl)}</b></div>
              <div><span>Total trades</span><b>{closedTrades.length}</b></div>
              <div><span>Win rate</span><b>{pnlStats.winRate.toFixed(1)}%</b></div>
              <div><span>Total profit</span><b className="positive">{formatInr(pnlStats.totalProfit)}</b></div>
              <div><span>Total loss</span><b className="negative">{formatInr(pnlStats.totalLoss)}</b></div>
              <div><span>Taxes &amp; charges</span><b>{formatInr(pnlStats.totalCharges)}</b></div>
            </div>
            <div className="pnl-chart-card"><div><b>Recent trade results</b><small>Net after estimated charges</small></div><div className="pnl-bars">{pnlChartTrades.map((trade) => <span key={trade.id} title={`${trade.symbol}: ${formatInr(trade.netPnl)}`} className={trade.netPnl >= 0 ? "profit" : "loss"} style={{ height: `${Math.max(8, Math.abs(trade.netPnl) / pnlChartMaximum * 100)}%` }} />)}</div></div>
            <div className="pnl-trade-list">
              {closedTrades.map((trade) => <div key={`${trade.id}-${trade.symbol}`} className="pnl-trade-row"><span className={trade.netPnl >= 0 ? "win" : "loss"}>{trade.netPnl >= 0 ? "WIN" : "LOSS"}</span><span><b>{trade.symbol}</b><small>{trade.product} · {trade.quantity} shares · {trade.closedAt ? new Date(trade.closedAt).toLocaleDateString("en-IN") : "Legacy trade"}</small></span><span><b className={trade.netPnl >= 0 ? "positive" : "negative"}>{trade.netPnl >= 0 ? "+" : ""}{formatInr(trade.netPnl)}</b><small>Charges {formatInr(trade.charges)}</small></span></div>)}
              {!closedTrades.length && <div className="positions-empty"><Activity size={30} /><b>No completed trades yet</b><span>Close a paper position to build your P&amp;L history.</span></div>}
            </div>
            <p className="pnl-disclaimer">Charges are estimates using current Upstox equity rates; actual contract-note rounding can differ.</p>
          </section>
        </div>
      )}
      {toast && <div className="toast"><Target size={18} /> {toast}</div>}
    </main>
  );
}
