"use client";

import {
  Activity, ArrowUpRight, Bot, BoxSelect, BriefcaseBusiness, Brush, Cable, CheckCircle2, ChevronDown, ChevronRight, Cloud,
  Eye, EyeOff, FlipHorizontal2, Layers3, LineChart, ListFilter, Lock, LockKeyhole, LockOpen,
  Magnet, Minus, Moon, MousePointer2, MoveDiagonal2, MoveVertical, Plus, Radio, Ruler, Sun,
  LogOut, Redo2, Search, Star, Target, Trash2, Undo2, UserRound,
  TrendingDown, TrendingUp, WalletCards, X, type LucideIcon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { DEFAULT_CHART_INDICATORS, MarketChart, type ChartAction, type ChartActionRequest, type ChartIndicators, type DrawingTool, type FeedStatus } from "@/components/MarketChart";
import { DrawingToolLibrary } from "@/components/DrawingToolLibrary";
import { ChartFunctionMenu } from "@/components/ChartFunctionMenu";
import { formatInr, instruments, mergeInstrumentUniverse, type Candle, type Instrument } from "@/lib/market";
import { getNseMarketStatus } from "@/lib/market-hours";
import {
  calculatePosition,
  deletePaperTradeOrders,
  getProtectionTrigger,
  readPaperOrders,
  readPaperProtections,
  repairRatnaveerSimulationTrade,
  writePaperOrders,
  writePaperProtections,
  type PaperOrder,
  type PaperProtection,
} from "@/lib/paper-trading";
import { buildClosedTrades, getOrderCharges, type ClosedPaperTrade } from "@/lib/trade-analytics";
import { calculateUpstoxEquityCharges } from "@/lib/trading-charges";
import type { NormalizedQuote } from "@/lib/upstox";
import type { VolumeBreakoutRow } from "@/lib/volume-breakout";
import { useAuth } from "@/components/AuthProvider";

const watchlistTabs = ["NIFTY 50", "BANK NIFTY", "NIFTY 500", "ALL NSE"] as const;
const periods = ["1m", "5m", "15m", "1H", "3H", "4H", "1D", "1W", "1M", "1Y"];
const CUSTOM_WATCHLIST_STORAGE_KEY = "papertrade-custom-watchlists";
const LAST_CHART_STORAGE_KEY = "papertrade-last-chart";
const RATNAVEER_REPAIR_STORAGE_KEY = "papertrade-repair-ratnaveer-demo-v1";
const MAX_VIRTUAL_BALANCE = 100_000_000;
const UPSTOX_AUTO_SQUARE_OFF_HOUR = 15;
const UPSTOX_AUTO_SQUARE_OFF_MINUTE = 0;
const UPSTOX_AUTO_SQUARE_OFF_MINUTES = UPSTOX_AUTO_SQUARE_OFF_HOUR * 60 + UPSTOX_AUTO_SQUARE_OFF_MINUTE;
const UPSTOX_AUTO_SQUARE_OFF_POLICY = "UPSTOX_15_00_2026_02";

type CustomWatchlist = {
  id: string;
  name: string;
  symbols: string[];
};

type NavigationSection = "trade" | "watchlist" | "positions" | "orders" | "markets" | "pnl";

function getPaperOrderTimestamp(order: PaperOrder) {
  const idTimestamp = Number(order.id);
  return order.createdAt ?? (Number.isFinite(idTimestamp) && idTimestamp > 1_000_000_000_000 ? idTimestamp : 0);
}

function indiaDateKey(value: Date | number) {
  const date = typeof value === "number" ? new Date(value) : value;
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const record = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${record.year}-${record.month}-${record.day}`;
}

function squareOffTimestamp(sessionDate: string) {
  return Date.parse(`${sessionDate}T15:00:00+05:30`);
}

function squareOffTimeLabel(timestamp: number) {
  return new Date(timestamp).toLocaleTimeString("en-IN", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatCompactVolume(value: number) {
  return value.toLocaleString("en-IN", { notation: "compact", maximumFractionDigits: 2 });
}

async function fetchSquareOffPrice(instrumentKey: string, sessionDate: string) {
  const response = await fetch(`/api/upstox/candles?instrumentKey=${encodeURIComponent(instrumentKey)}&timeframe=1m&scope=combined`, { cache: "no-store" });
  const payload = await response.json() as { ok?: boolean; candles?: Candle[] };
  if (!response.ok || !payload.ok || !payload.candles?.length) return undefined;
  const sessionStart = Date.parse(`${sessionDate}T09:15:00+05:30`) / 1_000;
  const squareOffEnd = Date.parse(`${sessionDate}T15:00:59+05:30`) / 1_000;
  const candle = payload.candles
    .filter((item) => Number(item.time) >= sessionStart && Number(item.time) <= squareOffEnd)
    .sort((a, b) => Number(a.time) - Number(b.time))
    .at(-1);
  return candle && Number.isFinite(candle.close) && candle.close > 0 ? candle.close : undefined;
}
const drawingTools: { id: DrawingTool; label: string; icon: LucideIcon }[] = [
  { id: "cursor", label: "Cursor", icon: MousePointer2 },
  { id: "trend-line", label: "Trend line", icon: TrendingUp },
  { id: "extended-line", label: "Extended line", icon: MoveDiagonal2 },
  { id: "ray", label: "Diagonal ray", icon: ArrowUpRight },
  { id: "horizontal-line", label: "Horizontal line", icon: Minus },
  { id: "horizontal-ray", label: "Horizontal ray", icon: Radio },
  { id: "vertical-line", label: "Vertical line", icon: MoveVertical },
  { id: "parallel-channel", label: "Parallel channel", icon: FlipHorizontal2 },
  { id: "brush", label: "Brush", icon: Brush },
  { id: "rectangle", label: "Rectangle + mid", icon: BoxSelect },
  { id: "fib-retracement", label: "Fibonacci", icon: ListFilter },
  { id: "price-range", label: "Price range", icon: Ruler },
  { id: "long-position", label: "Long position", icon: TrendingUp },
  { id: "short-position", label: "Short position", icon: TrendingDown },
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
  const router = useRouter();
  const { configured: authConfigured, user, syncStatus, signOut } = useAuth();
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
  const [activeTool, setActiveTool] = useState<DrawingTool>("cursor");
  const [showDrawingLibrary, setShowDrawingLibrary] = useState(false);
  const [showChartFunctions, setShowChartFunctions] = useState(false);
  const [chartAction, setChartAction] = useState<ChartActionRequest>();
  const [drawingsLocked, setDrawingsLocked] = useState(false);
  const [undoSignal, setUndoSignal] = useState(0);
  const [redoSignal, setRedoSignal] = useState(0);
  const [toolSignal, setToolSignal] = useState(0);
  const [magnet, setMagnet] = useState(true);
  const [hiddenDrawings, setHiddenDrawings] = useState(false);
  const [clearSignal, setClearSignal] = useState(0);
  const [side, setSide] = useState<"BUY" | "SELL">("BUY");
  const [riskToolEnabled, setRiskToolEnabled] = useState(false);
  const [theme, setTheme] = useState<"light" | "neon">("light");
  const [quantityInput, setQuantityInput] = useState("1");
  const parsedQuantity = Number.parseInt(quantityInput, 10);
  const quantity = Number.isFinite(parsedQuantity) && parsedQuantity > 0 ? parsedQuantity : 1;
  const [targetPrice, setTargetPrice] = useState("");
  const [stopLossPrice, setStopLossPrice] = useState("");
  const [orderType, setOrderType] = useState("Market");
  const [product, setProduct] = useState<"INTRADAY" | "DELIVERY">("INTRADAY");
  const [indicators, setIndicators] = useState<ChartIndicators>(DEFAULT_CHART_INDICATORS);
  const [exitQuantity, setExitQuantity] = useState("1");
  const [orders, setOrders] = useState<PaperOrder[]>([]);
  const [protections, setProtections] = useState<PaperProtection[]>([]);
  const [balance, setBalance] = useState(1000000);
  const [showApi, setShowApi] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [ordersOpen, setOrdersOpen] = useState(false);
  const [orderSheetOpen, setOrderSheetOpen] = useState(false);
  const [positionsOpen, setPositionsOpen] = useState(false);
  const [marketsOpen, setMarketsOpen] = useState(false);
  const [marketScannerLoading, setMarketScannerLoading] = useState(false);
  const [volumeBreakoutRows, setVolumeBreakoutRows] = useState<VolumeBreakoutRow[]>([]);
  const [marketScannerError, setMarketScannerError] = useState("");
  const [pnlOpen, setPnlOpen] = useState(false);
  const [pnlTradeMenuId, setPnlTradeMenuId] = useState<string | null>(null);
  const [fundsOpen, setFundsOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [fundsInput, setFundsInput] = useState("100000");
  const [showTradeSymbols, setShowTradeSymbols] = useState(false);
  const [tradeSymbolSearch, setTradeSymbolSearch] = useState("");
  const [toast, setToast] = useState("");
  const [clock, setClock] = useState<Date | null>(null);
  const [feedStatus, setFeedStatus] = useState<FeedStatus>({
    mode: "loading",
    message: "Connecting to Upstox…",
  });
  const [marketQuotes, setMarketQuotes] = useState<Record<string, NormalizedQuote>>({});
  const [marketQuoteUpdatedAt, setMarketQuoteUpdatedAt] = useState<Record<string, number>>({});
  const tradeSymbolPickerRef = useRef<HTMLDivElement>(null);
  const pendingChartRestoreRef = useRef<{ symbol: string; timeframe: string } | null>({ symbol: "__PENDING__", timeframe: "5m" });
  const autoSquareOffInFlightRef = useRef(false);
  const autoSquareOffRetryAtRef = useRef(0);
  const autoSquareOffRepairInFlightRef = useRef(false);

  useEffect(() => {
    const restore = window.setTimeout(() => {
      try {
        const storedOrders = readPaperOrders();
        let restoredOrders = storedOrders;
        let restoredBalance = Number(localStorage.getItem("papertrade-balance") ?? "1000000");
        if (localStorage.getItem(RATNAVEER_REPAIR_STORAGE_KEY) !== "done") {
          const repair = repairRatnaveerSimulationTrade(storedOrders);
          if (repair.removedOrders.length) {
            restoredOrders = repair.orders;
            restoredBalance += repair.balanceAdjustment;
            writePaperOrders(restoredOrders);
            localStorage.setItem("papertrade-balance", String(restoredBalance));
            setToast("Removed the corrupted RATNAVEER simulated stop-loss trade and repaired cash");
            window.setTimeout(() => setToast(""), 5_000);
          }
          localStorage.setItem(RATNAVEER_REPAIR_STORAGE_KEY, "done");
        }
        setOrders(restoredOrders);
        setProtections(readPaperProtections());
        setBalance(restoredBalance);
        setTheme(localStorage.getItem("papertrade-theme") === "neon" ? "neon" : "light");
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
      let savedChart: { symbol?: string; timeframe?: string } = {};
      try { savedChart = JSON.parse(localStorage.getItem(LAST_CHART_STORAGE_KEY) ?? "{}"); } catch { /* Ignore malformed preference. */ }
      const requestedSymbol = params.get("symbol")?.toUpperCase() ?? savedChart.symbol?.toUpperCase();
      const requestedTimeframe = params.get("timeframe") ?? savedChart.timeframe;
      pendingChartRestoreRef.current = requestedSymbol
        ? { symbol: requestedSymbol, timeframe: periods.includes(requestedTimeframe ?? "") ? requestedTimeframe! : "5m" }
        : null;
      if (requestedTimeframe && periods.includes(requestedTimeframe)) {
        setTimeframe(requestedTimeframe);
      }
      if (requestedSymbol) {
        const fallbackInstrument = instruments.find((item) => item.symbol === requestedSymbol);
        if (fallbackInstrument) {
          setSelected(fallbackInstrument);
        }
      }
    }, 0);
    return () => window.clearTimeout(applyRequestedChart);
  }, []);

  useEffect(() => {
    const pending = pendingChartRestoreRef.current;
    if (pending && selected.symbol !== pending.symbol) return;
    pendingChartRestoreRef.current = null;
    localStorage.setItem(LAST_CHART_STORAGE_KEY, JSON.stringify({ symbol: selected.symbol, timeframe }));
  }, [selected.symbol, timeframe]);

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
        let savedSymbol = "";
        try { savedSymbol = (JSON.parse(localStorage.getItem(LAST_CHART_STORAGE_KEY) ?? "{}") as { symbol?: string }).symbol?.toUpperCase() ?? ""; } catch { /* Ignore malformed preference. */ }
        const requestedSymbol = new URLSearchParams(window.location.search).get("symbol")?.toUpperCase() ?? savedSymbol;
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

  const activeCustomList = useMemo(() => customWatchlists.find((list) => `custom:${list.id}` === watchlist) ?? null, [customWatchlists, watchlist]);

  useEffect(() => {
    const controller = new AbortController();
    if (!quoteKeys) return;
    let retryAt = 0;
    let requestInFlight = false;

    async function loadWatchlistQuotes() {
      if (requestInFlight || Date.now() < retryAt) return;
      requestInFlight = true;
      try {
        const response = await fetch(`/api/upstox/quotes?keys=${encodeURIComponent(quoteKeys)}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const payload = await response.json() as {
          ok?: boolean;
          quotes?: Record<string, NormalizedQuote>;
          error?: { code?: string; retryAfterSeconds?: number };
        };
        if (response.ok && payload.ok && payload.quotes) {
          setMarketQuotes((current) => ({ ...current, ...payload.quotes }));
          const receivedAt = Date.now();
          setMarketQuoteUpdatedAt((current) => ({
            ...current,
            ...Object.fromEntries(Object.keys(payload.quotes ?? {}).map((key) => [key, receivedAt])),
          }));
          retryAt = 0;
        } else if (payload.error?.code === "RATE_LIMITED") {
          retryAt = Date.now() + Math.max(30, payload.error.retryAfterSeconds ?? 30) * 1_000;
          setToast("Upstox rate limit reached. Live trading is paused; retrying automatically.");
          window.setTimeout(() => setToast(""), 5_000);
        }
      } catch {
        retryAt = Date.now() + 30_000;
      } finally {
        requestInFlight = false;
      }
    }

    void loadWatchlistQuotes();
    const interval = window.setInterval(() => void loadWatchlistQuotes(), 20_000);
    return () => {
      controller.abort();
      window.clearInterval(interval);
    };
  }, [quoteKeys, selected.instrumentKey, selected.symbol]);

  useEffect(() => {
    if (!marketsOpen || !stockUniverse.length) return;
    const controller = new AbortController();

    async function loadVolumeBreakouts() {
      setMarketScannerLoading(true);
      setMarketScannerError("");
      try {
        const response = await fetch("/api/market/volume-breakouts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            instruments: stockUniverse
              .filter((item) => /^NSE_EQ\|INE[A-Z0-9]+$/.test(item.instrumentKey))
              .map(({ symbol, name, instrumentKey }) => ({ symbol, name, instrumentKey })),
          }),
          cache: "no-store",
          signal: controller.signal,
        });
        const payload = await response.json() as {
          ok?: boolean;
          rows?: VolumeBreakoutRow[];
          error?: { message?: string };
        };
        if (!response.ok || !payload.ok) throw new Error(payload.error?.message ?? "Volume scanner is unavailable.");
        if (!controller.signal.aborted) {
          setVolumeBreakoutRows(payload.rows ?? []);
        }
      } catch (error) {
        if (!controller.signal.aborted) setMarketScannerError(error instanceof Error ? error.message : "Volume scanner is unavailable.");
      } finally {
        if (!controller.signal.aborted) setMarketScannerLoading(false);
      }
    }

    void loadVolumeBreakouts();
    return () => controller.abort();
  }, [marketsOpen, stockUniverse]);

  useEffect(() => {
    if (!clock || !orders.length || autoSquareOffInFlightRef.current || Date.now() < autoSquareOffRetryAtRef.current) return;
    const marketClock = getNseMarketStatus(clock);
    const afterSquareOff = marketClock.isTradingDay && marketClock.minutesFromMidnight >= UPSTOX_AUTO_SQUARE_OFF_MINUTES;
    const currentIndiaDate = indiaDateKey(clock);
    const symbols = [...new Set(orders.map((order) => order.symbol))];
    const pending = symbols.flatMap((symbol) => {
      const symbolOrders = orders.filter((order) => order.symbol === symbol && (order.product ?? "INTRADAY") === "INTRADAY").sort((a, b) => getPaperOrderTimestamp(b) - getPaperOrderTimestamp(a));
      const latestOrder = symbolOrders[0];
      if (!latestOrder) return [];
      const position = calculatePosition(orders, symbol, latestOrder.price, "INTRADAY");
      if (!position.quantity || position.side === "FLAT") return [];
      const orderIndiaDate = indiaDateKey(getPaperOrderTimestamp(latestOrder));
      const carriedOver = orderIndiaDate < currentIndiaDate;
      if (!carriedOver && !afterSquareOff) return [];
      const instrument = stockUniverse.find((item) => item.symbol === symbol);
      if (!instrument) return [];
      const quote = instrument ? marketQuotes[instrument.instrumentKey] ?? marketQuotes[symbol] : marketQuotes[symbol];
      return [{ symbol, position, instrument, quote, sessionDate: carriedOver ? orderIndiaDate : currentIndiaDate }];
    });
    if (!pending.length) return;
    autoSquareOffInFlightRef.current = true;
    void Promise.all(pending.map(async (item) => ({
      ...item,
      resolvedPrice: await fetchSquareOffPrice(item.instrument.instrumentKey, item.sessionDate).catch(() => undefined),
    }))).then((resolved) => {
      const automaticOrders: PaperOrder[] = [];
      let nextBalance = balance;
      resolved.forEach((item, index) => {
        const squareOffPrice = item.resolvedPrice;
        if (!squareOffPrice || !Number.isFinite(squareOffPrice) || squareOffPrice <= 0) return;
        const closingSide = item.position.side === "LONG" ? "SELL" : "BUY";
        const charges = calculateUpstoxEquityCharges({ side: closingSide, product: "INTRADAY", quantity: item.position.quantity, price: squareOffPrice });
        const exitTimestamp = squareOffTimestamp(item.sessionDate);
        automaticOrders.push({
          id: `${exitTimestamp + index}`,
          symbol: item.symbol,
          side: closingSide,
          quantity: item.position.quantity,
          price: squareOffPrice,
          status: "COMPLETE",
          time: squareOffTimeLabel(exitTimestamp),
          product: "INTRADAY",
          createdAt: exitTimestamp,
          charges,
          autoSquareOff: true,
          squareOffPolicy: UPSTOX_AUTO_SQUARE_OFF_POLICY,
          exitReason: "AUTO_SQUARE_OFF",
          priceSource: item.resolvedPrice ? "UPSTOX_CANDLE" : "UPSTOX_QUOTE",
        });
        const releasedMargin = squareOffPrice * item.position.quantity * 0.2;
        nextBalance = closingSide === "SELL" ? nextBalance + releasedMargin - charges.total : nextBalance - releasedMargin - charges.total;
      });
      if (!automaticOrders.length) {
        autoSquareOffRetryAtRef.current = Date.now() + 60_000;
        return;
      }
      const nextOrders = [...automaticOrders, ...orders];
      setOrders(nextOrders);
      setBalance(nextBalance);
      writePaperOrders(nextOrders);
      localStorage.setItem("papertrade-balance", String(nextBalance));
      setProtections((current) => {
        const automaticallyClosed = new Set(automaticOrders.map((order) => `${order.symbol}:INTRADAY`));
        const remaining = current.filter((item) => !automaticallyClosed.has(`${item.symbol}:${item.product}`));
        writePaperProtections(remaining);
        return remaining;
      });
      setToast(`${automaticOrders.length} intraday position${automaticOrders.length > 1 ? "s" : ""} auto squared off at 3:00 PM`);
      window.setTimeout(() => setToast(""), 4_000);
    }).finally(() => {
      autoSquareOffInFlightRef.current = false;
    });
  }, [balance, clock, marketQuotes, orders, stockUniverse]);

  useEffect(() => {
    if (!orders.length || autoSquareOffRepairInFlightRef.current) return;
    const candidates = orders
      .filter((order) => order.autoSquareOff && order.exitReason === "AUTO_SQUARE_OFF" && order.squareOffPolicy !== UPSTOX_AUTO_SQUARE_OFF_POLICY)
      .map((order) => ({ order, instrument: stockUniverse.find((item) => item.symbol === order.symbol) }))
      .filter((item): item is { order: PaperOrder; instrument: Instrument } => Boolean(item.instrument));
    if (!candidates.length) return;
    autoSquareOffRepairInFlightRef.current = true;
    void Promise.all(candidates.map(async ({ order, instrument }) => {
      const sessionDate = indiaDateKey(getPaperOrderTimestamp(order));
      const price = await fetchSquareOffPrice(instrument.instrumentKey, sessionDate).catch(() => undefined);
      return { order, sessionDate, price };
    })).then((results) => {
      const replacements = new Map<string, PaperOrder>();
      let balanceAdjustment = 0;
      for (const { order, sessionDate, price } of results) {
        if (!price || !Number.isFinite(price) || price <= 0) continue;
        const correctedTimestamp = squareOffTimestamp(sessionDate);
        const correctedCharges = calculateUpstoxEquityCharges({ side: order.side, product: "INTRADAY", quantity: order.quantity, price });
        const correctedTime = squareOffTimeLabel(correctedTimestamp);
        const priceChanged = Math.abs(price - order.price) > 0.0001;
        const timeChanged = order.createdAt !== correctedTimestamp || order.time !== correctedTime;
        if (!priceChanged && !timeChanged) {
          replacements.set(order.id, { ...order, squareOffPolicy: UPSTOX_AUTO_SQUARE_OFF_POLICY });
          continue;
        }
        const oldCharges = getOrderCharges(order);
        const oldCashEffect = (order.side === "SELL" ? 1 : -1) * order.price * order.quantity * 0.2 - oldCharges.total;
        const newCashEffect = (order.side === "SELL" ? 1 : -1) * price * order.quantity * 0.2 - correctedCharges.total;
        balanceAdjustment += newCashEffect - oldCashEffect;
        replacements.set(order.id, { ...order, price, time: correctedTime, createdAt: correctedTimestamp, charges: correctedCharges, squareOffPolicy: UPSTOX_AUTO_SQUARE_OFF_POLICY });
      }
      if (!replacements.size) return;
      const repairedOrders = orders.map((order) => replacements.get(order.id) ?? order);
      writePaperOrders(repairedOrders);
      setOrders(repairedOrders);
      setBalance((current) => {
        const correctedBalance = current + balanceAdjustment;
        localStorage.setItem("papertrade-balance", String(correctedBalance));
        return correctedBalance;
      });
      setToast(`${replacements.size} auto square-off record${replacements.size > 1 ? "s" : ""} corrected from Upstox 3:00 PM candles`);
      window.setTimeout(() => setToast(""), 4_000);
    }).finally(() => {
      autoSquareOffRepairInFlightRef.current = false;
    });
  }, [orders, stockUniverse]);

  useEffect(() => {
    if (!clock || !orders.length || !protections.length || !getNseMarketStatus(clock).isOpen) return;
    const afterIntradaySquareOff = getNseMarketStatus(clock).minutesFromMidnight >= UPSTOX_AUTO_SQUARE_OFF_MINUTES;
    const triggeredOrders: PaperOrder[] = [];
    const clearedProtectionIds = new Set<string>();
    let nextBalance = balance;

    protections.forEach((protection, index) => {
      if (protection.product === "INTRADAY" && afterIntradaySquareOff) return;
      const instrument = stockUniverse.find((item) => item.symbol === protection.symbol);
      const quote = instrument ? marketQuotes[instrument.instrumentKey] ?? marketQuotes[protection.symbol] : marketQuotes[protection.symbol];
      const quoteKey = instrument && marketQuotes[instrument.instrumentKey] ? instrument.instrumentKey : protection.symbol;
      const quoteIsFresh = Boolean(quote && clock.getTime() - (marketQuoteUpdatedAt[quoteKey] ?? 0) <= 45_000);
      const price = quote?.lastPrice;
      const latestFill = orders.find((order) => order.symbol === protection.symbol && (order.product ?? "INTRADAY") === protection.product);
      const position = calculatePosition(orders, protection.symbol, price ?? latestFill?.price ?? Number.NaN, protection.product);
      if (!position.quantity || position.side === "FLAT" || position.side !== protection.side) {
        clearedProtectionIds.add(protection.id);
        return;
      }
      if (!quoteIsFresh || !price || !Number.isFinite(price)) return;
      const trigger = getProtectionTrigger(protection, price);
      if (!trigger) return;
      const closingSide = position.side === "LONG" ? "SELL" : "BUY";
      const charges = calculateUpstoxEquityCharges({ side: closingSide, product: protection.product, quantity: position.quantity, price });
      const order: PaperOrder = {
        id: `${clock.getTime() + 10_000 + index}`,
        symbol: protection.symbol,
        side: closingSide,
        quantity: position.quantity,
        price,
        status: "COMPLETE",
        time: clock.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
        product: protection.product,
        createdAt: clock.getTime(),
        charges,
        exitReason: trigger,
        priceSource: "UPSTOX_QUOTE",
      };
      triggeredOrders.push(order);
      clearedProtectionIds.add(protection.id);
      const releasedMargin = price * position.quantity * 0.2;
      nextBalance = closingSide === "SELL" ? nextBalance + releasedMargin - charges.total : nextBalance - releasedMargin - charges.total;
    });

    if (!triggeredOrders.length && !clearedProtectionIds.size) return;
    const remainingProtections = protections.filter((item) => !clearedProtectionIds.has(item.id));
    // Protective exits are synchronized with the latest live quote.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setProtections(remainingProtections);
    writePaperProtections(remainingProtections);
    if (!triggeredOrders.length) return;
    const nextOrders = [...triggeredOrders, ...orders];
    setOrders(nextOrders);
    setBalance(nextBalance);
    writePaperOrders(nextOrders);
    localStorage.setItem("papertrade-balance", String(nextBalance));
    const reasons = triggeredOrders.map((order) => order.exitReason === "TARGET" ? "target" : "stop loss");
    setToast(`${triggeredOrders.length} position${triggeredOrders.length > 1 ? "s" : ""} exited by ${[...new Set(reasons)].join(" / ")}`);
    window.setTimeout(() => setToast(""), 4_000);
  }, [balance, clock, marketQuoteUpdatedAt, marketQuotes, orders, protections, selected.symbol, stockUniverse]);
  const handleFeedStatus = useCallback((status: FeedStatus) => setFeedStatus(status), []);
  const selectedQuote = marketQuotes[selected.instrumentKey] ?? marketQuotes[selected.symbol];
  const selectedQuoteKey = marketQuotes[selected.instrumentKey] ? selected.instrumentKey : selected.symbol;
  const selectedQuoteIsFresh = Boolean(selectedQuote && clock && clock.getTime() - (marketQuoteUpdatedAt[selectedQuoteKey] ?? 0) <= 45_000);
  const verifiedLivePrice = selectedQuoteIsFresh ? selectedQuote?.lastPrice : undefined;
  const visibleLivePrice = verifiedLivePrice ?? 0;
  const selectedChange = selectedQuoteIsFresh ? selectedQuote?.changePercent ?? 0 : 0;
  const selectedNetChange = selectedQuoteIsFresh ? selectedQuote?.netChange ?? 0 : 0;
  const orderValue = visibleLivePrice * quantity;
  const margin = orderValue * 0.2;
  const estimatedOrderCharges = useMemo(() => calculateUpstoxEquityCharges({ side, product, quantity, price: visibleLivePrice }), [product, quantity, side, visibleLivePrice]);
  const selectedPositions = useMemo(
    () => ({
      intraday: calculatePosition(orders, selected.symbol, verifiedLivePrice ?? Number.NaN, "INTRADAY"),
      delivery: calculatePosition(orders, selected.symbol, verifiedLivePrice ?? Number.NaN, "DELIVERY"),
    }),
    [orders, selected.symbol, verifiedLivePrice],
  );
  const selectedPosition = selectedPositions.intraday.quantity > 0 ? selectedPositions.intraday : selectedPositions.delivery;
  const positionProduct: "INTRADAY" | "DELIVERY" = selectedPositions.intraday.quantity > 0 ? "INTRADAY" : "DELIVERY";
  const selectedProtection = protections.find((item) => item.symbol === selected.symbol && item.product === positionProduct);
  const riskToolSide: "BUY" | "SELL" = selectedPosition.quantity > 0 && selectedPosition.side !== "FLAT"
    ? selectedPosition.side === "LONG" ? "BUY" : "SELL"
    : side;
  const riskEntryPrice = selectedPosition.quantity > 0 ? selectedPosition.averagePrice : visibleLivePrice;
  const requestedTargetPrice = Number(targetPrice);
  const requestedStopLossPrice = Number(stopLossPrice);
  const chartTargetPrice = Number.isFinite(requestedTargetPrice) && requestedTargetPrice > 0
    ? requestedTargetPrice
    : riskEntryPrice * (riskToolSide === "BUY" ? 1.01 : .99);
  const chartStopLossPrice = Number.isFinite(requestedStopLossPrice) && requestedStopLossPrice > 0
    ? requestedStopLossPrice
    : riskEntryPrice * (riskToolSide === "BUY" ? .995 : 1.005);

  useEffect(() => {
    if (!selectedProtection) return;
    const restoreProtection = window.setTimeout(() => {
      setTargetPrice(selectedProtection.targetPrice?.toFixed(2) ?? "");
      setStopLossPrice(selectedProtection.stopLossPrice?.toFixed(2) ?? "");
      setRiskToolEnabled(true);
    }, 0);
    return () => window.clearTimeout(restoreProtection);
  }, [selectedProtection, selected.symbol]);
  const openPositions = useMemo(() => positionSymbols.flatMap((symbol) => {
    const instrument = stockUniverse.find((item) => item.symbol === symbol);
    const quote = instrument ? marketQuotes[instrument.instrumentKey] ?? marketQuotes[symbol] : marketQuotes[symbol];
    const quoteKey = instrument && marketQuotes[instrument.instrumentKey] ? instrument.instrumentKey : symbol;
    const quoteIsFresh = Boolean(quote && clock && clock.getTime() - (marketQuoteUpdatedAt[quoteKey] ?? 0) <= 45_000);
    const positionLivePrice = symbol === selected.symbol
      ? verifiedLivePrice ?? Number.NaN
      : quoteIsFresh ? quote?.lastPrice ?? Number.NaN : Number.NaN;
    return (["INTRADAY", "DELIVERY"] as const).map((positionProductName) => ({
      ...calculatePosition(orders, symbol, positionLivePrice, positionProductName),
      name: instrument?.name ?? symbol,
      product: positionProductName,
    })).filter((position) => position.quantity > 0);
  }), [clock, marketQuoteUpdatedAt, marketQuotes, orders, positionSymbols, selected.symbol, stockUniverse, verifiedLivePrice]);
  const totalOpenPnl = openPositions.reduce((total, position) => total + position.unrealizedPnl, 0);
  const marketStatus = useMemo(
    () => clock ? getNseMarketStatus(clock) : { isOpen: false, message: "Checking NSE market hours…" },
    [clock],
  );
  const intradayOrdersAllowed = Boolean(
    clock && marketStatus.isOpen && getNseMarketStatus(clock).minutesFromMidnight < UPSTOX_AUTO_SQUARE_OFF_MINUTES,
  );
  const intradayStatusMessage = marketStatus.isOpen && !intradayOrdersAllowed
    ? "Upstox intraday auto square-off starts at 3:00 PM IST"
    : marketStatus.message;
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

  function protectionValues() {
    const target = targetPrice.trim() ? Number(targetPrice) : undefined;
    const stopLoss = stopLossPrice.trim() ? Number(stopLossPrice) : undefined;
    return { target, stopLoss };
  }

  function activateRiskTool(nextSide: "BUY" | "SELL") {
    setSide(nextSide);
    const positionMatches = selectedPosition.quantity > 0 && selectedPosition.side === (nextSide === "BUY" ? "LONG" : "SHORT");
    const entry = positionMatches ? selectedPosition.averagePrice : visibleLivePrice;
    if (!entry) {
      setRiskToolEnabled(false);
      return;
    }
    setRiskToolEnabled(true);
    const target = Number(targetPrice);
    const stop = Number(stopLossPrice);
    const validTarget = Number.isFinite(target) && (nextSide === "BUY" ? target > entry : target < entry);
    const validStop = Number.isFinite(stop) && (nextSide === "BUY" ? stop < entry : stop > entry);
    if (!validTarget) setTargetPrice((entry * (nextSide === "BUY" ? 1.01 : .99)).toFixed(2));
    if (!validStop) setStopLossPrice((entry * (nextSide === "BUY" ? .995 : 1.005)).toFixed(2));
  }

  function updateChartRiskLevel(level: "target" | "stopLoss", value: number, committed: boolean) {
    const formatted = value.toFixed(2);
    if (level === "target") setTargetPrice(formatted);
    else setStopLossPrice(formatted);
    if (!committed || selectedPosition.quantity <= 0 || selectedPosition.side === "FLAT") return;
    const nextTarget = level === "target" ? value : Number(targetPrice) || selectedProtection?.targetPrice;
    const nextStop = level === "stopLoss" ? value : Number(stopLossPrice) || selectedProtection?.stopLossPrice;
    saveProtection({
      id: selectedProtection?.id ?? `${new Date().getTime()}-chart-risk`,
      symbol: selected.symbol,
      product: positionProduct,
      side: selectedPosition.side,
      targetPrice: nextTarget,
      stopLossPrice: nextStop,
      createdAt: selectedProtection?.createdAt ?? new Date().getTime(),
    }, selected.symbol, positionProduct);
    setToast(`${level === "target" ? "Target" : "Stop loss"} moved to ${formatInr(value)}`);
    window.setTimeout(() => setToast(""), 2_200);
  }

  function toggleTheme() {
    setTheme((current) => {
      const next = current === "light" ? "neon" : "light";
      localStorage.setItem("papertrade-theme", next);
      return next;
    });
  }

  function addVirtualFunds() {
    const requestedAmount = Number(fundsInput);
    if (!Number.isFinite(requestedAmount) || requestedAmount <= 0) {
      setToast("Enter a valid virtual amount");
      window.setTimeout(() => setToast(""), 3_000);
      return;
    }
    const nextBalance = Math.min(MAX_VIRTUAL_BALANCE, balance + requestedAmount);
    if (nextBalance <= balance) {
      setToast("Maximum virtual balance of ₹10 crore already reached");
      window.setTimeout(() => setToast(""), 3_000);
      return;
    }
    setBalance(nextBalance);
    localStorage.setItem("papertrade-balance", String(nextBalance));
    setFundsOpen(false);
    setToast(`${formatInr(nextBalance - balance)} virtual money added`);
    window.setTimeout(() => setToast(""), 3_000);
  }

  function deleteClosedTrade(trade: ClosedPaperTrade) {
    const deletion = deletePaperTradeOrders(orders, trade.sourceOrderIds);
    if (!deletion.removedOrders.length) return;
    const confirmed = window.confirm(
      `Delete ${trade.symbol} trade from this device? Its entry/exit fills, P&L, charges and graph result will be recalculated.`,
    );
    if (!confirmed) return;
    const nextBalance = balance + deletion.balanceAdjustment;
    setOrders(deletion.orders);
    setBalance(nextBalance);
    writePaperOrders(deletion.orders);
    localStorage.setItem("papertrade-balance", String(nextBalance));
    const remainingPosition = calculatePosition(deletion.orders, trade.symbol, Number.NaN, trade.product);
    if (!remainingPosition.quantity) saveProtection(null, trade.symbol, trade.product);
    setPnlTradeMenuId(null);
    setToast(`${trade.symbol} trade deleted and account totals recalculated`);
    window.setTimeout(() => setToast(""), 3_500);
  }

  function protectionError(direction: "LONG" | "SHORT", referencePrice: number) {
    const { target, stopLoss } = protectionValues();
    if (target !== undefined && (!Number.isFinite(target) || target <= 0)) return "Enter a valid target price";
    if (stopLoss !== undefined && (!Number.isFinite(stopLoss) || stopLoss <= 0)) return "Enter a valid stop-loss price";
    if (direction === "LONG" && target !== undefined && target <= referencePrice) return "Long target must be above the live price";
    if (direction === "LONG" && stopLoss !== undefined && stopLoss >= referencePrice) return "Long stop loss must be below the live price";
    if (direction === "SHORT" && target !== undefined && target >= referencePrice) return "Short target must be below the live price";
    if (direction === "SHORT" && stopLoss !== undefined && stopLoss <= referencePrice) return "Short stop loss must be above the live price";
    return null;
  }

  function saveProtection(protection: PaperProtection | null, symbol: string, protectionProduct: "INTRADAY" | "DELIVERY") {
    const remaining = protections.filter((item) => !(item.symbol === symbol && item.product === protectionProduct));
    const next = protection ? [protection, ...remaining] : remaining;
    setProtections(next);
    writePaperProtections(next);
  }

  function applyProtectionToOpenPosition() {
    if (!selectedPosition.quantity || selectedPosition.side === "FLAT") return;
    if (!verifiedLivePrice) {
      setToast("Live Upstox price unavailable. Protection was not changed.");
      window.setTimeout(() => setToast(""), 3_500);
      return;
    }
    const error = protectionError(selectedPosition.side, verifiedLivePrice);
    if (error) {
      setToast(error);
      window.setTimeout(() => setToast(""), 3_200);
      return;
    }
    const { target, stopLoss } = protectionValues();
    if (target === undefined && stopLoss === undefined) {
      saveProtection(null, selected.symbol, positionProduct);
      setToast("Target and stop loss removed");
    } else {
      saveProtection({
        id: `${new Date().getTime()}`,
        symbol: selected.symbol,
        product: positionProduct,
        side: selectedPosition.side,
        targetPrice: target,
        stopLossPrice: stopLoss,
        createdAt: new Date().getTime(),
      }, selected.symbol, positionProduct);
      setToast("Target and stop loss updated");
    }
    window.setTimeout(() => setToast(""), 3_000);
  }

  function placeOrder() {
    if (!Number.isFinite(quantity) || quantity < 1) return;
    const executionPrice = verifiedLivePrice;
    if (!executionPrice || !Number.isFinite(executionPrice) || executionPrice <= 0) {
      setToast("Live Upstox price unavailable. Paper order was not placed.");
      window.setTimeout(() => setToast(""), 3_500);
      return;
    }
    if (product === "INTRADAY" && !intradayOrdersAllowed) {
      setToast(intradayStatusMessage);
      window.setTimeout(() => setToast(""), 3_500);
      return;
    }
    const intendedDirection = side === "BUY" ? "LONG" : "SHORT";
    const riskError = protectionError(intendedDirection, executionPrice);
    if (riskError) {
      setToast(riskError);
      window.setTimeout(() => setToast(""), 3_200);
      return;
    }
    const order: PaperOrder = {
      id: `${new Date().getTime()}`, symbol: selected.symbol, side, quantity, price: executionPrice,
      status: "COMPLETE", time: new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
      product, createdAt: new Date().getTime(), charges: calculateUpstoxEquityCharges({ side, product, quantity, price: executionPrice }),
      priceSource: selectedQuote?.lastPrice ? "UPSTOX_QUOTE" : "UPSTOX_CANDLE",
    };
    const executionCharges = getOrderCharges(order);
    const nextOrders = [order, ...orders];
    const executionMargin = executionPrice * quantity * .2;
    const nextBalance = (side === "BUY" ? balance - executionMargin : balance + executionMargin) - executionCharges.total;
    const nextPosition = calculatePosition(nextOrders, selected.symbol, executionPrice, product);
    const { target, stopLoss } = protectionValues();
    if ((target !== undefined || stopLoss !== undefined) && nextPosition.quantity > 0 && nextPosition.side === intendedDirection) {
      saveProtection({
        id: `${new Date().getTime()}-risk`,
        symbol: selected.symbol,
        product,
        side: intendedDirection,
        targetPrice: target,
        stopLossPrice: stopLoss,
        createdAt: new Date().getTime(),
      }, selected.symbol, product);
    } else if (!nextPosition.quantity || nextPosition.side !== intendedDirection) {
      saveProtection(null, selected.symbol, product);
    }
    setOrders(nextOrders);
    setBalance(nextBalance);
    writePaperOrders(nextOrders);
    localStorage.setItem("papertrade-balance", String(nextBalance));
    setTargetPrice("");
    setStopLossPrice("");
    setOrderSheetOpen(false);
    setToast(`${side === "BUY" ? "Bought" : "Sold"} ${quantity} ${selected.symbol} · charges ${formatInr(executionCharges.total)}`);
    window.setTimeout(() => setToast(""), 3200);
  }

  function exitPosition(requestedQuantity: number) {
    if (selectedPosition.quantity <= 0 || selectedPosition.side === "FLAT") return;
    const executionPrice = verifiedLivePrice;
    if (!executionPrice || !Number.isFinite(executionPrice) || executionPrice <= 0) {
      setToast("Live Upstox price unavailable. Position was not exited.");
      window.setTimeout(() => setToast(""), 3_500);
      return;
    }
    if (positionProduct === "INTRADAY" && !intradayOrdersAllowed) {
      setToast(intradayStatusMessage);
      window.setTimeout(() => setToast(""), 3_500);
      return;
    }
    const closingQuantity = Math.min(selectedPosition.quantity, Math.max(1, Math.floor(requestedQuantity)));
    const closingSide = selectedPosition.side === "LONG" ? "SELL" : "BUY";
    const exitCharges = calculateUpstoxEquityCharges({ side: closingSide, product: positionProduct, quantity: closingQuantity, price: executionPrice });
    const order: PaperOrder = {
      id: `${new Date().getTime()}`,
      symbol: selected.symbol,
      side: closingSide,
      quantity: closingQuantity,
      price: executionPrice,
      status: "COMPLETE",
      time: new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
      product: positionProduct,
      createdAt: new Date().getTime(),
      charges: exitCharges,
      exitReason: "MANUAL",
      priceSource: selectedQuote?.lastPrice ? "UPSTOX_QUOTE" : "UPSTOX_CANDLE",
    };
    const nextOrders = [order, ...orders];
    const exitMargin = executionPrice * closingQuantity * 0.2;
    const nextBalance = (closingSide === "BUY" ? balance - exitMargin : balance + exitMargin) - exitCharges.total;
    setOrders(nextOrders);
    setBalance(nextBalance);
    setExitQuantity("1");
    writePaperOrders(nextOrders);
    localStorage.setItem("papertrade-balance", String(nextBalance));
    if (closingQuantity >= selectedPosition.quantity) saveProtection(null, selected.symbol, positionProduct);
    setToast(`Exited ${closingQuantity} ${selected.symbol} · charges ${formatInr(exitCharges.total)}`);
    window.setTimeout(() => setToast(""), 3_200);
  }

  function toggleIndicator(name: keyof ChartIndicators) {
    setIndicators((current) => ({ ...current, [name]: !current[name] }));
  }

  function chooseTradeInstrument(item: Instrument) {
    const quote = marketQuotes[item.instrumentKey] ?? marketQuotes[item.symbol];
    const price = quote?.lastPrice ?? 0;
    setSelected({ ...item, price: price > 0 ? price : 0 });
    setShowTradeSymbols(false);
    setTradeSymbolSearch("");
    setRiskToolEnabled(false);
    setTargetPrice("");
    setStopLossPrice("");
    setSidebarOpen(false);
    const url = new URL(window.location.href);
    url.searchParams.set("symbol", item.symbol);
    url.searchParams.set("timeframe", timeframe);
    window.history.replaceState({}, "", url);
  }

  function openOrderSheet(nextSide: "BUY" | "SELL") {
    activateRiskTool(nextSide);
    setOrderSheetOpen(true);
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
      id: `${new Date().getTime()}`,
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
    setSidebarOpen(false);
    setPositionsOpen(false);
    setOrdersOpen(false);
    setMarketsOpen(false);
    setPnlOpen(false);
    router.push(`/?symbol=${encodeURIComponent(symbol)}&timeframe=${encodeURIComponent(timeframe)}`);
  }

  function openNavigationSection(section: NavigationSection) {
    setSidebarOpen(section === "watchlist");
    setPositionsOpen(section === "positions");
    setOrdersOpen(section === "orders");
    setMarketsOpen(section === "markets");
    setPnlOpen(section === "pnl");
  }

  const activeNavigationSection: NavigationSection = sidebarOpen
    ? "watchlist"
    : positionsOpen
      ? "positions"
      : ordersOpen
        ? "orders"
        : marketsOpen
          ? "markets"
          : pnlOpen
            ? "pnl"
            : "trade";

  return (
    <main className="terminal-shell" data-theme={theme}>
      <header className="topbar">
        <Brand />
        <nav className="main-nav" aria-label="Main navigation">
          <button className={activeNavigationSection === "trade" ? "nav-active" : ""} onClick={() => openNavigationSection("trade")}>Trade</button><button className={activeNavigationSection === "orders" ? "nav-active" : ""} onClick={() => openNavigationSection("orders")}>Orders</button><button className={activeNavigationSection === "markets" ? "nav-active" : ""} onClick={() => openNavigationSection("markets")}>Markets</button><button className={activeNavigationSection === "positions" ? "nav-active" : ""} onClick={() => openNavigationSection("positions")}>Positions</button><button className={activeNavigationSection === "pnl" ? "nav-active" : ""} onClick={() => openNavigationSection("pnl")}>P&amp;L</button>
        </nav>
        <div className="top-actions">
          <div className={`market-status ${feedStatus.mode}`} title={feedStatus.message}>
            <span /> {feedStatus.mode === "live" ? "Upstox data" : feedStatus.mode === "loading" ? "Connecting" : "Fallback data"}
          </div>
          <button className="funds-button" onClick={() => setFundsOpen(true)} title="Add virtual money"><WalletCards size={16} /> {formatInr(balance)}</button>
          <button className="api-button" onClick={() => setShowApi(true)}><Cable size={16} /> Broker API</button>
          <button className="icon-button theme-toggle" onClick={toggleTheme} aria-label={theme === "neon" ? "Use light theme" : "Use neon dark theme"} title={theme === "neon" ? "Light theme" : "Neon dark theme"}>{theme === "neon" ? <Sun size={17} /> : <Moon size={17} />}</button>
          {authConfigured && user && <button className="profile-button account-button" onClick={() => setAccountOpen(true)} aria-label="Open account" title={user.email ?? "Account"}>{user.user_metadata?.avatar_url ? <Image unoptimized width={36} height={36} src={user.user_metadata.avatar_url as string} alt="" referrerPolicy="no-referrer" /> : <UserRound size={18} />}</button>}
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
            <div className="quote-block"><strong>{verifiedLivePrice ? verifiedLivePrice.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—"}</strong><span className={selectedChange >= 0 ? "positive" : "negative"}>{selectedQuoteIsFresh ? `${selectedNetChange >= 0 ? "+" : ""}${selectedNetChange.toFixed(2)} (${selectedChange >= 0 ? "+" : ""}${selectedChange.toFixed(2)}%)` : "Waiting for Upstox"}</span></div>
            <div className="ohlc-strip"><span>O <b>{selectedQuoteIsFresh ? selectedQuote?.open?.toFixed(2) ?? "—" : "—"}</b></span><span>H <b>{selectedQuoteIsFresh ? selectedQuote?.high?.toFixed(2) ?? "—" : "—"}</b></span><span>L <b>{selectedQuoteIsFresh ? selectedQuote?.low?.toFixed(2) ?? "—" : "—"}</b></span><span>C <b>{selectedQuoteIsFresh ? selectedQuote?.previousClose?.toFixed(2) ?? "—" : "—"}</b></span></div>
            <div className="header-order-buttons"><button className="compact-sell" onClick={() => openOrderSheet("SELL")}>Sell <b>{verifiedLivePrice?.toFixed(2) ?? "—"}</b></button><button className="compact-buy" onClick={() => openOrderSheet("BUY")}>Buy <b>{verifiedLivePrice?.toFixed(2) ?? "—"}</b></button></div>
          </div>

          <div className="chart-controls">
            <div className="period-tabs">{periods.map((period) => <button key={period} className={timeframe === period ? "active" : ""} onClick={() => setTimeframe(period)}>{period}</button>)}</div>
            <span className="control-divider" />
            <button className={`control-button mobile-indicator-control ${showChartFunctions ? "active" : ""}`} onClick={() => setShowChartFunctions(true)}><Activity size={16} /> Functions <span className="pill-count">{activeIndicatorCount}</span></button>
            <div className="chart-right-controls">
              <button className="control-button" onClick={() => setShowApi(true)}><Cable size={16} /> Data source</button>
            </div>
          </div>

          <div className="chart-body">
            <div className="drawing-toolbar" aria-label="Drawing tools">
              {drawingTools.map(({ id, label, icon: Icon }) => <button key={id} className={activeTool === id ? "active" : ""} onClick={() => { setActiveTool(id); setToolSignal((value) => value + 1); }} aria-label={label} title={label}><Icon size={18} /></button>)}
              <button className="all-drawing-tools" onClick={() => setShowDrawingLibrary(true)} aria-label="All 67 drawing tools" title="All 67 drawing tools"><Layers3 size={18} /><small>67</small></button>
              <span />
              <button className={magnet ? "active" : ""} onClick={() => setMagnet((value) => !value)} aria-label="Magnet" title="Magnet"><Magnet size={18} /></button>
              <button onClick={() => setUndoSignal((value) => value + 1)} aria-label="Undo drawing" title="Undo drawing"><Undo2 size={18} /></button>
              <button onClick={() => setRedoSignal((value) => value + 1)} aria-label="Redo drawing" title="Redo drawing"><Redo2 size={18} /></button>
              <button className={drawingsLocked ? "active" : ""} onClick={() => setDrawingsLocked((value) => !value)} aria-label={drawingsLocked ? "Unlock drawings" : "Lock drawings"} title={drawingsLocked ? "Unlock drawings" : "Lock drawings"}>{drawingsLocked ? <Lock size={18} /> : <LockOpen size={18} />}</button>
              <button className={hiddenDrawings ? "active" : ""} onClick={() => setHiddenDrawings((value) => !value)} aria-label="Hide drawings" title="Hide drawings">{hiddenDrawings ? <EyeOff size={18} /> : <Eye size={18} />}</button>
              <button className="danger-tool" onClick={() => setClearSignal((value) => value + 1)} aria-label="Delete drawings" title="Delete drawings"><Trash2 size={18} /></button>
            </div>
            {showDrawingLibrary && <DrawingToolLibrary activeTool={activeTool} onSelect={(tool) => { setActiveTool(tool); setToolSignal((value) => value + 1); }} onClose={() => setShowDrawingLibrary(false)} />}
            {showChartFunctions && <ChartFunctionMenu indicators={indicators} onToggleIndicator={toggleIndicator} onAction={(type: ChartAction) => setChartAction((current) => ({ type, token: (current?.token ?? 0) + 1 }))} onClose={() => setShowChartFunctions(false)} />}
            <MarketChart
              key={`${selected.symbol}-${timeframe}`}
              instrument={selected}
              timeframe={timeframe}
              activeTool={activeTool}
              toolSignal={toolSignal}
              magnet={magnet}
              hiddenDrawings={hiddenDrawings}
              lockedDrawings={drawingsLocked}
              clearSignal={clearSignal}
              undoSignal={undoSignal}
              redoSignal={redoSignal}
              indicators={indicators}
              chartAction={chartAction}
              chartTheme={theme}
              orderTool={{ enabled: riskToolEnabled, side: riskToolSide, entryPrice: riskEntryPrice, targetPrice: chartTargetPrice, stopLossPrice: chartStopLossPrice, quantity }}
              onOrderToolChange={updateChartRiskLevel}
              onOrderToolClose={() => setRiskToolEnabled(false)}
              onFeedStatus={handleFeedStatus}
            />
          </div>
          <div className={`chart-statusbar feed-${feedStatus.mode}`} title={feedStatus.message}>
            <div><Radio size={14} /> {feedStatus.message}</div>
            <div>Click + drag to pan · Scroll/pinch to zoom</div>
            <div>{clock ? `India · ${clock.toLocaleDateString("en-IN")} · ${clock.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })} IST` : "India · IST"}</div>
          </div>
          <div className="chart-trade-footer">
            <div className="chart-trade-buttons">
              <button className="sell" onClick={() => openOrderSheet("SELL")}><span>Sell</span><b>{verifiedLivePrice?.toFixed(2) ?? "—"}</b></button>
              <button className="buy" onClick={() => openOrderSheet("BUY")}><span>Buy</span><b>{verifiedLivePrice?.toFixed(2) ?? "—"}</b></button>
            </div>
            <button className="chart-positions-trigger" onClick={() => setPositionsOpen(true)}>
              <span>Stocks <ChevronDown size={14} /></span>
              <b className={totalOpenPnl >= 0 ? "positive" : "negative"}>{totalOpenPnl >= 0 ? "+" : ""}{formatInr(totalOpenPnl)}</b>
            </button>
          </div>
        </section>

        {orderSheetOpen && <button className="order-sheet-backdrop" aria-label="Close paper order" onClick={() => setOrderSheetOpen(false)} />}
        <aside className={`order-ticket ${orderSheetOpen ? "mobile-open" : ""}`}>
          <button className="mobile-order-close icon-button" onClick={() => setOrderSheetOpen(false)} aria-label="Close paper order"><X size={20} /></button>
          <div className="ticket-heading"><div><span className="eyebrow">Paper order</span><h2>{selected.symbol}</h2></div><span className="paper-badge">No real money</span></div>
          <div className="side-switch"><button className={side === "BUY" ? "buy-active" : ""} onClick={() => activateRiskTool("BUY")}>Buy</button><button className={side === "SELL" ? "sell-active" : ""} onClick={() => activateRiskTool("SELL")}>Sell</button></div>
          <div className="order-type-tabs">{["Market", "Limit", "SL"].map((type) => <button key={type} className={orderType === type ? "active" : ""} onClick={() => setOrderType(type)}>{type}</button>)}</div>
          <div className="input-grid">
            <label>Quantity<div className="stepper"><button onClick={() => setQuantityInput(String(Math.max(1, quantity - 1)))}><Minus size={15} /></button><input type="text" inputMode="numeric" value={quantityInput} onFocus={(event) => event.currentTarget.select()} onChange={(event) => setQuantityInput(event.target.value.replace(/\D/g, ""))} onBlur={() => setQuantityInput(String(quantity))} aria-label="Order quantity" /><button onClick={() => setQuantityInput(String(quantity + 1))}><Plus size={15} /></button></div></label>
            {orderType !== "Market" && <label>Price (₹)<input className="text-input" type="number" value={verifiedLivePrice?.toFixed(2) ?? ""} readOnly /></label>}
          </div>
          <div className="protection-grid">
            <label>Target (₹)<input type="number" min="0.01" step="0.05" value={targetPrice} onFocus={() => setRiskToolEnabled(true)} onChange={(event) => { setTargetPrice(event.target.value); setRiskToolEnabled(true); }} placeholder={verifiedLivePrice ? (side === "BUY" ? `Above ${verifiedLivePrice.toFixed(2)}` : `Below ${verifiedLivePrice.toFixed(2)}`) : "Waiting for live price"} /></label>
            <label>Stop loss (₹)<input type="number" min="0.01" step="0.05" value={stopLossPrice} onFocus={() => setRiskToolEnabled(true)} onChange={(event) => { setStopLossPrice(event.target.value); setRiskToolEnabled(true); }} placeholder={verifiedLivePrice ? (side === "BUY" ? `Below ${verifiedLivePrice.toFixed(2)}` : `Above ${verifiedLivePrice.toFixed(2)}`) : "Waiting for live price"} /></label>
            {selectedPosition.quantity > 0 && <button type="button" onClick={applyProtectionToOpenPosition}>Apply to open position</button>}
          </div>
          <div className="product-select"><label className={!intradayOrdersAllowed ? "disabled-product" : ""}><input type="radio" name="product" checked={product === "INTRADAY"} disabled={!intradayOrdersAllowed} onChange={() => setProduct("INTRADAY")} /><span><b>Intraday</b><small>{intradayOrdersAllowed ? "MIS · 5x leverage" : "Closed · auto square-off 15:00 IST"}</small></span></label><label><input type="radio" name="product" checked={product === "DELIVERY"} onChange={() => setProduct("DELIVERY")} /><span><b>Delivery</b><small>CNC · no leverage</small></span></label></div>
          <div className="margin-card"><div><span>Order value</span><b>{formatInr(orderValue)}</b></div><div><span>Est. margin</span><b>{formatInr(margin)}</b></div><div><span>Est. taxes &amp; charges</span><b>{formatInr(estimatedOrderCharges.total)}</b></div><div><span>Available cash</span><b>{formatInr(balance)}</b></div></div>
          {selectedPosition.quantity > 0 && (
            <div className="ticket-live-position">
              <div><span>{selectedPosition.side} · {selectedPosition.quantity} shares</span><b className={selectedPosition.unrealizedPnl >= 0 ? "positive" : "negative"}>{selectedPosition.unrealizedPnl >= 0 ? "+" : ""}{formatInr(selectedPosition.unrealizedPnl)}</b></div>
              <small>Avg {formatInr(selectedPosition.averagePrice)} · Live {verifiedLivePrice ? formatInr(verifiedLivePrice) : "paused"} · {selectedPosition.returnPercent >= 0 ? "+" : ""}{selectedPosition.returnPercent.toFixed(2)}%</small>
              {selectedProtection && (
                <div className="active-protection">
                  <span>Active exits</span>
                  <b>{selectedProtection.targetPrice ? `Target ${formatInr(selectedProtection.targetPrice)}` : "No target"}</b>
                  <b>{selectedProtection.stopLossPrice ? `SL ${formatInr(selectedProtection.stopLossPrice)}` : "No SL"}</b>
                  <button type="button" onClick={() => saveProtection(null, selected.symbol, positionProduct)}>Remove</button>
                </div>
              )}
              <div className="ticket-exit-controls">
                <label>Exit qty<input type="text" inputMode="numeric" value={exitQuantity} onFocus={() => setExitQuantity("")} onChange={(event) => setExitQuantity(event.target.value.replace(/\D/g, ""))} onBlur={() => setExitQuantity(String(safeExitQuantity))} /></label>
                <button disabled={positionProduct === "INTRADAY" && !intradayOrdersAllowed} onClick={() => exitPosition(safeExitQuantity)}>Exit {safeExitQuantity}</button>
                <button disabled={positionProduct === "INTRADAY" && !intradayOrdersAllowed} onClick={() => exitPosition(selectedPosition.quantity)}>Exit all</button>
              </div>
              {positionProduct === "INTRADAY" && !intradayOrdersAllowed && <small className="market-closed-note">{intradayStatusMessage}</small>}
            </div>
          )}
          <button disabled={!verifiedLivePrice || (product === "INTRADAY" && !intradayOrdersAllowed)} className={`place-order ${side.toLowerCase()}`} onClick={placeOrder}>{!verifiedLivePrice ? "WAITING FOR UPSTOX" : product === "INTRADAY" && !intradayOrdersAllowed ? "INTRADAY CLOSED" : `${side} ${quantity} ${selected.symbol}`}<ChevronRight size={18} /></button>
          <p className="disclaimer"><Bot size={15} /> Simulation only. Orders are saved on this device and never reach an exchange.</p>
          <div className="recent-orders-mini">
            <div className="section-line"><b>Recent orders</b><button onClick={() => setOrdersOpen(true)}>View all</button></div>
            {todayOrders.slice(0, 3).map((order) => <div className="mini-order" key={order.id}><span className={order.side === "BUY" ? "buy-tag" : "sell-tag"}>{order.side}</span><button className="mini-order-symbol" onClick={() => openPositionChart(order.symbol)}><b>{order.symbol}</b><small>{order.quantity} × {order.price.toFixed(2)}</small></button><small>{order.time}</small></div>)}
            {!todayOrders.length && <div className="no-orders">Today&apos;s simulated trades will appear here.</div>}
          </div>
        </aside>
      </div>

      <nav className="mobile-bottom-nav">
        <button className={activeNavigationSection === "trade" ? "active" : ""} onClick={() => openNavigationSection("trade")}><LineChart size={19} /><span>Trade</span></button>
        <button className={activeNavigationSection === "watchlist" ? "active" : ""} onClick={() => openNavigationSection("watchlist")}><Layers3 size={19} /><span>Watchlist</span></button>
        <button className={activeNavigationSection === "positions" ? "active" : ""} onClick={() => openNavigationSection("positions")}><BriefcaseBusiness size={19} /><span>Positions</span></button>
        <button className={activeNavigationSection === "orders" ? "active" : ""} onClick={() => openNavigationSection("orders")}><WalletCards size={19} /><span>Orders</span></button>
        <button className={activeNavigationSection === "markets" ? "active" : ""} onClick={() => openNavigationSection("markets")}><TrendingUp size={19} /><span>Markets</span></button>
        <button className={activeNavigationSection === "pnl" ? "active" : ""} onClick={() => openNavigationSection("pnl")}><Activity size={19} /><span>P&amp;L</span></button>
      </nav>

      {showApi && <ApiSettings onClose={() => setShowApi(false)} />}
      {ordersOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setOrdersOpen(false)}>
          <section className="modal orders-modal" role="dialog" aria-modal="true" aria-label="Paper orders" onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-head"><div><span className="eyebrow">Local account</span><h2>Paper order book</h2></div><button className="icon-button" onClick={() => setOrdersOpen(false)}><X size={20} /></button></div>
            <div className="order-table">
              <div className="order-row table-head"><span>Time</span><span>Symbol</span><span>Side</span><span>Qty</span><span>Price</span><span>Charges</span><span>Status</span></div>
              {todayOrders.map((order) => <div className="order-row" key={order.id}><span>{order.time}</span><button className="order-symbol-link" onClick={() => openPositionChart(order.symbol)}>{order.symbol}</button><span className={order.side === "BUY" ? "positive" : "negative"}>{order.side}</span><span>{order.quantity}</span><span>{formatInr(order.price)}</span><span>{formatInr(getOrderCharges(order).total)}</span><span className="complete-tag">{order.exitReason === "TARGET" ? "Target hit" : order.exitReason === "STOP_LOSS" ? "SL hit" : order.autoSquareOff ? "Auto 3:00" : "Complete"}</span></div>)}
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
      {marketsOpen && (
        <section className="market-discovery-panel" aria-label="NSE volume breakout watchlist">
          <div className="market-discovery-head"><div><h2>Volume Stocker</h2></div><button className="icon-button" onClick={() => setMarketsOpen(false)} aria-label="Close markets"><X size={20} /></button></div>
          <div className="market-discovery-list">
            {volumeBreakoutRows.map((row) => {
              const item = stockUniverse.find((instrument) => instrument.symbol === row.symbol);
              if (!item) return null;
              return (
                <button key={row.symbol} className="trend-stock-row" onClick={() => { chooseTradeInstrument({ ...item, price: row.lastPrice }); setMarketsOpen(false); }}>
                  <span className="symbol-avatar">{row.symbol.slice(0, 2)}</span>
                  <span><b>{row.symbol}</b><small>{row.name} · NSE</small><small>Volume {formatCompactVolume(row.todayVolume)} · SMA20 {formatCompactVolume(row.sma20Volume)}</small></span>
                  <span><b>{formatInr(row.lastPrice)}</b><small className={row.changePercent >= 0 ? "positive" : "negative"}>{row.changePercent >= 0 ? "+" : ""}{row.changePercent.toFixed(2)}%</small><small>{row.volumeMultiple.toFixed(2)}× volume</small></span>
                </button>
              );
            })}
            {marketScannerLoading && !volumeBreakoutRows.length && <div className="positions-empty"><TrendingUp size={30} /><b>Scanning NSE cash stocks</b><span>Comparing live Upstox volume with 20 daily NSE sessions.</span></div>}
            {!marketScannerLoading && marketScannerError && <div className="positions-empty"><Cable size={30} /><b>Volume scanner unavailable</b><span>{marketScannerError}</span></div>}
            {!marketScannerLoading && !marketScannerError && !volumeBreakoutRows.length && <div className="positions-empty"><Activity size={30} /><b>No stocks pass the filter</b><span>No NSE cash stock currently has Daily Volume greater than 5 × SMA(Volume, 20).</span></div>}
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
            <div className="pnl-chart-card">
              <div><b>Recent trade results</b><small>Oldest to newest · net after charges</small></div>
              <div className="pnl-bars" aria-label="Recent completed trade profit and loss chart">
                {pnlChartTrades.map((trade) => {
                  const barHeight = `${Math.max(5, Math.abs(trade.netPnl) / pnlChartMaximum * 100)}%`;
                  const resultClass = trade.netPnl >= 0 ? "profit" : "loss";
                  return (
                    <div className={`pnl-bar-slot ${resultClass}`} key={trade.id} title={`${trade.symbol}: ${formatInr(trade.netPnl)}`}>
                      <div className="pnl-bar-half profit-half">{trade.netPnl >= 0 && <i style={{ height: barHeight }} />}</div>
                      <div className="pnl-bar-half loss-half">{trade.netPnl < 0 && <i style={{ height: barHeight }} />}</div>
                      <span className="pnl-bar-caption"><b>{trade.symbol}</b><small>{trade.netPnl >= 0 ? "+" : ""}{formatInr(trade.netPnl)}</small></span>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="pnl-trade-list">
              {closedTrades.map((trade) => {
                const menuOpen = pnlTradeMenuId === trade.id;
                return (
                  <div key={`${trade.id}-${trade.symbol}`} className={`pnl-trade-row ${menuOpen ? "selected" : ""}`} role="button" tabIndex={0} onClick={() => setPnlTradeMenuId(menuOpen ? null : trade.id)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") setPnlTradeMenuId(menuOpen ? null : trade.id); }}>
                    <span className={trade.netPnl >= 0 ? "win" : "loss"}>{trade.netPnl >= 0 ? "WIN" : "LOSS"}</span>
                    <span><b>{trade.symbol}</b><small>{trade.product} · {trade.quantity} shares · {trade.closedAt ? new Date(trade.closedAt).toLocaleDateString("en-IN") : "Legacy trade"}</small></span>
                    <span><b className={trade.netPnl >= 0 ? "positive" : "negative"}>{trade.netPnl >= 0 ? "+" : ""}{formatInr(trade.netPnl)}</b><small>Charges {formatInr(trade.charges)}</small></span>
                    {menuOpen && <div className="pnl-trade-actions"><small>Delete only if this record was caused by incorrect data.</small><button type="button" onClick={(event) => { event.stopPropagation(); deleteClosedTrade(trade); }}><Trash2 size={14} /> Delete trade</button></div>}
                  </div>
                );
              })}
              {!closedTrades.length && <div className="positions-empty"><Activity size={30} /><b>No completed trades yet</b><span>Close a paper position to build your P&amp;L history.</span></div>}
            </div>
            <p className="pnl-disclaimer">Charges are estimates using current Upstox equity rates; actual contract-note rounding can differ.</p>
          </section>
        </div>
      )}
      {fundsOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setFundsOpen(false)}>
          <section className="modal funds-modal" role="dialog" aria-modal="true" aria-label="Add virtual money" onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-head"><div><span className="eyebrow">Paper account</span><h2>Add virtual money</h2></div><button className="icon-button" onClick={() => setFundsOpen(false)} aria-label="Close virtual funds"><X size={20} /></button></div>
            <div className="virtual-balance-card"><span>Current virtual cash</span><b>{formatInr(balance)}</b><small>Maximum total balance: ₹10,00,00,000</small></div>
            <label className="funds-input-label">Amount to add (₹)<input type="number" min="1" max={Math.max(0, MAX_VIRTUAL_BALANCE - balance)} step="1000" value={fundsInput} onChange={(event) => setFundsInput(event.target.value)} /></label>
            <div className="funds-shortcuts">{[[100_000, "₹1L"], [1_000_000, "₹10L"], [10_000_000, "₹1Cr"], [100_000_000, "₹10Cr"]].map(([amount, label]) => <button key={label} onClick={() => setFundsInput(String(amount))}>{label}</button>)}</div>
            <button className="primary-button" disabled={balance >= MAX_VIRTUAL_BALANCE} onClick={addVirtualFunds}>{balance >= MAX_VIRTUAL_BALANCE ? "₹10 CRORE LIMIT REACHED" : "ADD VIRTUAL MONEY"}</button>
            <p className="field-help">Simulation only. This does not deposit real money or connect to your broker balance.</p>
          </section>
        </div>
      )}
      {accountOpen && user && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setAccountOpen(false)}>
          <section className="modal account-modal" role="dialog" aria-modal="true" aria-label="Your PaperTrade account" onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-head"><div><span className="eyebrow">Secure account</span><h2>Your profile</h2></div><button className="icon-button" onClick={() => setAccountOpen(false)} aria-label="Close account"><X size={20} /></button></div>
            <div className="account-profile">
              <span>{user.user_metadata?.avatar_url ? <Image unoptimized width={43} height={43} src={user.user_metadata.avatar_url as string} alt="" referrerPolicy="no-referrer" /> : <UserRound size={25} />}</span>
              <div><b>{(user.user_metadata?.full_name as string | undefined) ?? "Paper trader"}</b><small>{user.email}</small></div>
            </div>
            <div className={`account-sync sync-${syncStatus}`}>{syncStatus === "synced" ? <CheckCircle2 size={17} /> : <Cloud size={17} />}<span><b>{syncStatus === "synced" ? "Portfolio synced" : syncStatus === "saving" ? "Saving portfolio…" : syncStatus === "error" ? "Cloud setup required" : "Loading portfolio…"}</b><small>Virtual balance, orders, watchlists and preferences</small></span></div>
            <button className="signout-button" onClick={() => void signOut()}><LogOut size={17} /> Sign out</button>
          </section>
        </div>
      )}
      {toast && <div className="toast"><Target size={18} /> {toast}</div>}
    </main>
  );
}
