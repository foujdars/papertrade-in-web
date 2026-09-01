"use client";

import {
  Activity, Bot, BriefcaseBusiness, Cable, CandlestickChart, CheckCircle2, ChevronDown, ChevronRight, Cloud, Home,
  Download, Layers3, LineChart, LockKeyhole, Link2, Minus, Moon, MoreHorizontal, Plus, Radio, Rocket, ShieldCheck, SlidersHorizontal, Smartphone, Sun,
  LogOut, Mail, MessageCircle, Search, Send, Star, Target, Trash2, UserRound,
  TrendingUp, WalletCards, X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type PointerEvent as ReactPointerEvent } from "react";
import Image from "next/image";
import Link from "next/link";
import { App as CapacitorApp } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { MarketChart, type ChartAction, type ChartActionRequest, type ChartIndicators, type ChartTradeMarker, type DrawingTool, type FeedStatus } from "@/components/MarketChart";
import { DrawingToolLibrary } from "@/components/DrawingToolLibrary";
import { ChartDrawingToolbar } from "@/components/ChartDrawingToolbar";
import { ChartFunctionMenu } from "@/components/ChartFunctionMenu";
import { CHART_TIMEFRAMES, ChartTimeframeMenu, CompactSelectorButton, WatchlistSelector } from "@/components/CompactSelectors";
import { MarketsWorkspace, type ScannerGroup } from "@/components/MarketsWorkspace";
import { IpoAlertMonitor } from "@/components/IpoWorkspace";
import { NotificationCenter } from "@/components/NotificationCenter";
import { HomeWorkspace } from "@/components/HomeWorkspace";
import { OptionChainSheet } from "@/components/OptionChainSheet";
import { FnoChartWorkspace } from "@/components/FnoChartWorkspace";
import { FnoListsWorkspace } from "@/components/FnoListsWorkspace";
import { futureToInstrument, optionToInstrument, underlyingToInstrument, type FnoUnderlying } from "@/lib/fno";
import { defaultOptionSide, loadOptionChain, loadOptionExpiries, nearestAtmRow } from "@/lib/fno-client";
import { deriveNetChange, formatInr, formatSignedMarketMove, instruments, mergeInstrumentUniverse, type Candle, type Instrument } from "@/lib/market";
import { getNseMarketStatus } from "@/lib/market-hours";
import {
  calculatePosition,
  deletePaperTradeOrders,
  getDeliveryHoldingQuantity,
  getProtectionExecutionPrice,
  getProtectionTrigger,
  paperOrderCapitalValue,
  readPaperOrders,
  readPaperProtections,
  repairRatnaveerSimulationTrade,
  writePaperOrders,
  writePaperProtections,
  validateDeliverySell,
  type PaperOrder,
  type PaperProtection,
} from "@/lib/paper-trading";
import { buildClosedTrades, getOrderCharges, type ClosedPaperTrade } from "@/lib/trade-analytics";
import { calculateUpstoxTradingCharges } from "@/lib/trading-charges";
import type { NormalizedQuote } from "@/lib/upstox";
import { openUpstoxLiveFeed } from "@/lib/upstox-live-feed";
import { useAuth } from "@/components/AuthProvider";
import { BrandMark } from "@/components/BrandMark";
import { usePersistentChartIndicators } from "@/lib/chart-indicator-preferences";
import { getNativeTradeAlert } from "@/lib/native-alert";
import { addPaperTradeNotification } from "@/lib/notification-center";

const watchlistTabs = ["NIFTY 50", "BANK NIFTY", "NIFTY 500", "ALL NSE"] as const;
const periods: readonly string[] = CHART_TIMEFRAMES;
const subscribeToNativePlatform = () => () => {};
const getAndroidPlatformSnapshot = () => Capacitor.getPlatform() === "android";
const getServerAndroidPlatformSnapshot = () => false;
const CUSTOM_WATCHLIST_STORAGE_KEY = "papertrade-custom-watchlists";
const LAST_CHART_STORAGE_KEY = "papertrade-last-chart";
const LAST_CASH_CHART_STORAGE_KEY = "papertrade-last-cash-chart";
const UI_PREFERENCES_STORAGE_KEY = "papertrade-ui-preferences-v2";
const HOME_EXPERIENCE_VERSION = 1;
const RATNAVEER_REPAIR_STORAGE_KEY = "papertrade-repair-ratnaveer-demo-v1";
const MAX_VIRTUAL_BALANCE = 100_000_000;
const UPSTOX_AUTO_SQUARE_OFF_HOUR = 15;
const UPSTOX_AUTO_SQUARE_OFF_MINUTE = 0;
const UPSTOX_AUTO_SQUARE_OFF_MINUTES = UPSTOX_AUTO_SQUARE_OFF_HOUR * 60 + UPSTOX_AUTO_SQUARE_OFF_MINUTE;
const UPSTOX_AUTO_SQUARE_OFF_POLICY = "UPSTOX_15_00_2026_02";
const LIVE_INDEX_TICKERS = [
  { label: "NIFTY 50", symbol: "NIFTY", name: "Nifty 50", instrumentKey: "NSE_INDEX|Nifty 50" },
  { label: "BANK NIFTY", symbol: "BANKNIFTY", name: "Nifty Bank", instrumentKey: "NSE_INDEX|Nifty Bank" },
  { label: "SENSEX", symbol: "SENSEX", name: "BSE Sensex", instrumentKey: "BSE_INDEX|SENSEX" },
] as const;
const PNL_MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"] as const;
const PNL_WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
const DEFAULT_RISK_AMOUNT = 2_000;
const DEFAULT_REWARD_AMOUNT = 3_000;
const INDIA_DATE_FORMATTER = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" });
function prepareProtectionAlerts() {
  if (typeof window === "undefined") return;
  if (Capacitor.getPlatform() === "android") {
    void getNativeTradeAlert().requestPermission().catch(() => undefined);
    return;
  }
  if ("Notification" in window && Notification.permission === "default") {
    void Notification.requestPermission().catch(() => undefined);
  }
}

function showProtectionAlert(order: PaperOrder) {
  if (typeof window === "undefined") return;
  const reason = order.exitReason === "TARGET" ? "Target reached" : "Stop-loss reached";
  const body = `${order.symbol}: ${order.quantity} unit${order.quantity === 1 ? "" : "s"} exited at ${formatInr(order.price)}.`;
  addPaperTradeNotification({ id: `trade-${order.id}`, kind: "trade", title: reason, body });
  navigator.vibrate?.([180, 90, 180]);
  if (Capacitor.getPlatform() === "android") {
    void getNativeTradeAlert().show({ title: `PaperTrade IN - ${reason}`, body }).catch(() => undefined);
  } else if ("Notification" in window && Notification.permission === "granted") {
    new Notification(`PaperTrade IN - ${reason}`, { body, icon: "/papertrade-icon-192.png", tag: `papertrade-${order.id}` });
  }
}

function indiaDateParts(timestamp: number) {
  const parts = INDIA_DATE_FORMATTER.formatToParts(new Date(timestamp));
  const value = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  return { year: value("year"), month: value("month"), day: value("day") };
}

function calendarDateKey(year: number, monthIndex: number, day: number) {
  return `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function compactCalendarPnl(value: number) {
  const absolute = Math.abs(value);
  const amount = absolute >= 10_000_000 ? `${(absolute / 10_000_000).toFixed(1)}Cr`
    : absolute >= 100_000 ? `${(absolute / 100_000).toFixed(1)}L`
      : absolute >= 1_000 ? `${(absolute / 1_000).toFixed(1)}K`
        : absolute.toFixed(0);
  return `${value >= 0 ? "+" : "−"}₹${amount}`;
}

function defaultProtectionPrices(entryPrice: number, direction: "LONG" | "SHORT", quantity: number) {
  const safeQuantity = Math.max(1, quantity);
  const riskDistance = DEFAULT_RISK_AMOUNT / safeQuantity;
  const rewardDistance = DEFAULT_REWARD_AMOUNT / safeQuantity;
  const directionMultiplier = direction === "LONG" ? 1 : -1;
  return {
    target: Math.max(.05, entryPrice + directionMultiplier * rewardDistance),
    stopLoss: Math.max(.05, entryPrice - directionMultiplier * riskDistance),
  };
}

type CustomWatchlist = {
  id: string;
  name: string;
  symbols: string[];
};

type NavigationSection = "home" | "trade" | "fno" | "watchlist" | "holdings" | "orders" | "markets" | "ipo" | "pnl";
type HomeCardId = "market" | "recent" | "portfolio";
type HomeCardPreferences = Record<HomeCardId, boolean>;
const DEFAULT_HOME_CARDS: HomeCardPreferences = { market: true, recent: true, portfolio: true };

type ChartHistorySnapshot = {
  instrument: Instrument;
  timeframe: string;
};

type FnoWorkspaceSnapshot = {
  option: Instrument;
  spot: Instrument;
  underlying: FnoUnderlying | null;
  future: Instrument | null;
  topMode: "SPOT" | "FUTURE";
  timeframe: string;
};

function derivativeInstrumentFromOrder(order: PaperOrder): Instrument | null {
  if (!order.instrumentKey || (order.assetType !== "OPTION" && order.assetType !== "FUTURE")) return null;
  return {
    symbol: order.symbol,
    name: order.instrumentName || order.symbol,
    exchange: "NSE",
    price: order.price,
    change: 0,
    instrumentKey: order.instrumentKey,
    categories: [],
    assetType: order.assetType,
    optionType: order.optionType,
    strikePrice: order.strikePrice,
    expiry: order.expiry,
    lotSize: order.lotSize,
    underlyingKey: order.underlyingKey,
    underlyingSymbol: order.underlyingSymbol,
  };
}

function instrumentFromPaperOrder(order: PaperOrder, universe: Instrument[]): Instrument {
  return universe.find((item) => item.instrumentKey === order.instrumentKey || item.symbol === order.symbol) ?? {
    symbol: order.symbol,
    name: order.instrumentName || order.symbol,
    exchange: "NSE",
    price: order.price,
    change: 0,
    instrumentKey: order.instrumentKey || order.symbol,
    categories: [],
    assetType: order.assetType ?? "EQUITY",
    optionType: order.optionType,
    strikePrice: order.strikePrice,
    expiry: order.expiry,
    lotSize: order.lotSize,
    underlyingKey: order.underlyingKey,
    underlyingSymbol: order.underlyingSymbol,
  };
}

function calculateInstrumentCharges(instrument: Pick<Instrument, "assetType">, input: { side: "BUY" | "SELL"; product: "INTRADAY" | "DELIVERY"; quantity: number; price: number }) {
  return calculateUpstoxTradingCharges(instrument.assetType, input);
}

function getPaperOrderTimestamp(order: PaperOrder) {
  const idTimestamp = Number(order.id);
  return order.createdAt ?? (Number.isFinite(idTimestamp) && idTimestamp > 1_000_000_000_000 ? idTimestamp : 0);
}

function orderTradeMarker(order: PaperOrder, role: "ENTRY" | "EXIT"): ChartTradeMarker {
  return {
    id: `${order.id}-${role}`,
    time: getPaperOrderTimestamp(order),
    price: order.price,
    side: order.side,
    role,
    quantity: order.quantity,
  };
}

function paperOrderStatusLabel(order: PaperOrder) {
  if (order.exitReason === "TARGET") return "Target hit";
  if (order.exitReason === "STOP_LOSS") return "SL hit";
  if (order.autoSquareOff || order.exitReason === "AUTO_SQUARE_OFF") return "Auto 3:00";
  return "Complete";
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
function Brand({ onClick }: { onClick: () => void }) {
  return (
    <button className="brand" onClick={onClick} aria-label="Open PaperTrade home">
      <span className="brand-mark"><BrandMark size={34} /></span>
      <span>PaperTrade <b>IN</b></span>
    </button>
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
  const { configured: authConfigured, user, syncStatus, signOut, deleteAccount } = useAuth();
  const userPreferenceKey = `${UI_PREFERENCES_STORAGE_KEY}:${user?.id ?? "guest"}`;
  const [selected, setSelected] = useState<Instrument>(instruments[0]);
  const [stockUniverse, setStockUniverse] = useState<Instrument[]>(instruments);
  const [derivativeInstruments, setDerivativeInstruments] = useState<Instrument[]>([]);
  const [spotInstrument, setSpotInstrument] = useState<Instrument | null>(null);
  const [fnoUnderlying, setFnoUnderlying] = useState<FnoUnderlying | null>(null);
  const [fnoFutureInstrument, setFnoFutureInstrument] = useState<Instrument | null>(null);
  const [fnoTopMode, setFnoTopMode] = useState<"SPOT" | "FUTURE">("SPOT");
  const [fnoSwitchingOption, setFnoSwitchingOption] = useState(false);
  const [watchlistLoading, setWatchlistLoading] = useState(true);
  const [watchlistLimit, setWatchlistLimit] = useState(60);
  const [watchlist, setWatchlist] = useState<string>("NIFTY 50");
  const [customWatchlists, setCustomWatchlists] = useState<CustomWatchlist[]>([]);
  const [watchlistPickerOpen, setWatchlistPickerOpen] = useState(false);
  const [watchlistTarget, setWatchlistTarget] = useState<Instrument | null>(null);
  const [newWatchlistName, setNewWatchlistName] = useState("");
  const [search, setSearch] = useState("");
  const [timeframe, setTimeframe] = useState("5m");
  const [pnlReviewTimeframe, setPnlReviewTimeframe] = useState("5m");
  const [activeTool, setActiveTool] = useState<DrawingTool>("cursor");
  const [showDrawingLibrary, setShowDrawingLibrary] = useState(false);
  const [showChartFunctions, setShowChartFunctions] = useState(false);
  const [showTimeframeMenu, setShowTimeframeMenu] = useState(false);
  const [showPnlReviewTimeframeMenu, setShowPnlReviewTimeframeMenu] = useState(false);
  const [showWatchlistSelector, setShowWatchlistSelector] = useState(false);
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
  const isAndroidApp = useSyncExternalStore(subscribeToNativePlatform, getAndroidPlatformSnapshot, getServerAndroidPlatformSnapshot);
  const [quantityInput, setQuantityInput] = useState("1");
  const parsedQuantity = Number.parseInt(quantityInput, 10);
  const quantity = Number.isFinite(parsedQuantity) && parsedQuantity > 0 ? parsedQuantity : 1;
  const [targetPrice, setTargetPrice] = useState("");
  const [stopLossPrice, setStopLossPrice] = useState("");
  const [riskLevelsCustomized, setRiskLevelsCustomized] = useState(false);
  const [orderType, setOrderType] = useState("Market");
  const [product, setProduct] = useState<"INTRADAY" | "DELIVERY">("INTRADAY");
  const [indicators, setIndicators] = usePersistentChartIndicators(user?.id);
  const [exitQuantity, setExitQuantity] = useState("1");
  const [orders, setOrders] = useState<PaperOrder[]>([]);
  const [protections, setProtections] = useState<PaperProtection[]>([]);
  const [balance, setBalance] = useState(1000000);
  const [showApi, setShowApi] = useState(false);
  const [homeOpen, setHomeOpen] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [ordersOpen, setOrdersOpen] = useState(false);
  const [holdingsOpen, setHoldingsOpen] = useState(false);
  const [orderSheetOpen, setOrderSheetOpen] = useState(false);
  const [desktopOrderPanelOpen, setDesktopOrderPanelOpen] = useState(true);
  const [positionsOpen, setPositionsOpen] = useState(false);
  const [marketsOpen, setMarketsOpen] = useState(false);
  const [marketsInitialGroup, setMarketsInitialGroup] = useState<ScannerGroup>("TRADING");
  const [optionChainOpen, setOptionChainOpen] = useState(false);
  const [openingUnderlyingKey, setOpeningUnderlyingKey] = useState("");
  const [optionSplitPercent, setOptionSplitPercent] = useState(50);
  const [fnoTradeDockOpen, setFnoTradeDockOpen] = useState(false);
  const [workspaceMode, setWorkspaceMode] = useState<"trade" | "fno">("trade");
  const [fnoListOpen, setFnoListOpen] = useState(false);
  const [fnoListQuoteKeys, setFnoListQuoteKeys] = useState<string[]>([]);
  const [marketScannerQuoteKeys, setMarketScannerQuoteKeys] = useState<string[]>([]);
  const [tradeToolbarCollapsed, setTradeToolbarCollapsed] = useState(true);
  const [chartTradeFooterOpen, setChartTradeFooterOpen] = useState(false);
  const [pnlOpen, setPnlOpen] = useState(false);
  const [pnlTradeMenuId, setPnlTradeMenuId] = useState<string | null>(null);
  const [pnlCalendarMonth, setPnlCalendarMonth] = useState(() => indiaDateParts(Date.now()).month - 1);
  const [pnlCalendarYear, setPnlCalendarYear] = useState(() => indiaDateParts(Date.now()).year);
  const [selectedPnlDateKey, setSelectedPnlDateKey] = useState<string | null>(null);
  const [fundsOpen, setFundsOpen] = useState(false);
  const [downloadOpen, setDownloadOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [homeCards, setHomeCards] = useState<HomeCardPreferences>(DEFAULT_HOME_CARDS);
  const [recentStocks, setRecentStocks] = useState<string[]>([]);
  const [recentScanners, setRecentScanners] = useState<string[]>([]);
  const [uiPreferencesReady, setUiPreferencesReady] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [accountDeleteArmed, setAccountDeleteArmed] = useState(false);
  const [accountDeleteWorking, setAccountDeleteWorking] = useState(false);
  const [accountDeleteError, setAccountDeleteError] = useState("");
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
  const activeNavigationSection: NavigationSection = homeOpen
    ? "home"
    : sidebarOpen
    ? "watchlist"
    : holdingsOpen
      ? "holdings"
      : ordersOpen
        ? "orders"
        : marketsOpen
          ? marketsInitialGroup === "IPO" ? "ipo" : "markets"
          : pnlOpen
            ? "pnl"
            : workspaceMode;
  const tradeSymbolPickerRef = useRef<HTMLDivElement>(null);
  const desktopTradeSymbolPickerRef = useRef<HTMLDivElement>(null);
  const pnlTradeListRef = useRef<HTMLDivElement>(null);
  const pendingChartRestoreRef = useRef<{ symbol: string; timeframe: string } | null>({ symbol: "__PENDING__", timeframe: "5m" });
  const autoSquareOffInFlightRef = useRef(false);
  const autoSquareOffRetryAtRef = useRef(0);
  const autoSquareOffRepairInFlightRef = useRef(false);
  const lastFnoWorkspaceRef = useRef<FnoWorkspaceSnapshot | null>(null);
  const instrumentUniverseLoadRef = useRef({ loaded: false, lastRefreshAt: 0, lastForcedAt: 0 });
  const exitBackDeadlineRef = useRef(0);
  const exitBackToastTimerRef = useRef<number | null>(null);
  const activeNavigationSectionRef = useRef<NavigationSection>(activeNavigationSection);
  const returnToTradeFromBackRef = useRef<() => void>(() => undefined);

  const closeFnoWorkspace = useCallback(() => {
    let saved: { instrument?: Instrument; timeframe?: string; fnoUnderlying?: FnoUnderlying } = {};
    try { saved = JSON.parse(localStorage.getItem(LAST_CASH_CHART_STORAGE_KEY) ?? "{}"); } catch { /* Ignore malformed preference. */ }
    const fallback = saved.instrument?.instrumentKey && saved.instrument.assetType !== "OPTION" && saved.instrument.assetType !== "FUTURE"
      ? saved.instrument
      : instruments[0];
    const restoredTimeframe = saved.timeframe && periods.includes(saved.timeframe) ? saved.timeframe : "5m";
    setSelected(fallback);
    setTimeframe(restoredTimeframe);
    setSpotInstrument(null);
    const restoredUnderlying = saved.fnoUnderlying?.instrumentKey === fallback.instrumentKey ? saved.fnoUnderlying : null;
    const restoredFuture = restoredUnderlying?.futures?.[0];
    setFnoUnderlying(restoredUnderlying);
    setFnoFutureInstrument(restoredFuture ? futureToInstrument(restoredFuture, restoredUnderlying) : null);
    setFnoTopMode("SPOT");
    setWorkspaceMode("trade");
    setFnoListOpen(false);
    setFnoTradeDockOpen(false);
    setOptionChainOpen(false);
    setOrderSheetOpen(false);
    const url = new URL(window.location.href);
    url.searchParams.set("symbol", fallback.symbol);
    url.searchParams.set("timeframe", restoredTimeframe);
    window.history.replaceState({}, "", url);
  }, []);

  const returnToTradeFromBack = useCallback(() => {
    setHomeOpen(false);
    setSidebarOpen(false);
    setPositionsOpen(false);
    setHoldingsOpen(false);
    setOrdersOpen(false);
    setMarketsOpen(false);
    setPnlOpen(false);
    setFnoListOpen(false);
    setOptionChainOpen(false);
    setOrderSheetOpen(false);
    setFnoTradeDockOpen(false);
    if (selected.assetType === "OPTION" && spotInstrument) closeFnoWorkspace();
    else setWorkspaceMode("trade");
  }, [closeFnoWorkspace, selected.assetType, spotInstrument]);

  useEffect(() => {
    activeNavigationSectionRef.current = activeNavigationSection;
    returnToTradeFromBackRef.current = returnToTradeFromBack;
  }, [activeNavigationSection, returnToTradeFromBack]);

  useEffect(() => {
    if (selected.assetType !== "OPTION" || !spotInstrument) return;
    lastFnoWorkspaceRef.current = { option: selected, spot: spotInstrument, underlying: fnoUnderlying, future: fnoFutureInstrument, topMode: fnoTopMode, timeframe };
  }, [fnoFutureInstrument, fnoTopMode, fnoUnderlying, selected, spotInstrument, timeframe]);

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
        setDerivativeInstruments([...new Map(restoredOrders.flatMap((order) => {
          const instrument = derivativeInstrumentFromOrder(order);
          return instrument ? [[instrument.instrumentKey, instrument] as const] : [];
        })).values()]);
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
    setUiPreferencesReady(false);
    const restore = window.setTimeout(() => {
      try {
        const saved = JSON.parse(localStorage.getItem(userPreferenceKey) ?? "{}") as {
          activeSection?: NavigationSection;
          watchlist?: string;
          timeframe?: string;
          marketGroup?: ScannerGroup;
          homeCards?: Partial<HomeCardPreferences>;
          recentStocks?: string[];
          recentScanners?: string[];
          homeExperienceVersion?: number;
        };
        if (saved.watchlist) setWatchlist(saved.watchlist);
        if (saved.timeframe && periods.includes(saved.timeframe)) setTimeframe(saved.timeframe);
        if (saved.marketGroup === "TRADING" || saved.marketGroup === "INVESTMENT" || saved.marketGroup === "IPO") setMarketsInitialGroup(saved.marketGroup);
        setHomeCards({ ...DEFAULT_HOME_CARDS, ...(saved.homeCards ?? {}) });
        setRecentStocks(Array.isArray(saved.recentStocks) ? saved.recentStocks.slice(0, 6) : []);
        setRecentScanners(Array.isArray(saved.recentScanners) ? saved.recentScanners.slice(0, 4) : []);
        const validSections: NavigationSection[] = ["home", "trade", "fno", "watchlist", "holdings", "orders", "markets", "ipo", "pnl"];
        const section = saved.homeExperienceVersion === HOME_EXPERIENCE_VERSION && saved.activeSection && validSections.includes(saved.activeSection) ? saved.activeSection : "home";
        setHomeOpen(section === "home");
        setSidebarOpen(section === "watchlist");
        setHoldingsOpen(section === "holdings");
        setOrdersOpen(section === "orders");
        setMarketsOpen(section === "markets" || section === "ipo");
        if (section === "ipo") setMarketsInitialGroup("IPO");
        setPnlOpen(section === "pnl");
        setWorkspaceMode(section === "fno" ? "fno" : "trade");
        setFnoListOpen(section === "fno");
      } catch { /* Ignore malformed per-user interface preferences. */ }
      setUiPreferencesReady(true);
    }, 0);
    return () => window.clearTimeout(restore);
  }, [userPreferenceKey]);

  useEffect(() => {
    if (!uiPreferencesReady) return;
    localStorage.setItem(userPreferenceKey, JSON.stringify({
      activeSection: activeNavigationSection,
      watchlist,
      timeframe,
      marketGroup: marketsInitialGroup,
      homeCards,
      recentStocks,
      recentScanners,
      homeExperienceVersion: HOME_EXPERIENCE_VERSION,
    }));
  }, [activeNavigationSection, homeCards, marketsInitialGroup, recentScanners, recentStocks, timeframe, uiPreferencesReady, userPreferenceKey, watchlist]);

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
      let savedChart: { symbol?: string; timeframe?: string; instrument?: Instrument; spotInstrument?: Instrument; fnoUnderlying?: FnoUnderlying; workspaceMode?: "trade" | "fno"; fnoTopMode?: "SPOT" | "FUTURE" } = {};
      try {
        const parsed = JSON.parse(localStorage.getItem(LAST_CHART_STORAGE_KEY) ?? "{}") as unknown;
        if (parsed && typeof parsed === "object") savedChart = parsed as typeof savedChart;
      } catch {
        localStorage.removeItem(LAST_CHART_STORAGE_KEY);
      }
      const querySymbol = params.get("symbol") ?? params.get("sym");
      const normalizedQuerySymbol = typeof querySymbol === "string" && /^[A-Z0-9&.-]{1,40}$/i.test(querySymbol.trim())
        ? querySymbol.trim().toUpperCase()
        : undefined;
      const savedSymbol = typeof savedChart.symbol === "string" ? savedChart.symbol.toUpperCase() : undefined;
      const queryTimeframe = params.get("timeframe");
      const requestedSymbol = normalizedQuerySymbol ?? savedSymbol;
      const requestedTimeframe = periods.includes(queryTimeframe ?? "")
        ? queryTimeframe!
        : typeof savedChart.timeframe === "string" && periods.includes(savedChart.timeframe) ? savedChart.timeframe : undefined;

      // Convert old ?sym= links to the supported URL and remove malformed
      // startup parameters without reloading the page.
      if (params.has("sym") || (params.has("symbol") && !normalizedQuerySymbol)) {
        const cleanUrl = new URL(window.location.href);
        cleanUrl.searchParams.delete("sym");
        if (normalizedQuerySymbol) cleanUrl.searchParams.set("symbol", normalizedQuerySymbol);
        else cleanUrl.searchParams.delete("symbol");
        window.history.replaceState(window.history.state, "", cleanUrl);
      }
      pendingChartRestoreRef.current = requestedSymbol
        ? { symbol: requestedSymbol, timeframe: periods.includes(requestedTimeframe ?? "") ? requestedTimeframe! : "5m" }
        : null;
      if (requestedTimeframe && periods.includes(requestedTimeframe)) {
        setTimeframe(requestedTimeframe);
      }
      if (savedChart.instrument?.instrumentKey && savedChart.instrument.assetType === "OPTION") {
        setSelected(savedChart.instrument);
        setWorkspaceMode(savedChart.workspaceMode === "trade" ? "trade" : "fno");
        setDerivativeInstruments((current) => current.some((item) => item.instrumentKey === savedChart.instrument!.instrumentKey) ? current : [savedChart.instrument!, ...current]);
        setSpotInstrument(savedChart.spotInstrument?.instrumentKey ? savedChart.spotInstrument : null);
      } else if (savedChart.instrument?.instrumentKey) {
        setSelected(savedChart.instrument);
        setWorkspaceMode("trade");
        setSpotInstrument(null);
      }
      if (savedChart.fnoUnderlying?.instrumentKey) {
        setFnoUnderlying(savedChart.fnoUnderlying);
        const savedFuture = savedChart.fnoUnderlying.futures?.[0];
        setFnoFutureInstrument(savedFuture ? futureToInstrument(savedFuture, savedChart.fnoUnderlying) : null);
      }
      if (savedChart.fnoTopMode) setFnoTopMode(savedChart.fnoTopMode);
      const savedInstrumentSymbol = typeof savedChart.instrument?.symbol === "string" ? savedChart.instrument.symbol.toUpperCase() : "";
      if (requestedSymbol && savedInstrumentSymbol !== requestedSymbol) {
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
    localStorage.setItem(LAST_CHART_STORAGE_KEY, JSON.stringify({ symbol: selected.symbol, timeframe, instrument: selected, spotInstrument, fnoUnderlying, workspaceMode, fnoTopMode }));
  }, [fnoTopMode, fnoUnderlying, selected, spotInstrument, timeframe, workspaceMode]);

  useEffect(() => {
    if (selected.assetType === "OPTION" || selected.assetType === "FUTURE") return;
    const selectedUnderlying = fnoUnderlying?.instrumentKey === selected.instrumentKey ? fnoUnderlying : undefined;
    localStorage.setItem(LAST_CASH_CHART_STORAGE_KEY, JSON.stringify({ instrument: selected, timeframe, fnoUnderlying: selectedUnderlying }));
  }, [fnoUnderlying, selected, timeframe]);

  useEffect(() => {
    if (workspaceMode !== "fno") return;
    const handleHistoryBack = () => closeFnoWorkspace();
    window.addEventListener("popstate", handleHistoryBack);
    return () => {
      window.removeEventListener("popstate", handleHistoryBack);
    };
  }, [closeFnoWorkspace, workspaceMode]);

  useEffect(() => {
    if (!isAndroidApp) return;
    let nativeListener: { remove: () => Promise<void> } | undefined;
    let disposed = false;

    void CapacitorApp.addListener("backButton", () => {
      if (activeNavigationSectionRef.current !== "trade") {
        exitBackDeadlineRef.current = 0;
        if (exitBackToastTimerRef.current !== null) window.clearTimeout(exitBackToastTimerRef.current);
        returnToTradeFromBackRef.current();
        setToast("Returned to Trade");
        exitBackToastTimerRef.current = window.setTimeout(() => setToast(""), 1_800);
        return;
      }

      const now = Date.now();
      if (now <= exitBackDeadlineRef.current) {
        exitBackDeadlineRef.current = 0;
        void CapacitorApp.exitApp();
        return;
      }

      exitBackDeadlineRef.current = now + 2_500;
      setToast("Press back again to close PaperTrade IN");
      if (exitBackToastTimerRef.current !== null) window.clearTimeout(exitBackToastTimerRef.current);
      exitBackToastTimerRef.current = window.setTimeout(() => {
        exitBackDeadlineRef.current = 0;
        setToast("");
      }, 2_500);
    }).then((listener) => {
      if (disposed) void listener.remove();
      else nativeListener = listener;
    });

    return () => {
      disposed = true;
      if (nativeListener) void nativeListener.remove();
    };
  }, [isAndroidApp]);

  useEffect(() => () => {
    if (exitBackToastTimerRef.current !== null) window.clearTimeout(exitBackToastTimerRef.current);
  }, []);

  useEffect(() => {
    if (workspaceMode === "fno") return;
    const restorePreviousChart = (event: PopStateEvent) => {
      const snapshot = event.state?.papertradeChart as ChartHistorySnapshot | undefined;
      if (!snapshot?.instrument?.instrumentKey) return;
      setSelected(snapshot.instrument);
      setTimeframe(periods.includes(snapshot.timeframe) ? snapshot.timeframe : "5m");
      setWorkspaceMode("trade");
      setSpotInstrument(null);
      setFnoUnderlying(null);
      setFnoFutureInstrument(null);
      setFnoTopMode("SPOT");
      setOptionChainOpen(false);
      setFnoTradeDockOpen(false);
      setChartTradeFooterOpen(false);
      setSidebarOpen(false);
    };
    window.addEventListener("popstate", restorePreviousChart);
    return () => window.removeEventListener("popstate", restorePreviousChart);
  }, [workspaceMode]);

  useEffect(() => {
    if (workspaceMode !== "trade" || selected.assetType === "OPTION" || selected.assetType === "FUTURE") return;
    const currentState = window.history.state ?? {};
    const url = new URL(window.location.href);
    url.searchParams.set("symbol", selected.symbol);
    url.searchParams.set("timeframe", timeframe);
    window.history.replaceState({ ...currentState, papertradeChart: { instrument: selected, timeframe } }, "", url);
  }, [selected, timeframe, workspaceMode]);

  useEffect(() => {
    if (!showTradeSymbols) return;
    const closeSymbolSearch = (event: PointerEvent) => {
      if (!tradeSymbolPickerRef.current?.contains(event.target as Node) && !desktopTradeSymbolPickerRef.current?.contains(event.target as Node)) {
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

  const loadInstrumentUniverse = useCallback(async ({ force = false, signal }: { force?: boolean; signal?: AbortSignal } = {}) => {
    try {
      const endpoint = force ? "/api/upstox/instruments?refresh=1" : "/api/upstox/instruments";
      const response = await fetch(endpoint, { cache: "no-store", signal });
      const payload = await response.json() as { ok?: boolean; instruments?: Instrument[] };
      if (!response.ok || !payload.ok || !payload.instruments?.length) return;
      const merged = mergeInstrumentUniverse(payload.instruments);
      const isInitialLoad = !instrumentUniverseLoadRef.current.loaded;
      let requestedSymbol = "";
      if (isInitialLoad) {
        try {
          const parsed = JSON.parse(localStorage.getItem(LAST_CHART_STORAGE_KEY) ?? "{}") as { symbol?: unknown };
          requestedSymbol = typeof parsed.symbol === "string" ? parsed.symbol.toUpperCase() : "";
        } catch { /* Ignore malformed preference. */ }
        const searchParams = new URLSearchParams(window.location.search);
        const querySymbol = searchParams.get("symbol") ?? searchParams.get("sym");
        if (querySymbol && /^[A-Z0-9&.-]{1,40}$/i.test(querySymbol.trim())) requestedSymbol = querySymbol.trim().toUpperCase();
      }
      instrumentUniverseLoadRef.current.loaded = true;
      instrumentUniverseLoadRef.current.lastRefreshAt = Date.now();
      setStockUniverse(merged);
      setSelected((current) => merged.find((item) => item.symbol === (requestedSymbol || current.symbol)) ?? current);
    } catch {
      // Keep the built-in liquid-stock list available while the current master is unavailable.
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const refreshIfStale = () => {
      if (document.visibilityState === "hidden") return;
      if (Date.now() - instrumentUniverseLoadRef.current.lastRefreshAt < 30 * 60 * 1_000) return;
      void loadInstrumentUniverse({ signal: controller.signal });
    };
    void loadInstrumentUniverse({ signal: controller.signal }).finally(() => {
      if (!controller.signal.aborted) setWatchlistLoading(false);
    });
    document.addEventListener("visibilitychange", refreshIfStale);
    window.addEventListener("online", refreshIfStale);
    return () => {
      controller.abort();
      document.removeEventListener("visibilitychange", refreshIfStale);
      window.removeEventListener("online", refreshIfStale);
    };
  }, [loadInstrumentUniverse]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const customList = customWatchlists.find((list) => `custom:${list.id}` === watchlist);
    const standardList = watchlistTabs.find((tab) => tab === watchlist);
    const universe = customList
      ? [...new Map([...stockUniverse, ...derivativeInstruments].map((item) => [item.instrumentKey, item])).values()]
      : stockUniverse;
    return universe.filter((item) => {
      const matchesList = Boolean(term)
        || customList?.symbols.includes(item.symbol)
        || standardList === "ALL NSE"
        || (standardList !== undefined && item.categories.includes(standardList));
      return matchesList && (!term || item.symbol.toLowerCase().includes(term) || item.name.toLowerCase().includes(term));
    });
  }, [customWatchlists, derivativeInstruments, search, stockUniverse, watchlist]);
  useEffect(() => {
    const term = search.trim();
    if (term.length < 2 || filtered.length || watchlistLoading) return;
    if (Date.now() - instrumentUniverseLoadRef.current.lastForcedAt < 10 * 60 * 1_000) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      instrumentUniverseLoadRef.current.lastForcedAt = Date.now();
      void loadInstrumentUniverse({ force: true, signal: controller.signal });
    }, 650);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [filtered.length, loadInstrumentUniverse, search, watchlistLoading]);
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
  const tradingUniverse = useMemo(() => {
    const byKey = new Map<string, Instrument>();
    for (const item of [...stockUniverse, ...derivativeInstruments]) byKey.set(item.instrumentKey, item);
    return [...byKey.values()];
  }, [derivativeInstruments, stockUniverse]);
  const applyRealtimeQuote = useCallback((instrument: Instrument, price: number, timestampMs = Date.now()) => {
    if (!Number.isFinite(price) || price <= 0) return;
    const receivedAt = Date.now();
    const updatedAt = new Date(timestampMs).toISOString();
    setMarketQuotes((current) => {
      const previous = current[instrument.instrumentKey] ?? current[instrument.symbol];
      const changeDivisor = 1 + instrument.change / 100;
      const fallbackPreviousClose = instrument.price > 0 && Number.isFinite(instrument.change) && changeDivisor > 0
        ? instrument.price / changeDivisor
        : price;
      const previousClose = previous?.previousClose > 0 ? previous.previousClose : fallbackPreviousClose;
      const next: NormalizedQuote = {
        instrumentKey: instrument.instrumentKey,
        symbol: instrument.symbol,
        lastPrice: price,
        netChange: price - previousClose,
        changePercent: previousClose > 0 ? ((price - previousClose) / previousClose) * 100 : 0,
        open: previous?.open ?? price,
        high: Math.max(previous?.high ?? price, price),
        low: Math.min(previous?.low ?? price, price),
        previousClose,
        lastTradeAt: updatedAt,
        updatedAt,
      };
      return { ...current, [instrument.instrumentKey]: next, [instrument.symbol]: next };
    });
    setMarketQuoteUpdatedAt((current) => ({
      ...current,
      [instrument.instrumentKey]: receivedAt,
      [instrument.symbol]: receivedAt,
    }));
  }, []);
  const handleChartPrice = useCallback((price: number) => {
    applyRealtimeQuote(selected, price);
  }, [applyRealtimeQuote, selected]);
  const protectionFeedInstruments = useMemo(() => [...new Map(protections.flatMap((protection) => {
    const instrument = tradingUniverse.find((item) => item.symbol === protection.symbol);
    return instrument ? [[instrument.instrumentKey, instrument] as const] : [];
  })).values()], [protections, tradingUniverse]);
  const fnoTopInstrument = fnoTopMode === "FUTURE" && fnoFutureInstrument ? fnoFutureInstrument : spotInstrument;
  const quoteKeys = useMemo(
    () => [...new Set([
      selected.instrumentKey,
      fnoTopInstrument?.instrumentKey,
      ...LIVE_INDEX_TICKERS.map((item) => item.instrumentKey),
      ...fnoListQuoteKeys,
      ...marketScannerQuoteKeys,
      ...positionSymbols.map((symbol) => tradingUniverse.find((item) => item.symbol === symbol)?.instrumentKey).filter((value): value is string => Boolean(value)),
      ...visibleInstruments.map((item) => item.instrumentKey),
    ].filter((value): value is string => Boolean(value)))].slice(0, 500).join(","),
    [fnoListQuoteKeys, fnoTopInstrument?.instrumentKey, marketScannerQuoteKeys, positionSymbols, selected.instrumentKey, tradingUniverse, visibleInstruments],
  );
  const watchlistCounts = useMemo(() => ({
    "NIFTY 50": stockUniverse.filter((item) => item.categories.includes("NIFTY 50")).length,
    "BANK NIFTY": stockUniverse.filter((item) => item.categories.includes("BANK NIFTY")).length,
    "NIFTY 500": stockUniverse.filter((item) => item.categories.includes("NIFTY 500")).length,
    "ALL NSE": stockUniverse.length,
  }), [stockUniverse]);

  const activeCustomList = useMemo(() => customWatchlists.find((list) => `custom:${list.id}` === watchlist) ?? null, [customWatchlists, watchlist]);
  const customWatchlistSymbols = useMemo(() => new Set(customWatchlists.flatMap((list) => list.symbols)), [customWatchlists]);
  const activeWatchlistName = activeCustomList?.name ?? watchlist;
  const activeWatchlistCount = activeCustomList?.symbols.length ?? watchlistCounts[watchlist as keyof typeof watchlistCounts] ?? 0;
  const watchlistChoices = useMemo(() => [
    ...watchlistTabs.map((tab) => ({ id: tab, name: tab, count: watchlistCounts[tab] })),
    ...customWatchlists.map((list) => ({ id: `custom:${list.id}`, name: list.name, count: list.symbols.length, custom: true })),
  ], [customWatchlists, watchlistCounts]);
  const activeFnoUnderlying = useMemo<FnoUnderlying | null>(() => {
    if (selected.assetType !== "OPTION" || !spotInstrument) return null;
    if (fnoUnderlying?.instrumentKey === spotInstrument.instrumentKey) return fnoUnderlying;
    return {
      symbol: spotInstrument.symbol,
      name: spotInstrument.name,
      instrumentKey: spotInstrument.instrumentKey,
      underlyingType: spotInstrument.assetType === "INDEX" ? "INDEX" : "EQUITY",
      optionContracts: 0,
      futureContracts: 0,
    };
  }, [fnoUnderlying, selected.assetType, spotInstrument]);

  useEffect(() => {
    const controller = new AbortController();
    if (!quoteKeys) return;
    let retryAt = 0;
    let requestInFlight = false;

    async function loadWatchlistQuotes() {
      if (requestInFlight || Date.now() < retryAt) return;
      requestInFlight = true;
      try {
        const response = await fetch("/api/upstox/quotes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ keys: quoteKeys.split(",") }),
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
    if (!protectionFeedInstruments.length) return;
    const controller = new AbortController();
    const instrumentsByKey = new Map(protectionFeedInstruments.map((instrument) => [instrument.instrumentKey, instrument]));
    let closeFeed: (() => void) | undefined;
    let reconnectTimer = 0;
    let retryCount = 0;

    const scheduleReconnect = () => {
      if (controller.signal.aborted) return;
      retryCount += 1;
      reconnectTimer = window.setTimeout(() => void connect(), Math.min(30_000, 2_000 * 2 ** Math.min(retryCount - 1, 4)));
    };
    async function connect() {
      if (controller.signal.aborted) return;
      try {
        closeFeed = await openUpstoxLiveFeed({
          instrumentKeys: [...instrumentsByKey.keys()],
          signal: controller.signal,
          onTick: ({ instrumentKey, price, timestampMs }) => {
            const instrument = instrumentsByKey.get(instrumentKey);
            if (instrument) applyRealtimeQuote(instrument, price, timestampMs);
          },
          onDisconnect: scheduleReconnect,
        });
        retryCount = 0;
      } catch {
        scheduleReconnect();
      }
    }
    void connect();
    return () => {
      controller.abort();
      closeFeed?.();
      window.clearTimeout(reconnectTimer);
    };
  }, [applyRealtimeQuote, protectionFeedInstruments]);

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
      const instrument = tradingUniverse.find((item) => item.symbol === symbol);
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
        const charges = calculateInstrumentCharges(item.instrument, { side: closingSide, product: "INTRADAY", quantity: item.position.quantity, price: squareOffPrice });
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
  }, [balance, clock, marketQuotes, orders, tradingUniverse]);

  useEffect(() => {
    if (!orders.length || autoSquareOffRepairInFlightRef.current) return;
    const candidates = orders
      .filter((order) => order.autoSquareOff && order.exitReason === "AUTO_SQUARE_OFF" && order.squareOffPolicy !== UPSTOX_AUTO_SQUARE_OFF_POLICY)
      .map((order) => ({ order, instrument: tradingUniverse.find((item) => item.symbol === order.symbol) }))
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
        const correctedCharges = calculateUpstoxTradingCharges(order.assetType, {
          side: order.side,
          product: "INTRADAY",
          quantity: order.quantity,
          price,
        });
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
  }, [orders, tradingUniverse]);

  useEffect(() => {
    if (!clock || !orders.length || !protections.length || !getNseMarketStatus(clock).isOpen) return;
    const afterIntradaySquareOff = getNseMarketStatus(clock).minutesFromMidnight >= UPSTOX_AUTO_SQUARE_OFF_MINUTES;
    const triggeredOrders: PaperOrder[] = [];
    const clearedProtectionIds = new Set<string>();
    let nextBalance = balance;

    protections.forEach((protection, index) => {
      if (protection.product === "INTRADAY" && afterIntradaySquareOff) return;
      const instrument = tradingUniverse.find((item) => item.symbol === protection.symbol);
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
      const executionPrice = getProtectionExecutionPrice(protection, price, trigger);
      const closingSide = position.side === "LONG" ? "SELL" : "BUY";
      const charges = calculateInstrumentCharges(instrument ?? { assetType: "EQUITY" }, { side: closingSide, product: protection.product, quantity: position.quantity, price: executionPrice });
      const order: PaperOrder = {
        id: `${clock.getTime() + 10_000 + index}`,
        symbol: protection.symbol,
        side: closingSide,
        quantity: position.quantity,
        price: executionPrice,
        status: "COMPLETE",
        time: clock.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
        product: protection.product,
        createdAt: clock.getTime(),
        charges,
        exitReason: trigger,
        priceSource: "UPSTOX_QUOTE",
        instrumentKey: instrument?.instrumentKey,
        instrumentName: instrument?.name,
        assetType: instrument?.assetType ?? "EQUITY",
        optionType: instrument?.optionType,
        strikePrice: instrument?.strikePrice,
        expiry: instrument?.expiry,
        lotSize: instrument?.lotSize,
        underlyingKey: instrument?.underlyingKey,
        underlyingSymbol: instrument?.underlyingSymbol,
      };
      triggeredOrders.push(order);
      clearedProtectionIds.add(protection.id);
      const releasedCapital = paperOrderCapitalValue(instrument?.assetType ?? "EQUITY", protection.product, position.quantity, executionPrice);
      nextBalance = closingSide === "SELL" ? nextBalance + releasedCapital - charges.total : nextBalance - releasedCapital - charges.total;
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
    triggeredOrders.forEach(showProtectionAlert);
    const alertSummary = triggeredOrders.length === 1
      ? `${triggeredOrders[0].symbol} exited: ${triggeredOrders[0].exitReason === "TARGET" ? "target reached" : "stop-loss reached"} at ${formatInr(triggeredOrders[0].price)}`
      : `${triggeredOrders.length} positions exited by ${[...new Set(reasons)].join(" / ")}`;
    setToast(alertSummary);
    window.setTimeout(() => setToast(""), 7_000);
  }, [balance, clock, marketQuoteUpdatedAt, marketQuotes, orders, protections, selected.symbol, tradingUniverse]);
  const handleFeedStatus = useCallback((status: FeedStatus) => setFeedStatus(status), []);
  const selectedQuote = marketQuotes[selected.instrumentKey] ?? marketQuotes[selected.symbol];
  const selectedQuoteKey = marketQuotes[selected.instrumentKey] ? selected.instrumentKey : selected.symbol;
  const selectedQuoteIsFresh = Boolean(selectedQuote && clock && clock.getTime() - (marketQuoteUpdatedAt[selectedQuoteKey] ?? 0) <= 45_000);
  const verifiedLivePrice = selectedQuoteIsFresh ? selectedQuote?.lastPrice : undefined;
  const visibleLivePrice = verifiedLivePrice ?? 0;
  const selectedChange = selectedQuoteIsFresh ? selectedQuote?.changePercent ?? 0 : 0;
  const selectedNetChange = selectedQuoteIsFresh ? selectedQuote?.netChange ?? 0 : 0;
  const selectedDayLow = selectedQuoteIsFresh ? selectedQuote?.low ?? 0 : 0;
  const selectedDayHigh = selectedQuoteIsFresh ? selectedQuote?.high ?? 0 : 0;
  const selectedDayRangeProgress = verifiedLivePrice && selectedDayHigh > selectedDayLow
    ? Math.min(100, Math.max(0, (verifiedLivePrice - selectedDayLow) / (selectedDayHigh - selectedDayLow) * 100))
    : 50;
  const topQuote = fnoTopInstrument ? marketQuotes[fnoTopInstrument.instrumentKey] ?? marketQuotes[fnoTopInstrument.symbol] : undefined;
  const topQuoteKey = fnoTopInstrument && marketQuotes[fnoTopInstrument.instrumentKey] ? fnoTopInstrument.instrumentKey : fnoTopInstrument?.symbol ?? "";
  const topQuoteIsFresh = Boolean(topQuote && clock && clock.getTime() - (marketQuoteUpdatedAt[topQuoteKey] ?? 0) <= 45_000);
  const verifiedTopPrice = topQuoteIsFresh ? topQuote?.lastPrice ?? 0 : fnoTopInstrument?.price ?? 0;
  const verifiedTopChange = topQuoteIsFresh ? topQuote?.changePercent ?? 0 : 0;
  const orderValue = visibleLivePrice * quantity;
  const quantityStep = selected.assetType === "OPTION" ? Math.max(1, selected.lotSize ?? 1) : 1;
  const orderLots = selected.assetType === "OPTION" ? quantity / quantityStep : 0;
  const margin = orderValue * 0.2;
  const isCashDeliveryOrder = product === "DELIVERY" && selected.assetType !== "OPTION" && selected.assetType !== "FUTURE";
  const estimatedFundsRequired = paperOrderCapitalValue(selected.assetType, product, quantity, visibleLivePrice);
  const deliveryHoldingQuantity = getDeliveryHoldingQuantity(orders, selected.symbol);
  const deliverySellError = isCashDeliveryOrder && side === "SELL"
    ? validateDeliverySell(orders, selected.symbol, quantity)
    : null;
  const estimatedOrderCharges = calculateInstrumentCharges(selected, { side, product, quantity, price: visibleLivePrice });
  const selectedPositions = useMemo(
    () => ({
      intraday: calculatePosition(orders, selected.symbol, verifiedLivePrice ?? Number.NaN, "INTRADAY"),
      delivery: calculatePosition(orders, selected.symbol, verifiedLivePrice ?? Number.NaN, "DELIVERY"),
    }),
    [orders, selected.symbol, verifiedLivePrice],
  );
  const preferredPosition = product === "DELIVERY" ? selectedPositions.delivery : selectedPositions.intraday;
  const alternatePosition = product === "DELIVERY" ? selectedPositions.intraday : selectedPositions.delivery;
  const selectedPosition = preferredPosition.quantity > 0 ? preferredPosition : alternatePosition;
  const positionProduct: "INTRADAY" | "DELIVERY" = selectedPosition === selectedPositions.delivery ? "DELIVERY" : "INTRADAY";
  const selectedProtection = protections.find((item) => item.symbol === selected.symbol && item.product === positionProduct);
  const riskToolSide: "BUY" | "SELL" = selectedPosition.quantity > 0 && selectedPosition.side !== "FLAT"
    ? selectedPosition.side === "LONG" ? "BUY" : "SELL"
    : side;
  const riskEntryPrice = selectedPosition.quantity > 0 ? selectedPosition.averagePrice : visibleLivePrice;
  const riskDisplayQuantity = selectedPosition.quantity > 0 ? selectedPosition.quantity : quantity;
  const defaultProtection = defaultProtectionPrices(riskEntryPrice, riskToolSide === "BUY" ? "LONG" : "SHORT", riskDisplayQuantity);
  const requestedTargetPrice = Number(targetPrice);
  const requestedStopLossPrice = Number(stopLossPrice);
  const chartTargetPrice = Number.isFinite(requestedTargetPrice) && requestedTargetPrice > 0
    ? requestedTargetPrice
    : defaultProtection.target;
  const chartStopLossPrice = Number.isFinite(requestedStopLossPrice) && requestedStopLossPrice > 0
    ? requestedStopLossPrice
    : defaultProtection.stopLoss;
  const activeRiskToolEnabled = riskToolEnabled || Boolean(selectedProtection && selectedPosition.quantity > 0);

  useEffect(() => {
    const restoreProtection = window.setTimeout(() => {
      if (selectedProtection) {
        setTargetPrice(selectedProtection.targetPrice?.toFixed(2) ?? "");
        setStopLossPrice(selectedProtection.stopLossPrice?.toFixed(2) ?? "");
        setRiskLevelsCustomized(true);
        setRiskToolEnabled(true);
      } else {
        setTargetPrice("");
        setStopLossPrice("");
        setRiskToolEnabled(false);
        setRiskLevelsCustomized(false);
      }
    }, 0);
    return () => window.clearTimeout(restoreProtection);
  }, [selected.instrumentKey, selectedProtection]);
  const openPositions = useMemo(() => positionSymbols.flatMap((symbol) => {
    const instrument = tradingUniverse.find((item) => item.symbol === symbol);
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
  }), [clock, marketQuoteUpdatedAt, marketQuotes, orders, positionSymbols, selected.symbol, tradingUniverse, verifiedLivePrice]);
  const totalOpenPnl = openPositions.reduce((total, position) => total + position.unrealizedPnl, 0);
  const holdings = useMemo(() => openPositions.filter((position) => {
    const assetType = tradingUniverse.find((item) => item.symbol === position.symbol)?.assetType;
    return position.product === "DELIVERY" && position.side === "LONG" && assetType !== "OPTION" && assetType !== "FUTURE";
  }), [openPositions, tradingUniverse]);
  const holdingsSummary = useMemo(() => holdings.reduce((summary, holding) => {
    const instrument = tradingUniverse.find((item) => item.symbol === holding.symbol);
    const quote = instrument ? marketQuotes[instrument.instrumentKey] ?? marketQuotes[holding.symbol] : marketQuotes[holding.symbol];
    const exitCharges = calculateInstrumentCharges(instrument ?? { assetType: "EQUITY" }, {
      side: "SELL",
      product: "DELIVERY",
      quantity: holding.quantity,
      price: holding.livePrice,
    }).total;
    return {
      invested: summary.invested + holding.averagePrice * holding.quantity,
      current: summary.current + holding.marketValue,
      pnl: summary.pnl + holding.unrealizedPnl,
      dayPnl: summary.dayPnl + (quote?.netChange ?? 0) * holding.quantity,
      exitCharges: summary.exitCharges + exitCharges,
    };
  }, { invested: 0, current: 0, pnl: 0, dayPnl: 0, exitCharges: 0 }), [holdings, marketQuotes, tradingUniverse]);
  const holdingsDayBase = holdingsSummary.current - holdingsSummary.dayPnl;
  const holdingsDayReturnPercent = holdingsDayBase > 0 ? holdingsSummary.dayPnl / holdingsDayBase * 100 : 0;
  const holdingsTotalReturnPercent = holdingsSummary.invested > 0 ? holdingsSummary.pnl / holdingsSummary.invested * 100 : 0;
  const marketStatus = useMemo(
    () => clock ? getNseMarketStatus(clock) : { isOpen: false, message: "Checking NSE market hours…" },
    [clock],
  );
  const intradayOrdersAllowed = Boolean(
    clock && marketStatus.isOpen && getNseMarketStatus(clock).minutesFromMidnight < UPSTOX_AUTO_SQUARE_OFF_MINUTES,
  );
  const marketOrdersAllowed = Boolean(clock && marketStatus.isOpen);
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
  const latestQuoteUpdatedAt = Math.max(0, ...Object.values(marketQuoteUpdatedAt));
  const marketFreshness = feedStatus.mode === "live" && marketStatus.isOpen && clock && latestQuoteUpdatedAt && clock.getTime() - latestQuoteUpdatedAt <= 45_000
    ? "Live"
    : latestQuoteUpdatedAt ? "Delayed" : "Connecting";
  const recentStockItems = recentStocks.flatMap((symbol) => {
    const item = tradingUniverse.find((instrument) => instrument.symbol === symbol);
    return item ? [item] : [];
  }).slice(0, 4);
  const todayClosedPnl = useMemo(() => {
    if (!clock) return 0;
    const todayKey = indiaDateKey(clock);
    return closedTrades.filter((trade) => trade.closedAt > 0 && indiaDateKey(trade.closedAt) === todayKey).reduce((sum, trade) => sum + trade.netPnl, 0);
  }, [clock, closedTrades]);
  const intradayOpenPnl = openPositions.filter((position) => position.product === "INTRADAY").reduce((sum, position) => sum + position.unrealizedPnl, 0);
  const currentDayPortfolioPnl = todayClosedPnl + intradayOpenPnl + holdingsSummary.dayPnl;

  useEffect(() => {
    if (!clock || getNseMarketStatus(clock).minutesFromMidnight < 17 * 60) return;
    const dateKey = indiaDateKey(clock);
    const reminderKey = `papertrade-portfolio-summary:${user?.id ?? "guest"}:${dateKey}`;
    if (localStorage.getItem(reminderKey) === "sent") return;
    const direction = currentDayPortfolioPnl >= 0 ? "profit" : "loss";
    const title = `Today’s portfolio ${direction}`;
    const body = `${currentDayPortfolioPnl >= 0 ? "+" : ""}${formatInr(currentDayPortfolioPnl)} including completed trades, open intraday positions and holdings’ day move.`;
    addPaperTradeNotification({ id: `portfolio-${dateKey}-${user?.id ?? "guest"}`, kind: "portfolio", title, body });
    localStorage.setItem(reminderKey, "sent");
    if (Capacitor.getPlatform() === "android") {
      void getNativeTradeAlert().show({ title: `PaperTrade IN - ${title}`, body }).catch(() => undefined);
    } else if ("Notification" in window && Notification.permission === "granted") {
      new Notification(`PaperTrade IN - ${title}`, { body, icon: "/papertrade-icon-192.png", tag: `papertrade-portfolio-${dateKey}` });
    }
  }, [clock, currentDayPortfolioPnl, user?.id]);
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
  const pnlCalendarYears = useMemo(() => {
    const years = new Set<number>([pnlCalendarYear]);
    closedTrades.forEach((trade) => { if (trade.closedAt > 0) years.add(indiaDateParts(trade.closedAt).year); });
    return [...years].sort((a, b) => b - a);
  }, [closedTrades, pnlCalendarYear]);
  const pnlCalendar = useMemo(() => {
    const dailyResults = new Map<string, { pnl: number; trades: number }>();
    closedTrades.forEach((trade) => {
      if (!trade.closedAt) return;
      const parts = indiaDateParts(trade.closedAt);
      if (parts.year !== pnlCalendarYear || parts.month !== pnlCalendarMonth + 1) return;
      const key = calendarDateKey(parts.year, parts.month - 1, parts.day);
      const current = dailyResults.get(key) ?? { pnl: 0, trades: 0 };
      dailyResults.set(key, { pnl: current.pnl + trade.netPnl, trades: current.trades + 1 });
    });
    const daysInMonth = new Date(Date.UTC(pnlCalendarYear, pnlCalendarMonth + 1, 0)).getUTCDate();
    const firstWeekday = (new Date(Date.UTC(pnlCalendarYear, pnlCalendarMonth, 1)).getUTCDay() + 6) % 7;
    const todayParts = clock ? indiaDateParts(clock.getTime()) : null;
    const days = Array.from({ length: daysInMonth }, (_, index) => {
      const day = index + 1;
      const key = calendarDateKey(pnlCalendarYear, pnlCalendarMonth, day);
      const result = dailyResults.get(key);
      const weekday = new Date(Date.UTC(pnlCalendarYear, pnlCalendarMonth, day)).getUTCDay();
      const weekend = weekday === 0 || weekday === 6;
      const status = result ? result.pnl >= 0 ? "profit" : "loss" : weekend ? "holiday" : "no-trade";
      return { day, key, result, status, today: Boolean(todayParts && todayParts.year === pnlCalendarYear && todayParts.month === pnlCalendarMonth + 1 && todayParts.day === day) };
    });
    return {
      days,
      firstWeekday,
      monthPnl: [...dailyResults.values()].reduce((sum, result) => sum + result.pnl, 0),
      monthTrades: [...dailyResults.values()].reduce((sum, result) => sum + result.trades, 0),
    };
  }, [clock, closedTrades, pnlCalendarMonth, pnlCalendarYear]);
  const pnlVisuals = useMemo(() => {
    const ordered = [...closedTrades].sort((a, b) => a.closedAt - b.closedAt);
    const wins = ordered.filter((trade) => trade.netPnl > 0);
    const losses = ordered.filter((trade) => trade.netPnl < 0);
    const curveData = ordered.reduce((state, trade) => {
      const equity = state.equity + trade.netPnl;
      const peak = Math.max(state.peak, equity);
      return {
        equity,
        peak,
        maxDrawdown: Math.max(state.maxDrawdown, peak - equity),
        curve: [...state.curve, equity],
      };
    }, { equity: 0, peak: 0, maxDrawdown: 0, curve: [] as number[] });
    const { equity, maxDrawdown, curve } = curveData;
    const low = Math.min(0, ...curve);
    const high = Math.max(0, ...curve);
    const range = Math.max(1, high - low);
    const points = curve.map((value, index) => {
      const x = curve.length > 1 ? index / (curve.length - 1) * 100 : 50;
      const y = 36 - (value - low) / range * 30;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    });
    const equityPoints = points.length > 1 ? points.join(" ") : points.length ? `0,${points[0].split(",")[1]} 100,${points[0].split(",")[1]}` : "0,34 100,34";
    const totalProfit = wins.reduce((sum, trade) => sum + trade.netPnl, 0);
    const totalLoss = Math.abs(losses.reduce((sum, trade) => sum + trade.netPnl, 0));
    return {
      equityPoints,
      equityAreaPoints: `0,40 ${equityPoints} 100,40`,
      bestTrade: ordered.length ? Math.max(...ordered.map((trade) => trade.netPnl)) : 0,
      worstTrade: ordered.length ? Math.min(...ordered.map((trade) => trade.netPnl)) : 0,
      averageWin: wins.length ? totalProfit / wins.length : 0,
      averageLoss: losses.length ? totalLoss / losses.length : 0,
      expectancy: ordered.length ? equity / ordered.length : 0,
      profitFactor: totalLoss ? totalProfit / totalLoss : totalProfit ? Number.POSITIVE_INFINITY : 0,
      maxDrawdown,
      wins: wins.length,
      losses: losses.length,
    };
  }, [closedTrades]);
  const visiblePnlTrades = useMemo(() => selectedPnlDateKey
    ? closedTrades.filter((trade) => trade.closedAt > 0 && calendarDateKey(indiaDateParts(trade.closedAt).year, indiaDateParts(trade.closedAt).month - 1, indiaDateParts(trade.closedAt).day) === selectedPnlDateKey)
    : [], [closedTrades, selectedPnlDateKey]);
  const paperOrdersById = useMemo(() => new Map(orders.map((order) => [order.id, order])), [orders]);
  const orderMarkerRoles = useMemo(() => {
    const roles = new Map<string, "ENTRY" | "EXIT">();
    closedTrades.forEach((trade) => {
      trade.sourceOrderIds.forEach((orderId, index) => {
        roles.set(orderId, index === trade.sourceOrderIds.length - 1 ? "EXIT" : "ENTRY");
      });
    });
    return roles;
  }, [closedTrades]);
  const selectedTradeMarkers = useMemo<ChartTradeMarker[]>(() => orders
    .filter((order) => order.instrumentKey === selected.instrumentKey || order.symbol === selected.symbol)
    .map((order) => orderTradeMarker(order, orderMarkerRoles.get(order.id) ?? "ENTRY"))
    .filter((marker) => marker.time > 0), [orders, orderMarkerRoles, selected.instrumentKey, selected.symbol]);
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
    const projectedQuantity = Math.max(1, positionMatches ? selectedPosition.quantity + quantity : quantity);
    const projectedEntry = positionMatches
      ? ((selectedPosition.averagePrice * selectedPosition.quantity) + (entry * quantity)) / projectedQuantity
      : entry;
    const defaults = defaultProtectionPrices(projectedEntry, nextSide === "BUY" ? "LONG" : "SHORT", projectedQuantity);
    setTargetPrice(defaults.target.toFixed(4));
    setStopLossPrice(defaults.stopLoss.toFixed(4));
    setRiskLevelsCustomized(false);
  }

  function updateChartRiskLevel(level: "target" | "stopLoss", value: number, committed: boolean) {
    setRiskLevelsCustomized(true);
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

  function copySuggestionContact(value: string, label: string) {
    void navigator.clipboard?.writeText(value);
    setToast(`${label} copied for suggestions`);
    window.setTimeout(() => setToast(""), 2_500);
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
      `Delete ${trade.symbol} trade from this device? Its entry/exit fills, P&L, charges and calendar heat map will be recalculated.`,
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
    if (selected.assetType === "OPTION" && quantity % quantityStep !== 0) {
      setToast(`Option quantity must be a multiple of the ${quantityStep}-unit lot size.`);
      window.setTimeout(() => setToast(""), 3_500);
      return;
    }
    const executionPrice = verifiedLivePrice;
    if (!executionPrice || !Number.isFinite(executionPrice) || executionPrice <= 0) {
      setToast("Live Upstox price unavailable. Paper order was not placed.");
      window.setTimeout(() => setToast(""), 3_500);
      return;
    }
    if (!marketOrdersAllowed) {
      setToast(marketStatus.message);
      window.setTimeout(() => setToast(""), 3_500);
      return;
    }
    if (product === "INTRADAY" && !intradayOrdersAllowed) {
      setToast(intradayStatusMessage);
      window.setTimeout(() => setToast(""), 3_500);
      return;
    }
    if (isCashDeliveryOrder && side === "SELL") {
      const sellError = validateDeliverySell(orders, selected.symbol, quantity);
      if (sellError) {
        setToast(sellError);
        window.setTimeout(() => setToast(""), 3_800);
        return;
      }
    }
    const executionCharges = calculateInstrumentCharges(selected, { side, product, quantity, price: executionPrice });
    const executionCapital = paperOrderCapitalValue(selected.assetType, product, quantity, executionPrice);
    if (side === "BUY" && executionCapital + executionCharges.total > balance) {
      setToast(`Insufficient virtual cash. Required ${formatInr(executionCapital + executionCharges.total)}.`);
      window.setTimeout(() => setToast(""), 3_800);
      return;
    }
    const intendedDirection = side === "BUY" ? "LONG" : "SHORT";
    const riskError = isCashDeliveryOrder && side === "SELL" ? null : protectionError(intendedDirection, executionPrice);
    if (riskError) {
      setToast(riskError);
      window.setTimeout(() => setToast(""), 3_200);
      return;
    }
    prepareProtectionAlerts();
    const order: PaperOrder = {
      id: `${new Date().getTime()}`, symbol: selected.symbol, side, quantity, price: executionPrice,
      status: "COMPLETE", time: new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
      product, createdAt: new Date().getTime(), charges: executionCharges,
      priceSource: selectedQuote?.lastPrice ? "UPSTOX_QUOTE" : "UPSTOX_CANDLE",
      instrumentKey: selected.instrumentKey,
      instrumentName: selected.name,
      assetType: selected.assetType ?? "EQUITY",
      optionType: selected.optionType,
      strikePrice: selected.strikePrice,
      expiry: selected.expiry,
      lotSize: selected.lotSize,
      underlyingKey: selected.underlyingKey,
      underlyingSymbol: selected.underlyingSymbol,
    };
    const nextOrders = [order, ...orders];
    const nextBalance = (side === "BUY" ? balance - executionCapital : balance + executionCapital) - executionCharges.total;
    const nextPosition = calculatePosition(nextOrders, selected.symbol, executionPrice, product);
    const requestedProtection = protectionValues();
    const automaticProtection = nextPosition.quantity > 0
      ? defaultProtectionPrices(nextPosition.averagePrice, intendedDirection, nextPosition.quantity)
      : requestedProtection;
    const target = riskLevelsCustomized ? requestedProtection.target : automaticProtection.target;
    const stopLoss = riskLevelsCustomized ? requestedProtection.stopLoss : automaticProtection.stopLoss;
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
    setRiskLevelsCustomized(false);
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
    if (!marketOrdersAllowed) {
      setToast(marketStatus.message);
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
    const exitCharges = calculateInstrumentCharges(selected, { side: closingSide, product: positionProduct, quantity: closingQuantity, price: executionPrice });
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
      instrumentKey: selected.instrumentKey,
      instrumentName: selected.name,
      assetType: selected.assetType ?? "EQUITY",
      optionType: selected.optionType,
      strikePrice: selected.strikePrice,
      expiry: selected.expiry,
      lotSize: selected.lotSize,
      underlyingKey: selected.underlyingKey,
      underlyingSymbol: selected.underlyingSymbol,
    };
    const nextOrders = [order, ...orders];
    const exitCapital = paperOrderCapitalValue(selected.assetType, positionProduct, closingQuantity, executionPrice);
    const nextBalance = (closingSide === "BUY" ? balance - exitCapital : balance + exitCapital) - exitCharges.total;
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
    const nextInstrument = { ...item, price: price > 0 ? price : 0 };
    setRecentStocks((current) => [item.symbol, ...current.filter((symbol) => symbol !== item.symbol)].slice(0, 6));
    setSelected(nextInstrument);
    setChartTradeFooterOpen(false);
    if (item.assetType !== "OPTION") {
      setWorkspaceMode("trade");
      setSpotInstrument(null);
      setFnoUnderlying(null);
      setFnoFutureInstrument(null);
      setFnoTopMode("SPOT");
      setOptionChainOpen(false);
      setFnoTradeDockOpen(false);
    }
    setShowTradeSymbols(false);
    setTradeSymbolSearch("");
    setRiskToolEnabled(false);
    setTargetPrice("");
    setStopLossPrice("");
    setSidebarOpen(false);
    const url = new URL(window.location.href);
    url.searchParams.set("symbol", item.symbol);
    url.searchParams.set("timeframe", timeframe);
    if (item.assetType === "OPTION") {
      if (window.history.state?.papertradeFno) window.history.replaceState({ ...window.history.state, papertradeFno: true }, "", url);
      else window.history.pushState({ papertradeFno: true }, "", url);
    } else {
      const currentState = window.history.state ?? {};
      const currentSnapshot = currentState.papertradeChart as ChartHistorySnapshot | undefined;
      if (!currentSnapshot?.instrument?.instrumentKey && selected.assetType !== "OPTION" && selected.assetType !== "FUTURE") {
        window.history.replaceState({ ...currentState, papertradeChart: { instrument: selected, timeframe } }, "", window.location.href);
      }
      const nextState = { ...window.history.state, papertradeChart: { instrument: nextInstrument, timeframe } };
      if (selected.instrumentKey === nextInstrument.instrumentKey && workspaceMode === "trade") window.history.replaceState(nextState, "", url);
      else window.history.pushState(nextState, "", url);
    }
  }

  function chooseOptionTradeInstrument(option: Instrument, spot: Instrument) {
    setDerivativeInstruments((current) => current.some((item) => item.instrumentKey === option.instrumentKey)
      ? current.map((item) => item.instrumentKey === option.instrumentKey ? option : item)
      : [option, ...current]);
    chooseTradeInstrument(option);
    setSpotInstrument(spot);
    setQuantityInput(String(Math.max(1, option.lotSize ?? 1)));
    setExitQuantity(String(Math.max(1, option.lotSize ?? 1)));
    setFnoTradeDockOpen(false);
    setWorkspaceMode("fno");
    setFnoListOpen(false);
    setMarketsOpen(false);
    localStorage.setItem(LAST_CHART_STORAGE_KEY, JSON.stringify({ symbol: option.symbol, timeframe, instrument: option, spotInstrument: spot, fnoUnderlying, workspaceMode: "fno", fnoTopMode }));
  }

  function openFnoNormalChart(underlying: FnoUnderlying) {
    const listedInstrument = stockUniverse.find((item) => item.instrumentKey === underlying.instrumentKey || item.symbol === underlying.symbol);
    const quote = marketQuotes[underlying.instrumentKey] ?? marketQuotes[underlying.symbol];
    const normalInstrument = listedInstrument
      ? { ...listedInstrument, price: quote?.lastPrice ?? listedInstrument.price }
      : underlyingToInstrument(underlying, quote?.lastPrice ?? 0);
    chooseTradeInstrument(normalInstrument);
    setFnoUnderlying(underlying);
    const nearestFuture = underlying.futures?.[0];
    setFnoFutureInstrument(nearestFuture ? futureToInstrument(nearestFuture, underlying) : null);
    setFnoTopMode("SPOT");
    setMarketsOpen(false);
    setFnoListOpen(false);
  }

  async function openFnoUnderlying(underlying: FnoUnderlying) {
    if (openingUnderlyingKey) return;
    setOpeningUnderlyingKey(underlying.instrumentKey);
    setToast(`Opening ${underlying.symbol} spot and option charts…`);
    try {
      const expiries = await loadOptionExpiries(underlying);
      const rows = await loadOptionChain(underlying, expiries[0]);
      const atmRow = nearestAtmRow(rows);
      const contract = defaultOptionSide(atmRow);
      if (!atmRow || !contract) throw new Error("No live ATM option contract is available for this symbol.");
      const nearestFuture = underlying.futures?.[0];
      setFnoUnderlying(underlying);
      setFnoFutureInstrument(nearestFuture ? futureToInstrument(nearestFuture, underlying) : null);
      setFnoTopMode("SPOT");
      chooseOptionTradeInstrument(
        optionToInstrument(contract, atmRow, underlying),
        underlyingToInstrument(underlying, atmRow.underlyingSpotPrice),
      );
      setTimeframe("5m");
      setOptionSplitPercent(50);
      setToast(`${underlying.symbol} opened with the nearest ATM ${contract.optionType}.`);
      window.setTimeout(() => setToast(""), 2_800);
    } catch (error) {
      setFnoUnderlying(null);
      setFnoFutureInstrument(null);
      setToast(error instanceof Error ? error.message : "Unable to open this F&O symbol.");
      window.setTimeout(() => setToast(""), 4_000);
    } finally {
      setOpeningUnderlyingKey("");
    }
  }

  async function toggleFnoOptionType() {
    if (!activeFnoUnderlying || !selected.expiry || !selected.strikePrice || fnoSwitchingOption) return;
    setFnoSwitchingOption(true);
    try {
      const rows = await loadOptionChain(activeFnoUnderlying, selected.expiry);
      const row = rows.find((item) => item.strikePrice === selected.strikePrice);
      const contract = selected.optionType === "CE" ? row?.put : row?.call;
      if (!row || !contract || contract.marketData.ltp <= 0) throw new Error("The matching Call/Put contract is unavailable.");
      chooseOptionTradeInstrument(optionToInstrument(contract, row, activeFnoUnderlying), underlyingToInstrument(activeFnoUnderlying, row.underlyingSpotPrice));
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Unable to switch the option contract.");
      window.setTimeout(() => setToast(""), 3_000);
    } finally {
      setFnoSwitchingOption(false);
    }
  }

  function beginOptionSplitDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    const container = event.currentTarget.parentElement;
    if (!container) return;
    const bounds = container.getBoundingClientRect();
    const move = (nextEvent: PointerEvent) => {
      nextEvent.preventDefault();
      const percent = ((nextEvent.clientY - bounds.top) / bounds.height) * 100;
      setOptionSplitPercent(Math.max(16, Math.min(84, percent)));
    };
    const stop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
      document.body.classList.remove("resizing-option-charts");
    };
    document.body.classList.add("resizing-option-charts");
    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", stop, { once: true });
    window.addEventListener("pointercancel", stop, { once: true });
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

  function openFnoWatchlistPicker(underlying: FnoUnderlying) {
    const quote = marketQuotes[underlying.instrumentKey] ?? marketQuotes[underlying.symbol];
    const listedInstrument = stockUniverse.find((item) => item.instrumentKey === underlying.instrumentKey || item.symbol === underlying.symbol);
    const instrument = listedInstrument
      ? { ...listedInstrument, price: quote?.lastPrice ?? listedInstrument.price }
      : underlyingToInstrument(underlying, quote?.lastPrice ?? 0);
    setDerivativeInstruments((current) => current.some((item) => item.instrumentKey === instrument.instrumentKey) ? current : [instrument, ...current]);
    openWatchlistPicker(instrument);
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
    setHoldingsOpen(false);
    setOrdersOpen(false);
    setMarketsOpen(false);
    setPnlOpen(false);
    const instrument = tradingUniverse.find((item) => item.symbol === symbol);
    if (!instrument) return;
    chooseTradeInstrument(instrument);
    if (instrument.assetType === "OPTION" && instrument.underlyingKey) {
      setWorkspaceMode("fno");
      const knownSpot = stockUniverse.find((item) => item.instrumentKey === instrument.underlyingKey || item.symbol === instrument.underlyingSymbol);
      setSpotInstrument(knownSpot ?? {
        symbol: instrument.underlyingSymbol || "SPOT",
        name: instrument.underlyingSymbol || "Underlying spot",
        exchange: "NSE",
        price: 0,
        change: 0,
        instrumentKey: instrument.underlyingKey,
        categories: [],
        assetType: instrument.underlyingKey.startsWith("NSE_INDEX|") ? "INDEX" : "EQUITY",
      });
    }
  }

  function openPaperOrderChart(order: PaperOrder) {
    setSidebarOpen(false);
    setPositionsOpen(false);
    setHoldingsOpen(false);
    setOrdersOpen(false);
    setMarketsOpen(false);
    setPnlOpen(false);
    const instrument = instrumentFromPaperOrder(order, tradingUniverse);
    chooseTradeInstrument(instrument);
    if (instrument.assetType === "OPTION" && instrument.underlyingKey) {
      setWorkspaceMode("fno");
      const knownSpot = stockUniverse.find((item) => item.instrumentKey === instrument.underlyingKey || item.symbol === instrument.underlyingSymbol);
      setSpotInstrument(knownSpot ?? {
        symbol: instrument.underlyingSymbol || "SPOT",
        name: instrument.underlyingSymbol || "Underlying spot",
        exchange: "NSE",
        price: 0,
        change: 0,
        instrumentKey: instrument.underlyingKey,
        categories: [],
        assetType: instrument.underlyingKey.startsWith("NSE_INDEX|") ? "INDEX" : "EQUITY",
      });
    }
  }

  function openHoldingSell(symbol: string, heldQuantity: number) {
    openPositionChart(symbol);
    setProduct("DELIVERY");
    setSide("SELL");
    setQuantityInput(String(heldQuantity));
    setRiskToolEnabled(false);
    setTargetPrice("");
    setStopLossPrice("");
    setOrderSheetOpen(true);
  }

  function openNavigationSection(section: NavigationSection) {
    setOptionChainOpen(false);
    if (section === "home") {
      setHomeOpen(true);
      setSidebarOpen(false); setPositionsOpen(false); setHoldingsOpen(false); setOrdersOpen(false); setMarketsOpen(false); setPnlOpen(false);
      setFnoListOpen(false); setOptionChainOpen(false); setOrderSheetOpen(false); setFnoTradeDockOpen(false);
      return;
    }
    setHomeOpen(false);
    if (section === "trade") {
      setSidebarOpen(false); setPositionsOpen(false); setHoldingsOpen(false); setOrdersOpen(false); setMarketsOpen(false); setPnlOpen(false);
      setFnoListOpen(false);
      if (selected.assetType === "OPTION" && spotInstrument) closeFnoWorkspace();
      else setWorkspaceMode("trade");
      return;
    }
    if (section === "fno") {
      setSidebarOpen(false); setPositionsOpen(false); setHoldingsOpen(false); setOrdersOpen(false); setMarketsOpen(false); setPnlOpen(false);
      if (selected.assetType === "OPTION" && spotInstrument) {
        setWorkspaceMode("fno");
        setFnoListOpen(false);
        return;
      }
      const saved = lastFnoWorkspaceRef.current;
      if (!saved) {
        setWorkspaceMode("fno");
        setFnoListOpen(true);
        return;
      }
      setSelected(saved.option);
      setSpotInstrument(saved.spot);
      setFnoUnderlying(saved.underlying);
      setFnoFutureInstrument(saved.future);
      setFnoTopMode(saved.topMode);
      setTimeframe(saved.timeframe);
      setWorkspaceMode("fno");
      setFnoListOpen(false);
      return;
    }
    setFnoListOpen(false);
    setSidebarOpen(section === "watchlist");
    setPositionsOpen(false);
    setHoldingsOpen(section === "holdings");
    setOrdersOpen(section === "orders");
    if (section === "markets" || section === "ipo") setMarketsInitialGroup(section === "ipo" ? "IPO" : marketsInitialGroup === "IPO" ? "TRADING" : marketsInitialGroup);
    setMarketsOpen(section === "markets" || section === "ipo");
    if (section === "pnl") {
      const currentDate = indiaDateParts(clock?.getTime() ?? Date.now());
      setPnlCalendarMonth(currentDate.month - 1);
      setPnlCalendarYear(currentDate.year);
      setSelectedPnlDateKey(null);
    }
    setPnlOpen(section === "pnl");
  }

  const rememberScanner = useCallback((label: string) => {
    setRecentScanners((current) => [label, ...current.filter((item) => item !== label)].slice(0, 4));
  }, []);

  function toggleHomeCard(card: HomeCardId) {
    setHomeCards((current) => ({ ...current, [card]: !current[card] }));
  }

  function closeAccountModal() {
    setAccountOpen(false);
    setAccountDeleteArmed(false);
    setAccountDeleteError("");
  }

  async function permanentlyDeleteAccount() {
    if (accountDeleteWorking) return;
    setAccountDeleteWorking(true);
    setAccountDeleteError("");
    try {
      await deleteAccount();
      closeAccountModal();
    } catch (deletionError) {
      setAccountDeleteError(deletionError instanceof Error ? deletionError.message : "Account deletion failed. Please try again.");
    } finally {
      setAccountDeleteWorking(false);
    }
  }

  return (
    <main className="terminal-shell" data-theme={theme} data-platform={isAndroidApp ? "android" : "web"}>
      <IpoAlertMonitor />
      <header className="topbar">
        <Brand onClick={() => openNavigationSection("home")} />
        <nav className="main-nav" aria-label="Main navigation">
          <button className={activeNavigationSection === "home" ? "nav-active" : ""} onClick={() => openNavigationSection("home")}>Home</button><button className={activeNavigationSection === "trade" ? "nav-active" : ""} onClick={() => openNavigationSection("trade")}>Trade</button><button className={activeNavigationSection === "fno" ? "nav-active" : ""} onClick={() => openNavigationSection("fno")}>F&amp;O</button><button className={activeNavigationSection === "watchlist" ? "nav-active" : ""} onClick={() => openNavigationSection("watchlist")}>Watchlist</button><button className={activeNavigationSection === "holdings" ? "nav-active" : ""} onClick={() => openNavigationSection("holdings")}>Holdings</button><button className={activeNavigationSection === "orders" ? "nav-active" : ""} onClick={() => openNavigationSection("orders")}>Orders</button><button className={activeNavigationSection === "markets" ? "nav-active" : ""} onClick={() => openNavigationSection("markets")}>Markets</button><button className={activeNavigationSection === "ipo" ? "nav-active" : ""} onClick={() => openNavigationSection("ipo")}>IPOs</button><button className={activeNavigationSection === "pnl" ? "nav-active" : ""} onClick={() => openNavigationSection("pnl")}>P&amp;L</button>
        </nav>
        <div className="top-actions">
          <div className={`market-status ${feedStatus.mode}`} title={feedStatus.mode === "live" ? "Live Upstox data" : "Live data unavailable"} aria-label={feedStatus.mode === "live" ? "Live market data connected" : "Live market data unavailable"}>
            <span /> <span className="market-status-text">{feedStatus.mode === "live" ? "Live data" : "Data offline"}</span>
          </div>
          <button className="funds-button" onClick={() => setFundsOpen(true)} title="Add virtual money"><WalletCards size={16} /> {formatInr(balance)}</button>
          {!isAndroidApp && <button className="download-button" onClick={() => setDownloadOpen(true)} title="Get the mobile app"><Download size={16} /> Get app</button>}
          {!isAndroidApp && <button className="api-button" onClick={() => setShowApi(true)}><Cable size={16} /> Broker API</button>}
          <button className="suggestion-button" onClick={() => setFeedbackOpen(true)} aria-label="Send suggestions" title="Send suggestions"><MessageCircle size={16} /><span>Suggestions</span></button>
          <button className={`icon-button top-watchlist-button ${activeNavigationSection === "watchlist" ? "active" : ""}`} onClick={() => openNavigationSection("watchlist")} aria-label="Open watchlist" title="Watchlist"><Layers3 size={18} /></button>
          <NotificationCenter />
          <div className="more-menu-wrap">
            <button className={`icon-button more-menu-trigger ${moreMenuOpen ? "active" : ""}`} onClick={() => setMoreMenuOpen((value) => !value)} aria-expanded={moreMenuOpen} aria-label="More options"><MoreHorizontal size={19} /></button>
            {moreMenuOpen && <>
              <button className="more-menu-scrim" aria-label="Close more options" onClick={() => setMoreMenuOpen(false)} />
              <section className="more-menu-panel" aria-label="More options">
                <header><SlidersHorizontal size={17} /><span><b>More</b><small>Personalise your home screen</small></span></header>
                <div className="home-card-toggles">
                  <b>Home cards</b>
                  {([['market', 'Market freshness'], ['recent', 'Recently viewed'], ['portfolio', 'Portfolio summary']] as Array<[HomeCardId, string]>).map(([id, label]) => <button key={id} className={homeCards[id] ? "active" : ""} onClick={() => toggleHomeCard(id)} role="switch" aria-checked={homeCards[id]}><span>{label}</span><i /></button>)}
                </div>
                <div className="more-menu-actions">
                  <button onClick={() => { setMoreMenuOpen(false); openNavigationSection("watchlist"); }}><Layers3 size={16} /><span>Watchlists</span></button>
                  <button onClick={() => { setMoreMenuOpen(false); openNavigationSection("holdings"); }}><BriefcaseBusiness size={16} /><span>Holdings</span></button>
                  <button onClick={() => { setMoreMenuOpen(false); openNavigationSection("orders"); }}><WalletCards size={16} /><span>Order book</span></button>
                  <button onClick={() => { setMoreMenuOpen(false); openNavigationSection("pnl"); }}><Activity size={16} /><span>Performance &amp; P&amp;L</span></button>
                  <button onClick={() => { setMoreMenuOpen(false); setFundsOpen(true); }}><WalletCards size={16} /><span>Virtual funds</span><small>{formatInr(balance)}</small></button>
                  <button onClick={() => { setMoreMenuOpen(false); toggleTheme(); }}>{theme === "neon" ? <Sun size={16} /> : <Moon size={16} />}<span>{theme === "neon" ? "Light theme" : "Dark theme"}</span></button>
                  {!isAndroidApp && <button onClick={() => { setMoreMenuOpen(false); setDownloadOpen(true); }}><Download size={16} /><span>Get app</span></button>}
                  {!isAndroidApp && <button onClick={() => { setMoreMenuOpen(false); setShowApi(true); }}><Cable size={16} /><span>Broker connection</span></button>}
                  <button onClick={() => { setMoreMenuOpen(false); setFeedbackOpen(true); }}><MessageCircle size={16} /><span>Suggestions</span></button>
                </div>
              </section>
            </>}
          </div>
          <button className="icon-button theme-toggle" onClick={toggleTheme} aria-label={theme === "neon" ? "Use light theme" : "Use neon dark theme"} title={theme === "neon" ? "Light theme" : "Neon dark theme"}>{theme === "neon" ? <Sun size={17} /> : <Moon size={17} />}</button>
          {authConfigured && user && <button className="profile-button account-button" onClick={() => setAccountOpen(true)} aria-label="Open account" title={user.email ?? "Account"}>{user.user_metadata?.avatar_url ? <Image unoptimized width={36} height={36} src={user.user_metadata.avatar_url as string} alt="" referrerPolicy="no-referrer" /> : <UserRound size={18} />}</button>}
        </div>
      </header>

      {!holdingsOpen && !homeOpen && <div className={`workspace section-${activeNavigationSection} ${desktopOrderPanelOpen ? "" : "order-panel-collapsed"}`}>
        <aside className={`watchlist-panel ${sidebarOpen ? "mobile-open" : ""}`}>
          <div className="mobile-panel-head"><b>Watchlist</b><button className="icon-button" onClick={() => setSidebarOpen(false)} aria-label="Close watchlist"><X size={20} /></button></div>
          <div className="desktop-panel-head"><span className="eyebrow">Indian markets</span><h2>Watchlist</h2></div>
          <div className="search-box"><Search size={16} /><input value={search} onChange={(event) => { setSearch(event.target.value); setWatchlistLimit(60); }} placeholder="Search all NSE stocks" /></div>
          <div className="desktop-watchlist-tabs" role="tablist" aria-label="Watchlists">
            {watchlistChoices.map((choice) => <button type="button" role="tab" aria-selected={watchlist === choice.id} className={watchlist === choice.id ? "active" : ""} key={choice.id} onClick={() => { setWatchlist(choice.id); setWatchlistLimit(60); }}><span>{choice.name}</span><small>{choice.count}</small></button>)}
            <button type="button" className="new-list-tab" onClick={() => openWatchlistPicker(null)}><Plus size={14} /> New list</button>
          </div>
          <div className="watchlist-selector-row"><CompactSelectorButton label="Current watchlist" value={`${activeWatchlistName} · ${activeWatchlistCount}`} onClick={() => setShowWatchlistSelector(true)} /></div>
          {showWatchlistSelector && <WatchlistSelector activeId={watchlist} choices={watchlistChoices} onSelect={(id) => { setWatchlist(id); setWatchlistLimit(60); setShowWatchlistSelector(false); }} onNewList={() => { setShowWatchlistSelector(false); openWatchlistPicker(null); }} onClose={() => setShowWatchlistSelector(false)} />}
          {activeCustomList && <div className="custom-list-bar"><b>{activeCustomList.name}</b><span>{activeCustomList.symbols.length} stocks</span><button onClick={() => openWatchlistPicker(null)}>Edit list</button></div>}
          <div className="instrument-list">
            {visibleInstruments.map((item) => {
              const quote = marketQuotes[item.instrumentKey] ?? marketQuotes[item.symbol];
              const price = quote?.lastPrice ?? item.price;
              const change = quote?.changePercent ?? item.change;
              const netChange = quote?.netChange ?? deriveNetChange(price, change);
              const saved = customWatchlists.some((list) => list.symbols.includes(item.symbol));
              return (
                <div key={item.symbol} className={`instrument-row ${selected.symbol === item.symbol ? "selected" : ""}`} role="button" tabIndex={0} onClick={() => chooseTradeInstrument(item)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") chooseTradeInstrument(item); }}>
                  <span className="symbol-avatar">{item.symbol.slice(0, 2)}</span>
                  <span className="instrument-name"><b>{item.symbol}</b><small>{item.name}</small></span>
                  <span className="instrument-price"><b>{price > 0 ? price.toLocaleString("en-IN", { minimumFractionDigits: 2 }) : "—"}</b><small className={`market-move-line ${price > 0 ? change >= 0 ? "positive" : "negative" : ""}`}>{price > 0 ? formatSignedMarketMove(netChange, change) : "Quote loading"}</small></span>
                  {activeCustomList?.symbols.includes(item.symbol) ? (
                    <button className="watchlist-star remove" onClick={(event) => { event.stopPropagation(); removeStockFromCustomWatchlist(activeCustomList.id, item.symbol); }} aria-label={`Remove ${item.symbol} from ${activeCustomList.name}`}><X size={15} /></button>
                  ) : (
                    <button className={`watchlist-star ${saved ? "saved" : ""}`} onClick={(event) => { event.stopPropagation(); openWatchlistPicker(item); }} aria-label={`Add ${item.symbol} to a custom watchlist`}><Star size={15} fill={saved ? "currentColor" : "none"} /></button>
                  )}
                </div>
              );
            })}
            {watchlistLoading && <div className="watchlist-skeleton-list" aria-label="Loading NSE stocks">{Array.from({ length: 8 }, (_, index) => <div className="watchlist-skeleton-row" key={`watchlist-skeleton-${index}`}><span /><span><i /><i /></span><span><i /><i /></span></div>)}</div>}
            {!watchlistLoading && !filtered.length && <div className="empty-list">No matching NSE stocks.</div>}
            {visibleInstruments.length < filtered.length && <button className="load-more-stocks" onClick={() => setWatchlistLimit((value) => value + 60)}>Load 60 more <small>{visibleInstruments.length} of {filtered.length}</small></button>}
          </div>
        </aside>

        <section className="chart-area">
          {activeNavigationSection === "trade" && <section className="live-index-strip chart-index-strip" aria-label="Live Indian market indices">
            {LIVE_INDEX_TICKERS.map((item) => {
              const quote = marketQuotes[item.instrumentKey];
              const isFresh = Boolean(quote && clock && clock.getTime() - (marketQuoteUpdatedAt[item.instrumentKey] ?? 0) <= 45_000);
              const isLive = isFresh && marketStatus.isOpen && feedStatus.mode === "live";
              const change = quote?.changePercent ?? 0;
              const points = quote?.netChange ?? 0;
              return (
                <button type="button" className={isLive ? "live" : "stale"} key={item.instrumentKey} title={isLive ? `Open ${item.label} live chart` : `Open ${item.label} chart`} onClick={() => {
                  openNavigationSection("trade");
                  chooseTradeInstrument({ symbol: item.symbol, name: item.name, exchange: "NSE", price: quote?.lastPrice ?? 0, change, instrumentKey: item.instrumentKey, categories: [], assetType: "INDEX" });
                }}>
                  <span>{item.label}</span>
                  <b>{quote ? quote.lastPrice.toLocaleString("en-IN", { maximumFractionDigits: 2 }) : "—"}</b>
                  <small className={points >= 0 ? "positive" : "negative"}>{quote ? `${points >= 0 ? "+" : ""}${points.toFixed(2)}` : "—"}</small>
                  <em className={change >= 0 ? "positive" : "negative"}>{quote ? `${change >= 0 ? "+" : ""}${change.toFixed(2)}%` : "Live"}</em>
                </button>
              );
            })}
          </section>}
          <section className="trade-cockpit" aria-label="Trade workspace controls">
          <div className="instrument-header">
            <div className="trade-identity-cluster">
              <div className="trade-context-line">
                <span className={`trade-feed-chip ${selectedQuoteIsFresh ? "live" : "waiting"}`}><i />{selectedQuoteIsFresh ? "LIVE" : "SYNCING"}</span>
                <span>Paper practice</span>
              </div>
              <div ref={tradeSymbolPickerRef} className="instrument-title trade-symbol-picker">
                <button className="trade-symbol-trigger" onClick={() => setShowTradeSymbols((value) => !value)} aria-expanded={showTradeSymbols}>
                  <div className="title-line"><h1>{selected.symbol}</h1><span>NSE</span><ChevronDown size={16} /></div>
                  <p>{selected.name}</p>
                </button>
                {selected.assetType !== "OPTION" && <button
                  className={`chart-watchlist-star ${customWatchlists.some((list) => list.symbols.includes(selected.symbol)) ? "saved" : ""}`}
                  onClick={() => openWatchlistPicker(selected)}
                  aria-label={`Add ${selected.symbol} to a custom watchlist`}
                  title="Add to custom watchlist"
                >
                  <Star size={17} fill={customWatchlists.some((list) => list.symbols.includes(selected.symbol)) ? "currentColor" : "none"} />
                </button>}
                {selected.assetType !== "OPTION" && fnoUnderlying?.instrumentKey === selected.instrumentKey && <button
                  className="chart-derivatives-link"
                  disabled={openingUnderlyingKey === fnoUnderlying.instrumentKey}
                  onClick={() => void openFnoUnderlying(fnoUnderlying)}
                  aria-label={`Open ${selected.symbol} option charts`}
                  title="Open option charts"
                >
                  <Link2 size={19} />
                </button>}
                {showTradeSymbols && (
                  <div className="trade-symbol-menu">
                    <label><Search size={16} /><input value={tradeSymbolSearch} onChange={(event) => setTradeSymbolSearch(event.target.value)} placeholder="Search all NSE symbols" /></label>
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
            </div>
            <div className="quote-block"><strong>{verifiedLivePrice ? verifiedLivePrice.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—"}</strong><span className={selectedChange >= 0 ? "positive" : "negative"}>{selectedQuoteIsFresh ? `${selectedNetChange >= 0 ? "+" : ""}${selectedNetChange.toFixed(2)} (${selectedChange >= 0 ? "+" : ""}${selectedChange.toFixed(2)}%)` : "Waiting for Upstox"}</span></div>
            <div className="trade-day-range">
              <header><span>DAY RANGE</span><b>{selectedQuoteIsFresh ? `${Math.round(selectedDayRangeProgress)}%` : "—"}</b></header>
              <div><i style={{ left: `${selectedDayRangeProgress}%` }} /></div>
              <footer><span>L {selectedDayLow ? selectedDayLow.toFixed(2) : "—"}</span><span>H {selectedDayHigh ? selectedDayHigh.toFixed(2) : "—"}</span></footer>
            </div>
            <div className="trade-journey" aria-label="Trading practice progress">
              <span className="complete"><i>1</i><b>Plan</b></span>
              <span className={selectedPosition.quantity > 0 ? "complete" : "active"}><i>2</i><b>Place</b></span>
              <span className={selectedPosition.quantity > 0 ? "active" : ""}><i>3</i><b>Review</b></span>
            </div>
            <div className="header-order-buttons"><button className="compact-sell" onClick={() => openOrderSheet("SELL")}>Sell <b>{verifiedLivePrice?.toFixed(2) ?? "—"}</b></button><button className="compact-buy" onClick={() => openOrderSheet("BUY")}>Buy <b>{verifiedLivePrice?.toFixed(2) ?? "—"}</b></button></div>
          </div>

          <div className="chart-controls">
            <div ref={desktopTradeSymbolPickerRef} className="desktop-chart-symbol trade-symbol-picker">
              <button className="desktop-symbol-trigger" onClick={() => setShowTradeSymbols((value) => !value)} aria-expanded={showTradeSymbols}>
                <span>{selected.symbol}</span><small>NSE</small><ChevronDown size={15} />
              </button>
              {selected.assetType !== "OPTION" && <button className={`chart-watchlist-star ${customWatchlists.some((list) => list.symbols.includes(selected.symbol)) ? "saved" : ""}`} onClick={() => openWatchlistPicker(selected)} aria-label={`Add ${selected.symbol} to a custom watchlist`}><Star size={15} fill={customWatchlists.some((list) => list.symbols.includes(selected.symbol)) ? "currentColor" : "none"} /></button>}
              {selected.assetType !== "OPTION" && fnoUnderlying?.instrumentKey === selected.instrumentKey && <button className="chart-derivatives-link" disabled={openingUnderlyingKey === fnoUnderlying.instrumentKey} onClick={() => void openFnoUnderlying(fnoUnderlying)} aria-label={`Open ${selected.symbol} option charts`}><Link2 size={16} /></button>}
              {showTradeSymbols && <div className="trade-symbol-menu desktop-symbol-menu">
                <label><Search size={16} /><input value={tradeSymbolSearch} onChange={(event) => setTradeSymbolSearch(event.target.value)} placeholder="Search all NSE symbols" /></label>
                <div>{tradeSymbolMatches.map((item) => <button key={item.symbol} onClick={() => chooseTradeInstrument(item)}><span><b>{item.symbol}</b><small>{item.name}</small></span><em>NSE</em></button>)}{!tradeSymbolMatches.length && <p>No matching NSE stock.</p>}</div>
              </div>}
            </div>
            <CompactSelectorButton label="Functions" value={`${activeIndicatorCount} active`} className={showChartFunctions ? "active" : ""} onClick={() => { setShowTimeframeMenu(false); setShowChartFunctions(true); }} />
            <CompactSelectorButton label="Timeframe" value={timeframe} className={showTimeframeMenu ? "active" : ""} onClick={() => { setShowChartFunctions(false); setShowTimeframeMenu(true); }} />
            <button type="button" className="trade-risk-promise" onClick={() => activateRiskTool("BUY")} title="Prepare a risk-first paper trade"><ShieldCheck size={15} /><span><small>RISK FIRST</small><b>₹2K SL · ₹3K target</b></span></button>
            <button type="button" className={`desktop-live-pnl ${selectedPosition.quantity > 0 && selectedQuoteIsFresh ? "visible" : ""}`} onClick={() => setPositionsOpen(true)}>
              <span>Live P&amp;L</span><b className={selectedPosition.unrealizedPnl >= 0 ? "positive" : "negative"}>{selectedPosition.quantity > 0 && selectedQuoteIsFresh ? `${selectedPosition.unrealizedPnl >= 0 ? "+" : ""}${formatInr(selectedPosition.unrealizedPnl)}` : formatInr(0)}</b>
            </button>
            <div className="chart-control-orders"><button className="compact-sell" onClick={() => openOrderSheet("SELL")}>Sell <b>{verifiedLivePrice?.toFixed(2) ?? "—"}</b></button><button className="compact-buy" onClick={() => openOrderSheet("BUY")}>Buy <b>{verifiedLivePrice?.toFixed(2) ?? "—"}</b></button></div>
          </div>
          </section>

          <div className="chart-body">
            <ChartDrawingToolbar
              activeTool={activeTool}
              magnet={magnet}
              locked={drawingsLocked}
              hidden={hiddenDrawings}
              collapsed={tradeToolbarCollapsed}
              onToggleCollapsed={() => setTradeToolbarCollapsed((value) => !value)}
              onSelect={(tool) => { setActiveTool(tool); setToolSignal((value) => value + 1); }}
              onAllTools={() => setShowDrawingLibrary(true)}
              onToggleMagnet={() => setMagnet((value) => !value)}
              onUndo={() => setUndoSignal((value) => value + 1)}
              onRedo={() => setRedoSignal((value) => value + 1)}
              onToggleLock={() => setDrawingsLocked((value) => !value)}
              onToggleHidden={() => setHiddenDrawings((value) => !value)}
              onClear={() => setClearSignal((value) => value + 1)}
            />
            {showDrawingLibrary && <DrawingToolLibrary activeTool={activeTool} onSelect={(tool) => { setActiveTool(tool); setToolSignal((value) => value + 1); }} onClose={() => setShowDrawingLibrary(false)} />}
            {showChartFunctions && <ChartFunctionMenu indicators={indicators} onToggleIndicator={toggleIndicator} onAction={(type: ChartAction) => setChartAction((current) => ({ type, token: (current?.token ?? 0) + 1 }))} onClose={() => setShowChartFunctions(false)} />}
            {showTimeframeMenu && <ChartTimeframeMenu current={timeframe} onSelect={(period) => { setTimeframe(period); setShowTimeframeMenu(false); }} onClose={() => setShowTimeframeMenu(false)} />}
            {selected.assetType === "OPTION" && spotInstrument ? (
              <div className="fno-chart-underlay" />
            ) : (
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
                tradeMarkers={selectedTradeMarkers}
                onChartTap={() => setChartTradeFooterOpen((value) => !value)}
                orderTool={{ enabled: activeRiskToolEnabled, side: riskToolSide, entryPrice: riskEntryPrice, targetPrice: chartTargetPrice, stopLossPrice: chartStopLossPrice, quantity: riskDisplayQuantity }}
                onOrderToolChange={updateChartRiskLevel}
                onOrderToolClose={selectedProtection ? undefined : () => setRiskToolEnabled(false)}
                onOrderToolExit={selectedPosition.quantity > 0 ? () => exitPosition(selectedPosition.quantity) : undefined}
                onPrice={handleChartPrice}
                onDrawingComplete={() => setActiveTool("cursor")}
                onFeedStatus={handleFeedStatus}
              />
            )}
          </div>
          <div className={`chart-statusbar feed-${feedStatus.mode}`} title={feedStatus.mode === "error" ? feedStatus.message : undefined}>
            <div className={`chart-status-live-pnl ${selectedPosition.quantity > 0 && selectedQuoteIsFresh ? "visible" : ""}`}>
              {selectedPosition.quantity > 0 && selectedQuoteIsFresh ? <><Radio size={12} /><span>Live P&amp;L</span><b className={selectedPosition.unrealizedPnl >= 0 ? "positive" : "negative"}>{selectedPosition.unrealizedPnl >= 0 ? "+" : ""}{formatInr(selectedPosition.unrealizedPnl)}</b></> : null}
            </div>
            <div className="chart-feed-warning">{feedStatus.mode === "error" ? feedStatus.message : ""}</div>
            <div>{clock ? `India · ${clock.toLocaleDateString("en-IN")} · ${clock.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })} IST` : "India · IST"}</div>
          </div>
          <div className={`chart-trade-footer ${chartTradeFooterOpen ? "" : "trade-footer-hidden"}`} aria-hidden={!chartTradeFooterOpen}>
            <div className="chart-trade-buttons">
              <button className="sell" onClick={() => openOrderSheet("SELL")}><span>Sell</span><b>{verifiedLivePrice?.toFixed(2) ?? "—"}</b></button>
              <button className="buy" onClick={() => openOrderSheet("BUY")}><span>Buy</span><b>{verifiedLivePrice?.toFixed(2) ?? "—"}</b></button>
            </div>
            <button className="chart-positions-trigger" onClick={() => setPositionsOpen(true)}>
              <span>{selected.assetType === "OPTION" ? "F&O" : "Stocks"} <ChevronDown size={14} /></span>
              <b className={totalOpenPnl >= 0 ? "positive" : "negative"}>{totalOpenPnl >= 0 ? "+" : ""}{formatInr(totalOpenPnl)}</b>
            </button>
          </div>
        </section>

        {orderSheetOpen && <button className="order-sheet-backdrop" aria-label="Close paper order" onClick={() => setOrderSheetOpen(false)} />}
        <button type="button" className="desktop-order-panel-toggle" onClick={() => setDesktopOrderPanelOpen((value) => !value)} aria-label={desktopOrderPanelOpen ? "Hide paper order panel" : "Show paper order panel"} title={desktopOrderPanelOpen ? "Hide paper order panel" : "Show paper order panel"}><ChevronRight size={16} /></button>
        <aside className={`order-ticket ${orderSheetOpen ? "mobile-open" : ""}`}>
          <button className="mobile-order-close icon-button" onClick={() => setOrderSheetOpen(false)} aria-label="Close paper order"><X size={20} /></button>
          <div className="ticket-heading"><div><span className="eyebrow">{selected.assetType === "OPTION" ? `Paper option · ${selected.optionType}` : "Paper order"}</span><h2>{selected.symbol}</h2>{selected.assetType === "OPTION" && <small className="contract-summary">Expiry {selected.expiry} · lot size {selected.lotSize}</small>}</div><span className="paper-badge">No real money</span></div>
          <div className="side-switch"><button className={side === "BUY" ? "buy-active" : ""} onClick={() => activateRiskTool("BUY")}>Buy</button><button className={side === "SELL" ? "sell-active" : ""} disabled={isCashDeliveryOrder && deliveryHoldingQuantity <= 0} title={isCashDeliveryOrder && deliveryHoldingQuantity <= 0 ? "Buy delivery shares before selling" : undefined} onClick={() => activateRiskTool("SELL")}>Sell</button></div>
          <div className="order-type-tabs">{["Market", "Limit", "SL"].map((type) => <button key={type} className={orderType === type ? "active" : ""} onClick={() => setOrderType(type)}>{type}</button>)}</div>
          <div className="input-grid">
            <label>{selected.assetType === "OPTION" ? "Quantity (lot multiples)" : "Quantity"}<div className="stepper"><button onClick={() => setQuantityInput(String(Math.max(quantityStep, quantity - quantityStep)))}><Minus size={15} /></button><input type="text" inputMode="numeric" value={quantityInput} onFocus={(event) => event.currentTarget.select()} onChange={(event) => setQuantityInput(event.target.value.replace(/\D/g, ""))} onBlur={() => setQuantityInput(String(selected.assetType === "OPTION" ? Math.max(quantityStep, Math.round(quantity / quantityStep) * quantityStep) : quantity))} aria-label="Order quantity" /><button onClick={() => setQuantityInput(String(quantity + quantityStep))}><Plus size={15} /></button></div>{selected.assetType === "OPTION" && <small className="lot-helper">{Number.isInteger(orderLots) ? orderLots : orderLots.toFixed(2)} lot{orderLots === 1 ? "" : "s"} · {quantityStep} units per lot</small>}</label>
            {orderType !== "Market" && <label>Price (₹)<input className="text-input" type="number" value={verifiedLivePrice?.toFixed(2) ?? ""} readOnly /></label>}
          </div>
          <div className="protection-grid">
            <label>Target (₹)<input type="number" min="0.01" step="0.05" value={targetPrice} onFocus={() => setRiskToolEnabled(true)} onChange={(event) => { setTargetPrice(event.target.value); setRiskToolEnabled(true); setRiskLevelsCustomized(true); }} placeholder={verifiedLivePrice ? (side === "BUY" ? `Above ${verifiedLivePrice.toFixed(2)}` : `Below ${verifiedLivePrice.toFixed(2)}`) : "Waiting for live price"} /></label>
            <label>Stop loss (₹)<input type="number" min="0.01" step="0.05" value={stopLossPrice} onFocus={() => setRiskToolEnabled(true)} onChange={(event) => { setStopLossPrice(event.target.value); setRiskToolEnabled(true); setRiskLevelsCustomized(true); }} placeholder={verifiedLivePrice ? (side === "BUY" ? `Below ${verifiedLivePrice.toFixed(2)}` : `Above ${verifiedLivePrice.toFixed(2)}`) : "Waiting for live price"} /></label>
            {selectedPosition.quantity > 0 && <button type="button" onClick={applyProtectionToOpenPosition}>Apply to open position</button>}
          </div>
          <div className="product-select"><label className={!intradayOrdersAllowed ? "disabled-product" : ""}><input type="radio" name="product" checked={product === "INTRADAY"} disabled={!intradayOrdersAllowed} onChange={() => setProduct("INTRADAY")} /><span><b>Intraday</b><small>{intradayOrdersAllowed ? "MIS · auto square-off" : "Closed · auto square-off 15:00 IST"}</small></span></label><label><input type="radio" name="product" checked={product === "DELIVERY"} onChange={() => { setProduct("DELIVERY"); if (selected.assetType !== "OPTION" && selected.assetType !== "FUTURE" && deliveryHoldingQuantity <= 0 && side === "SELL") activateRiskTool("BUY"); }} /><span><b>{selected.assetType === "OPTION" ? "Carry forward" : "Delivery"}</b><small>{selected.assetType === "OPTION" ? "NRML · until expiry" : "CNC · buy or sell holdings"}</small></span></label></div>
          <div className="margin-card"><div><span>Order value</span><b>{formatInr(orderValue)}</b></div><div><span>{isCashDeliveryOrder ? "Funds required" : "Est. margin"}</span><b>{formatInr(isCashDeliveryOrder ? estimatedFundsRequired : margin)}</b></div><div><span>{isCashDeliveryOrder ? "Est. delivery charges" : "Est. taxes & charges"}</span><b>{formatInr(estimatedOrderCharges.total)}</b></div><div><span>Available cash</span><b>{formatInr(balance)}</b></div></div>
          {selectedPosition.quantity > 0 && (
            <div className="ticket-live-position">
              <div><span>{selectedPosition.side} · {selectedPosition.quantity} units</span><b className={selectedPosition.unrealizedPnl >= 0 ? "positive" : "negative"}>{selectedPosition.unrealizedPnl >= 0 ? "+" : ""}{formatInr(selectedPosition.unrealizedPnl)}</b></div>
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
                <button disabled={!marketOrdersAllowed || (positionProduct === "INTRADAY" && !intradayOrdersAllowed)} onClick={() => exitPosition(safeExitQuantity)}>Exit {safeExitQuantity}</button>
                <button disabled={!marketOrdersAllowed || (positionProduct === "INTRADAY" && !intradayOrdersAllowed)} onClick={() => exitPosition(selectedPosition.quantity)}>Exit all</button>
              </div>
              {positionProduct === "INTRADAY" && !intradayOrdersAllowed && <small className="market-closed-note">{intradayStatusMessage}</small>}
            </div>
          )}
          <button disabled={!verifiedLivePrice || !marketOrdersAllowed || (product === "INTRADAY" && !intradayOrdersAllowed) || Boolean(deliverySellError)} className={`place-order ${side.toLowerCase()}`} onClick={placeOrder}>{!verifiedLivePrice ? "WAITING FOR UPSTOX" : !marketOrdersAllowed ? "MARKET CLOSED" : product === "INTRADAY" && !intradayOrdersAllowed ? "INTRADAY CLOSED" : deliverySellError ? deliveryHoldingQuantity > 0 ? `ONLY ${deliveryHoldingQuantity} HELD` : "BUY BEFORE DELIVERY SELL" : `${side} ${quantity} ${selected.symbol}`}<ChevronRight size={18} /></button>
          <p className="disclaimer"><Bot size={15} /> Simulation only. Orders are saved on this device and never reach an exchange.</p>
          <div className="recent-orders-mini">
            <div className="section-line"><b>Recent orders</b><button onClick={() => setOrdersOpen(true)}>View all</button></div>
            {todayOrders.slice(0, 3).map((order) => <div className="mini-order" key={order.id}><span className={order.side === "BUY" ? "buy-tag" : "sell-tag"}>{order.side}</span><button className="mini-order-symbol" onClick={() => openPositionChart(order.symbol)}><b>{order.symbol}</b><small>{order.quantity} × {order.price.toFixed(2)}</small></button><small>{order.time}</small></div>)}
            {!todayOrders.length && <div className="no-orders">Today&apos;s simulated trades will appear here.</div>}
          </div>
        </aside>
      </div>}

      {activeNavigationSection === "fno" && selected.assetType === "OPTION" && spotInstrument && fnoTopInstrument && (
        <FnoChartWorkspace
          topInstrument={fnoTopInstrument}
          topMode={fnoTopMode}
          canToggleFuture={Boolean(fnoFutureInstrument)}
          option={selected}
          timeframe={timeframe}
          topPrice={verifiedTopPrice}
          topChange={verifiedTopChange}
          optionPrice={verifiedLivePrice ?? selected.price}
          optionChange={selectedChange}
          splitPercent={optionSplitPercent}
          quantity={quantity}
          lotSize={quantityStep}
          margin={margin}
          tradeDockOpen={fnoTradeDockOpen}
          optionSwitching={fnoSwitchingOption}
          onToggleTradeDock={() => setFnoTradeDockOpen((value) => !value)}
          onSplitPointerDown={beginOptionSplitDrag}
          onOpenSymbols={() => setFnoListOpen(true)}
          onOptionChain={() => setOptionChainOpen(true)}
          onTimeframeChange={setTimeframe}
          onToggleTopMode={() => setFnoTopMode((current) => current === "SPOT" && fnoFutureInstrument ? "FUTURE" : "SPOT")}
          onToggleOptionType={() => void toggleFnoOptionType()}
          onQuantityChange={(nextQuantity) => setQuantityInput(String(nextQuantity))}
          onOpenOrder={(nextSide, mode) => { setOrderType(mode); openOrderSheet(nextSide); }}
          orderTool={{ enabled: activeRiskToolEnabled, side: riskToolSide, entryPrice: riskEntryPrice, targetPrice: chartTargetPrice, stopLossPrice: chartStopLossPrice, quantity: riskDisplayQuantity }}
          onOrderToolChange={updateChartRiskLevel}
          onOrderToolClose={selectedProtection ? undefined : () => setRiskToolEnabled(false)}
          onOrderToolExit={selectedPosition.quantity > 0 ? () => exitPosition(selectedPosition.quantity) : undefined}
          tradeMarkers={selectedTradeMarkers}
          onFeedStatus={handleFeedStatus}
          chartTheme={theme}
        />
      )}

      {activeNavigationSection === "fno" && fnoListOpen && <FnoListsWorkspace quotes={marketQuotes} starredSymbols={customWatchlistSymbols} onQuoteKeysChange={setFnoListQuoteKeys} onSelect={openFnoNormalChart} onStar={openFnoWatchlistPicker} onClose={() => {
        if (selected.assetType === "OPTION" && spotInstrument) setFnoListOpen(false);
        else closeFnoWorkspace();
      }} />}

      {homeOpen && <HomeWorkspace
        firstName={typeof user?.user_metadata?.full_name === "string" ? user.user_metadata.full_name : undefined}
        indices={LIVE_INDEX_TICKERS.map((item) => {
          const quote = marketQuotes[item.instrumentKey];
          const isFresh = Boolean(quote && clock && clock.getTime() - (marketQuoteUpdatedAt[item.instrumentKey] ?? 0) <= 45_000);
          return { label: item.label, price: quote?.lastPrice ?? null, points: quote?.netChange ?? null, changePercent: quote?.changePercent ?? null, live: isFresh && marketStatus.isOpen && feedStatus.mode === "live" };
        })}
        marketOpen={marketStatus.isOpen}
        feedLive={feedStatus.mode === "live"}
        balance={balance}
        todayPnl={currentDayPortfolioPnl}
        holdingsCount={holdings.length}
        openPositionsCount={openPositions.length}
        recentStocks={recentStocks}
        recentScanners={recentScanners}
        onOpenTrade={() => openNavigationSection("trade")}
        onOpenFno={() => openNavigationSection("fno")}
        onOpenMarkets={() => openNavigationSection("markets")}
        onOpenIpo={() => openNavigationSection("ipo")}
        onOpenWatchlist={() => openNavigationSection("watchlist")}
        onOpenHoldings={() => openNavigationSection("holdings")}
        onOpenOrders={() => { setHomeOpen(false); setPositionsOpen(true); }}
        onOpenPnl={() => openNavigationSection("pnl")}
        onOpenStock={(symbol) => {
          const instrument = stockUniverse.find((item) => item.symbol === symbol);
          openNavigationSection("trade");
          if (instrument) chooseTradeInstrument(instrument);
        }}
      />}

      <nav className="mobile-bottom-nav">
        <button className={activeNavigationSection === "home" ? "active" : ""} onClick={() => openNavigationSection("home")}><Home size={19} /><span>Home</span></button>
        <button className={activeNavigationSection === "trade" ? "active" : ""} onClick={() => openNavigationSection("trade")}><LineChart size={19} /><span>Trade</span></button>
        <button className={activeNavigationSection === "fno" ? "active" : ""} onClick={() => openNavigationSection("fno")}><CandlestickChart size={19} /><span>F&amp;O</span></button>
        <button className={activeNavigationSection === "markets" ? "active" : ""} onClick={() => openNavigationSection("markets")}><TrendingUp size={19} /><span>Markets</span></button>
        <button className={["holdings", "orders", "pnl"].includes(activeNavigationSection) ? "active" : ""} onClick={() => openNavigationSection("pnl")}><Activity size={19} /><span>Portfolio</span></button>
      </nav>

      {showApi && <ApiSettings onClose={() => setShowApi(false)} />}
      {holdingsOpen && (
        <div className="modal-backdrop navigation-page-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && window.innerWidth <= 760) setHoldingsOpen(false); }}>
          <section className="modal holdings-modal navigation-page" role="dialog" aria-modal="true" aria-label="Delivery holdings" onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-head"><div><span className="eyebrow">Paper portfolio</span><h2>Holdings</h2></div><button className="icon-button" onClick={() => setHoldingsOpen(false)} aria-label="Close holdings"><X size={20} /></button></div>
            <div className="holdings-layout">
              <section className="holdings-overview-card">
                <span className="holdings-asset-tab">Stocks</span>
                <div className="holdings-value-head"><span>Holdings ({holdings.length})</span><strong>{formatInr(holdingsSummary.current)}</strong></div>
                <div className="holdings-return-lines">
                  <div><span>1D returns</span><b className={holdingsSummary.dayPnl >= 0 ? "positive" : "negative"}>{holdingsSummary.dayPnl >= 0 ? "+" : ""}{formatInr(holdingsSummary.dayPnl)} ({holdingsDayReturnPercent.toFixed(2)}%)</b></div>
                  <div><span>Total returns</span><b className={holdingsSummary.pnl >= 0 ? "positive" : "negative"}>{holdingsSummary.pnl >= 0 ? "+" : ""}{formatInr(holdingsSummary.pnl)} ({holdingsTotalReturnPercent.toFixed(2)}%)</b></div>
                  <div><span>Invested</span><b>{formatInr(holdingsSummary.invested)}</b></div>
                  <div><span>Est. sell charges</span><b>{formatInr(holdingsSummary.exitCharges)}</b></div>
                </div>
              </section>
              <section className="holdings-list-card">
                <div className="holdings-list-title"><b>Your holdings</b><span /><span>Current (Invested)</span><span>Returns</span><span /></div>
              {holdings.map((holding) => {
                const instrument = tradingUniverse.find((item) => item.symbol === holding.symbol);
                const exitCharges = calculateInstrumentCharges(instrument ?? { assetType: "EQUITY" }, { side: "SELL", product: "DELIVERY", quantity: holding.quantity, price: holding.livePrice }).total;
                const holdingReturnPercent = holding.averagePrice > 0 ? (holding.livePrice - holding.averagePrice) / holding.averagePrice * 100 : 0;
                return <div className="holding-row" key={holding.symbol}>
                  <button className="holding-symbol" onClick={() => openPositionChart(holding.symbol)}><span className="symbol-avatar">{holding.symbol.slice(0, 2)}</span><span><b>{holding.symbol}</b><small>{holding.name}</small></span></button>
                  <span className="holding-quantity"><b>{holding.quantity} shares</b><small>Avg. {formatInr(holding.averagePrice)}</small></span>
                  <span className="holding-values"><b>{formatInr(holding.marketValue)}</b><small>({formatInr(holding.averagePrice * holding.quantity)})</small></span>
                  <span className="holding-return"><b className={holding.unrealizedPnl >= 0 ? "positive" : "negative"}>{holding.unrealizedPnl >= 0 ? "+" : ""}{formatInr(holding.unrealizedPnl)}</b><small className={holdingReturnPercent >= 0 ? "positive" : "negative"}>{holdingReturnPercent >= 0 ? "+" : ""}{holdingReturnPercent.toFixed(2)}% · fees {formatInr(exitCharges)}</small></span>
                  <button className="holding-sell" onClick={() => openHoldingSell(holding.symbol, holding.quantity)}>Sell</button>
                </div>;
              })}
              {!holdings.length && <div className="holdings-empty"><BriefcaseBusiness size={34} /><b>No delivery holdings</b><span>Buy a stock using Delivery (CNC) and it will appear here.</span><button onClick={() => openNavigationSection("trade")}>Explore stocks</button></div>}
              </section>
            </div>
          </section>
        </div>
      )}
      {ordersOpen && (
        <div className="modal-backdrop navigation-page-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && window.innerWidth <= 760) setOrdersOpen(false); }}>
          <section className="modal orders-modal navigation-page" role="dialog" aria-modal="true" aria-label="Paper orders" onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-head"><div><span className="eyebrow">Local account</span><h2>Paper order book</h2></div><button className="icon-button" onClick={() => setOrdersOpen(false)}><X size={20} /></button></div>
            <div className="order-table">
              <div className="order-row table-head"><span>Time</span><span>Symbol</span><span>Side</span><span>Qty</span><span>Price</span><span>Charges</span><span>Status</span></div>
              {todayOrders.map((order) => <div className="order-row" key={order.id}><span>{order.time}</span><button className="order-symbol-link" onClick={() => openPositionChart(order.symbol)}>{order.symbol}</button><span className={order.side === "BUY" ? "positive" : "negative"}>{order.side}</span><span>{order.quantity}</span><span>{formatInr(order.price)}</span><span>{formatInr(getOrderCharges(order).total)}</span><span className="complete-tag">{paperOrderStatusLabel(order)}</span></div>)}
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
                  <span><b>{position.symbol}</b><small>{position.name} · {position.product} · {position.quantity} units</small></span>
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
        <MarketsWorkspace
          stockUniverse={stockUniverse}
          quotes={marketQuotes}
          onQuoteKeysChange={setMarketScannerQuoteKeys}
          onSelectCash={(item, price) => { chooseTradeInstrument({ ...item, price }); setMarketsOpen(false); }}
          onClose={() => setMarketsOpen(false)}
          initialGroup={marketsInitialGroup}
          onGroupChange={setMarketsInitialGroup}
          onScannerViewed={rememberScanner}
        />
      )}
      {optionChainOpen && activeFnoUnderlying && (
        <OptionChainSheet
          key={`${activeFnoUnderlying.instrumentKey}-${selected.expiry ?? ""}`}
          underlying={activeFnoUnderlying}
          currentOption={selected}
          onSelect={chooseOptionTradeInstrument}
          onClose={() => setOptionChainOpen(false)}
        />
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
        <div className="modal-backdrop navigation-page-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && window.innerWidth <= 760) setPnlOpen(false); }}>
          <section className="modal pnl-modal navigation-page" role="dialog" aria-modal="true" aria-label="Paper trading profit and loss" onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-head"><div><span className="eyebrow">Complete trade record</span><h2>Profit &amp; loss</h2></div><button className="icon-button" onClick={() => setPnlOpen(false)} aria-label="Close profit and loss"><X size={20} /></button></div>
            <div className="pnl-stat-grid">
              <div><span>Net P&amp;L</span><b className={pnlStats.netPnl >= 0 ? "positive" : "negative"}>{pnlStats.netPnl >= 0 ? "+" : ""}{formatInr(pnlStats.netPnl)}</b></div>
              <div><span>Total trades</span><b>{closedTrades.length}</b></div>
              <div><span>Win rate</span><b>{pnlStats.winRate.toFixed(1)}%</b></div>
              <div><span>Total profit</span><b className="positive">{formatInr(pnlStats.totalProfit)}</b></div>
              <div><span>Total loss</span><b className="negative">{formatInr(pnlStats.totalLoss)}</b></div>
              <div><span>Taxes &amp; charges</span><b>{formatInr(pnlStats.totalCharges)}</b></div>
            </div>
            <div className="pnl-analysis-grid">
              <div className="pnl-calendar-card">
                <div className="pnl-calendar-head">
                  <span><b>Daily P&amp;L heat map</b><small>{pnlCalendar.monthTrades} trade{pnlCalendar.monthTrades === 1 ? "" : "s"} · <i className={pnlCalendar.monthPnl >= 0 ? "positive" : "negative"}>{pnlCalendar.monthPnl >= 0 ? "+" : ""}{formatInr(pnlCalendar.monthPnl)}</i></small></span>
                  <div className="pnl-calendar-selectors">
                    <label>Month<select value={pnlCalendarMonth} onChange={(event) => { setPnlCalendarMonth(Number(event.target.value)); setSelectedPnlDateKey(null); }}>{PNL_MONTHS.map((month, index) => <option key={month} value={index}>{month}</option>)}</select></label>
                    <label>Year<select value={pnlCalendarYear} onChange={(event) => { setPnlCalendarYear(Number(event.target.value)); setSelectedPnlDateKey(null); }}>{pnlCalendarYears.map((year) => <option key={year} value={year}>{year}</option>)}</select></label>
                  </div>
                </div>
                <div className="pnl-calendar-weekdays">{PNL_WEEKDAYS.map((day) => <span key={day}>{day}</span>)}</div>
                <div className="pnl-calendar-grid" aria-label={`${PNL_MONTHS[pnlCalendarMonth]} ${pnlCalendarYear} daily profit and loss heat map`}>
                  {Array.from({ length: pnlCalendar.firstWeekday }, (_, index) => <span className="pnl-calendar-blank" key={`blank-${index}`} />)}
                  {pnlCalendar.days.map((date) => <button type="button" className={`pnl-calendar-day ${date.status} ${date.today ? "today" : ""} ${selectedPnlDateKey === date.key ? "selected" : ""}`} key={date.key} title={date.result ? `${date.result.trades} trade${date.result.trades === 1 ? "" : "s"}: ${formatInr(date.result.pnl)}` : undefined} onClick={() => { setSelectedPnlDateKey(date.key); window.requestAnimationFrame(() => pnlTradeListRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })); }}><b>{date.day}</b>{date.result && <small>{compactCalendarPnl(date.result.pnl)}</small>}</button>)}
                </div>
                <div className="pnl-calendar-legend"><span className="profit">Profit</span><span className="loss">Loss</span></div>
              </div>
              <div className="pnl-visuals">
                <article className="pnl-equity-card">
                  <div><span><b>Equity curve</b><small>Net performance across completed trades</small></span><strong className={pnlStats.netPnl >= 0 ? "positive" : "negative"}>{pnlStats.netPnl >= 0 ? "+" : ""}{formatInr(pnlStats.netPnl)}</strong></div>
                  <svg viewBox="0 0 100 40" preserveAspectRatio="none" role="img" aria-label="Cumulative paper trading profit and loss">
                    <defs><linearGradient id="pnlEquityFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="currentColor" stopOpacity=".28" /><stop offset="100%" stopColor="currentColor" stopOpacity="0" /></linearGradient></defs>
                    <polygon points={pnlVisuals.equityAreaPoints} fill="url(#pnlEquityFill)" />
                    <polyline points={pnlVisuals.equityPoints} fill="none" stroke="currentColor" strokeWidth="1.35" vectorEffect="non-scaling-stroke" />
                  </svg>
                </article>
                <div className="pnl-performance-grid">
                  <article className="pnl-win-card"><div className="pnl-win-donut" style={{ background: `conic-gradient(var(--green) 0 ${pnlStats.winRate}%, var(--red) ${pnlStats.winRate}% 100%)` }}><span><b>{pnlStats.winRate.toFixed(0)}%</b><small>Win rate</small></span></div><div><span><i className="positive">{pnlVisuals.wins}</i> wins</span><span><i className="negative">{pnlVisuals.losses}</i> losses</span></div></article>
                  <article className="pnl-metric-card"><span>Profit factor</span><b>{Number.isFinite(pnlVisuals.profitFactor) ? pnlVisuals.profitFactor.toFixed(2) : "∞"}</b><small>Gross profit / gross loss</small></article>
                  <article className="pnl-metric-card"><span>Avg. win / loss</span><b><i className="positive">{formatInr(pnlVisuals.averageWin)}</i><em>/</em><i className="negative">{formatInr(pnlVisuals.averageLoss)}</i></b><small>Average result by outcome</small></article>
                  <article className="pnl-metric-card"><span>Expectancy</span><b className={pnlVisuals.expectancy >= 0 ? "positive" : "negative"}>{pnlVisuals.expectancy >= 0 ? "+" : ""}{formatInr(pnlVisuals.expectancy)}</b><small>Expected net P&amp;L per trade</small></article>
                  <article className="pnl-metric-card"><span>Max drawdown</span><b className="negative">{formatInr(pnlVisuals.maxDrawdown)}</b><small>Largest equity decline</small></article>
                  <article className="pnl-metric-card"><span>Best / worst</span><b><i className="positive">{formatInr(pnlVisuals.bestTrade)}</i><em>/</em><i className="negative">{formatInr(Math.abs(pnlVisuals.worstTrade))}</i></b><small>Single completed trade</small></article>
                </div>
              </div>
            </div>
            {selectedPnlDateKey && <div className="pnl-trade-list" ref={pnlTradeListRef}>
              <div className="pnl-history-filter"><b>{new Date(`${selectedPnlDateKey}T12:00:00+05:30`).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}</b><button type="button" onClick={() => setSelectedPnlDateKey(null)}>Hide trades</button></div>
              {visiblePnlTrades.map((trade) => {
                const menuOpen = pnlTradeMenuId === trade.id;
                const sourceOrders = trade.sourceOrderIds
                  .map((orderId) => paperOrdersById.get(orderId))
                  .filter((order): order is PaperOrder => Boolean(order))
                  .sort((first, second) => getPaperOrderTimestamp(first) - getPaperOrderTimestamp(second));
                const reviewInstrument = sourceOrders[0] ? instrumentFromPaperOrder(sourceOrders[0], tradingUniverse) : null;
                const reviewMarkers = sourceOrders
                  .map((order, index) => orderTradeMarker(order, index === sourceOrders.length - 1 ? "EXIT" : "ENTRY"))
                  .filter((marker) => marker.time > 0);
                return (
                  <div key={`${trade.id}-${trade.symbol}`} className={`pnl-trade-row ${menuOpen ? "selected" : ""}`} role="button" tabIndex={0} onClick={() => setPnlTradeMenuId(menuOpen ? null : trade.id)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") setPnlTradeMenuId(menuOpen ? null : trade.id); }}>
                    <span className={trade.netPnl >= 0 ? "win" : "loss"}>{trade.netPnl >= 0 ? "WIN" : "LOSS"}</span>
                    <span><b>{trade.symbol}</b><small>{trade.product} · {trade.quantity} units · {trade.closedAt ? new Date(trade.closedAt).toLocaleDateString("en-IN") : "Legacy trade"}</small></span>
                    <span><b className={trade.netPnl >= 0 ? "positive" : "negative"}>{trade.netPnl >= 0 ? "+" : ""}{formatInr(trade.netPnl)}</b><small>Charges {formatInr(trade.charges)}</small></span>
                    {!!sourceOrders.length && <div className="pnl-order-positions" onClick={(event) => event.stopPropagation()}>
                      <div className="pnl-order-positions-head"><b>Order book positions</b><small>{sourceOrders.length} execution{sourceOrders.length === 1 ? "" : "s"}</small></div>
                      {sourceOrders.map((order) => <button type="button" className="pnl-order-position" key={`${trade.id}-${order.id}`} onClick={() => openPaperOrderChart(order)}>
                        <span>{order.time}</span>
                        <span className="order-symbol-link">{order.symbol}</span>
                        <span className={order.side === "BUY" ? "positive" : "negative"}>{order.side}</span>
                        <span>{order.quantity}</span>
                        <span>{formatInr(order.price)}</span>
                        <span>{formatInr(getOrderCharges(order).total)}</span>
                        <span className="complete-tag">{paperOrderStatusLabel(order)}</span>
                      </button>)}
                    </div>}
                    {reviewInstrument && reviewMarkers.length > 0 && (
                      <div className="pnl-trade-review-chart" onClick={(event) => event.stopPropagation()}>
                        <div className="pnl-trade-review-head">
                          <span><b>Trade review</b><small>Entry and exit candles</small></span>
                          <button type="button" className="pnl-review-timeframe-trigger" onClick={() => setShowPnlReviewTimeframeMenu(true)}>
                            <small>Timeframe</small><b>{pnlReviewTimeframe}</b><ChevronDown size={13} />
                          </button>
                        </div>
                        <div className="pnl-trade-review-body">
                          <MarketChart
                            key={`review-${trade.id}-${reviewInstrument.instrumentKey}-${pnlReviewTimeframe}`}
                            instrument={reviewInstrument}
                            timeframe={pnlReviewTimeframe}
                            activeTool="cursor"
                            magnet={false}
                            hiddenDrawings
                            lockedDrawings
                            visibleBars={pnlReviewTimeframe === "1D" || pnlReviewTimeframe === "1W" || pnlReviewTimeframe === "1M" || pnlReviewTimeframe === "1Y" ? 72 : 46}
                            indicators={indicators}
                            chartTheme={theme}
                            tradeMarkers={reviewMarkers}
                            focusTradeMarkers
                            preservePageScroll
                            onFeedStatus={() => undefined}
                          />
                        </div>
                      </div>
                    )}
                    {menuOpen && <div className="pnl-trade-actions"><small>Delete only if this record was caused by incorrect data.</small><button type="button" onClick={(event) => { event.stopPropagation(); deleteClosedTrade(trade); }}><Trash2 size={14} /> Delete trade</button></div>}
                  </div>
                );
              })}
              {!visiblePnlTrades.length && <div className="positions-empty"><Activity size={30} /><b>No completed trades on this date</b><span>Choose another calendar date.</span></div>}
            </div>}
            {showPnlReviewTimeframeMenu && <ChartTimeframeMenu current={pnlReviewTimeframe} onSelect={(period) => { setPnlReviewTimeframe(period); setShowPnlReviewTimeframeMenu(false); }} onClose={() => setShowPnlReviewTimeframeMenu(false)} />}
            <p className="pnl-disclaimer">Charges are estimates using current Upstox NSE equity and option rates; actual margin and contract-note rounding can differ.</p>
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
      {downloadOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setDownloadOpen(false)}>
          <section className="modal download-modal" role="dialog" aria-modal="true" aria-label="Download PaperTrade IN mobile app" onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-head"><div><span className="eyebrow">Official mobile apps</span><h2>Take PaperTrade IN with you</h2></div><button className="icon-button" onClick={() => setDownloadOpen(false)} aria-label="Close app download"><X size={20} /></button></div>
            <div className="download-hero"><span><Smartphone size={30} /></span><div><b>PaperTrade IN mobile</b><small>Android APK + iPhone home-screen app · Paper trading only</small></div></div>
            <div className="download-trust">
              <ShieldCheck size={20} />
              <span><b>Download confidently from the official source</b><small>This file is served directly from <strong>papertrade.site</strong>. It connects to the same secure account and virtual portfolio as this website and cannot place real exchange orders.</small></span>
            </div>
            <div className="download-options">
              <article>
                <b>Android app</b>
                <small>Install the beta APK directly from the official website.</small>
                <a className="download-primary" href="/downloads/PaperTrade-IN-v1.10-beta.apk" download><Download size={18} /> Download Android APK</a>
              </article>
              <article>
                <b>iPhone / iPad app</b>
                <small>Open <strong>papertrade.site</strong> in Safari, tap Share, then choose <strong>Add to Home Screen</strong>. It opens like an iOS app and stays synced with your account.</small>
                <Link className="download-primary ios-install-link" href="/" onClick={() => setDownloadOpen(false)}><Smartphone size={18} /> Open iOS web app</Link>
              </article>
            </div>
            <div className="download-facts"><span><ShieldCheck size={15} /><b>Private sign-in</b><small>Google and Supabase handle authentication. The app never sees your Google password.</small></span><span><LockKeyhole size={15} /><b>Verifiable Android file</b><small>SHA-256 integrity fingerprint</small></span></div>
            <code className="download-hash">001A5768943CD533383A71815AF478C67FA96C6E03BC7AC322CE3E01163CF958</code>
            <p className="download-install-note">Android may ask you to allow installs from this browser because this beta is not yet distributed through Google Play. iOS does not allow direct APK/IPA installs from a website, so use Safari&apos;s Add to Home Screen option.</p>
          </section>
        </div>
      )}
      {feedbackOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setFeedbackOpen(false)}>
          <section className="modal feedback-modal" role="dialog" aria-modal="true" aria-label="Send suggestions for PaperTrade IN" onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-head"><div><span className="eyebrow">Help improve PaperTrade IN</span><h2>Send suggestions</h2></div><button className="icon-button" onClick={() => setFeedbackOpen(false)} aria-label="Close suggestions"><X size={20} /></button></div>
            <p className="feedback-intro">Tell us what feels missing, confusing, or useful for your paper-trading practice. Screenshots and feature ideas are welcome.</p>
            <div className="feedback-options">
              <button type="button" className="feedback-option" onClick={() => copySuggestionContact("@foujdars1", "WhatsApp contact")}>
                <span><MessageCircle size={19} /></span>
                <strong>WhatsApp</strong>
                <small>@foujdars1</small>
                <b>Copy</b>
              </button>
              <a className="feedback-option" href="https://t.me/foujdars" target="_blank" rel="noreferrer">
                <span><Send size={18} /></span>
                <strong>Telegram</strong>
                <small>@foujdars</small>
                <b>Open</b>
              </a>
              <a className="feedback-option" href="mailto:foudjars@gmail.com?subject=PaperTrade%20IN%20Suggestion">
                <span><Mail size={18} /></span>
                <strong>Email</strong>
                <small>foudjars@gmail.com</small>
                <b>Mail</b>
              </a>
            </div>
            <p className="feedback-note">Your broker credentials stay in your browser/app storage. Please do not share OTPs, access tokens, or API secrets in feedback.</p>
          </section>
        </div>
      )}
      {accountOpen && user && (
        <div className="modal-backdrop" role="presentation" onMouseDown={closeAccountModal}>
          <section className="modal account-modal" role="dialog" aria-modal="true" aria-label="Your PaperTrade account" onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-head"><div><span className="eyebrow">Secure account</span><h2>Your profile</h2></div><button className="icon-button" onClick={closeAccountModal} aria-label="Close account"><X size={20} /></button></div>
            <div className="account-profile">
              <span>{user.user_metadata?.avatar_url ? <Image unoptimized width={43} height={43} src={user.user_metadata.avatar_url as string} alt="" referrerPolicy="no-referrer" /> : <UserRound size={25} />}</span>
              <div><b>{(user.user_metadata?.full_name as string | undefined) ?? "Paper trader"}</b><small>{user.email}</small></div>
            </div>
            <div className={`account-sync sync-${syncStatus}`}>{syncStatus === "synced" ? <CheckCircle2 size={17} /> : <Cloud size={17} />}<span><b>{syncStatus === "synced" ? "Portfolio synced" : syncStatus === "saving" ? "Saving portfolio…" : syncStatus === "error" ? "Cloud setup required" : "Loading portfolio…"}</b><small>Virtual balance, orders, watchlists and preferences</small></span></div>
            <button className="signout-button" onClick={() => void signOut()}><LogOut size={17} /> Sign out</button>
            <div className="account-legal-links"><Link href="/privacy" target="_blank">Privacy</Link><Link href="/terms" target="_blank">Terms</Link><Link href="/delete-account" target="_blank">Delete account</Link></div>
            {!accountDeleteArmed ? (
              <button className="delete-account-button" onClick={() => setAccountDeleteArmed(true)}><Trash2 size={16} /> Delete account</button>
            ) : (
              <div className="account-delete-confirm">
                <b>Permanently delete this account?</b>
                <small>This removes your profile and synchronized portfolio. This cannot be undone.</small>
                <div><button type="button" onClick={() => { setAccountDeleteArmed(false); setAccountDeleteError(""); }}>Keep account</button><button type="button" disabled={accountDeleteWorking} onClick={() => void permanentlyDeleteAccount()}>{accountDeleteWorking ? "Deleting..." : "Delete forever"}</button></div>
              </div>
            )}
            {accountDeleteError && <p className="account-delete-error">{accountDeleteError}</p>}
          </section>
        </div>
      )}
      {toast && <div className="toast"><Target size={18} /> {toast}</div>}
    </main>
  );
}
