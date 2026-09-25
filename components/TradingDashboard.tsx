"use client";
import { holdingPerformance } from "@/lib/holding-performance";
import { CandleLoader } from "./CandleLoader";
import { useNseSession } from "./useNseSession";
import { TradeExecutionSummary } from "./TradeExecutionSummary";
import { TradeReviewDialog } from "./TradeReviewDialog";
import { StockLogo, StockLogoProvider } from "@/components/StockLogo";
import { TradeDeleteDialog } from "@/components/TradeDeleteDialog";
import { LongPressTradeRow } from "@/components/LongPressTradeRow";
import { TRANSIENT_BACK_EVENT, useTransientBack } from "@/components/useTransientBack";
import { prepareClosedTradeDeletion } from "@/lib/closed-trade-deletion";
import { readChartTimeframe, saveChartTimeframe } from "@/lib/chart-timeframe-preference";
import { ChartHistoryControls } from "./ChartHistoryControls";
import { candlesEqual, type ChartHistoryRequest } from "@/lib/chart-history";

import {
  Activity, CalendarDays, ChartNoAxesColumnIncreasing, ChartNoAxesCombined, Bot, BriefcaseBusiness, Cable, CandlestickChart, Check, CheckCircle2, ChevronDown, ChevronRight, Cloud, Home, StepBack,
  Download, LineChart, LockKeyhole, Link2, Minus, Moon, MoreHorizontal, Plus, Radio, Rocket, ShieldCheck, SlidersHorizontal, Smartphone, Sun,
  LogOut, Mail, MessageCircle, Search, Send, Star, Target, Trash2, UserRound,
  TrendingDown, Bookmark, Percent, Trophy, WalletCards, X, Pencil,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import Image from "next/image";
import Link from "next/link";
import { App as CapacitorApp } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { MarketChart, type ChartAction, type ChartActionRequest, type ChartIndicators, type ChartTradeMarker, type DrawingTool, type FeedStatus } from "@/components/MarketChart";
import { DrawingToolLibrary } from "@/components/DrawingToolLibrary";
import { ChartDrawingToolbar } from "@/components/ChartDrawingToolbar";
import { ChartFunctionMenu } from "@/components/ChartFunctionMenu";
import { ChartStyleMenu } from "@/components/ChartStyleMenu";
import { CompareSymbolPicker } from "@/components/CompareSymbolPicker";
import { CHART_TIMEFRAMES, ChartTimeframeMenu, CompactSelectorButton, WatchlistSelector } from "@/components/CompactSelectors";
import { MarketsWorkspace, type ScannerGroup } from "@/components/MarketsWorkspace";
import { MarketSectionTabs } from "@/components/MarketSectionTabs";
import { IpoWorkspace } from "@/components/IpoWorkspace";
import { PushNotificationBridge } from "./PushNotificationBridge";
import { SessionOpenAlerts } from "./SessionOpenAlerts";
import { readNotificationPreferences } from "@/lib/notification-preferences";
import { NotificationCenter } from "@/components/NotificationCenter";
import { homeOpenChange, positionAttention, type HomeAlertSnapshot, type HomeAlertRequest, type HomeAttention } from '@/lib/home-attention';
import { homePreferenceKey } from '@/lib/home-preferences';
import { DEFAULT_PNL_SCOPE } from '@/lib/pnl-analytics';
import { HomeWorkspace } from "@/components/HomeWorkspace";
import { GLOBAL_CHART_INSTRUMENTS, deltaOptionSymbolFromInstrumentKey, deltaSymbolFromInstrumentKey, isGlobalInstrumentKey, type PerpQuote, type PerpSymbol } from '@/lib/global-markets';
import { GlobalOptionTicket } from './GlobalOptionTicket';
import { optionPnl, freshOptionQuote, moveOptionChartLevel, closeOption } from '@/lib/global-option-orders';
import { positionPnl, freshPerpQuote, closePerp } from '@/lib/global-markets';
import { globalChartLevels, moveGlobalChartLevel } from '@/lib/global-chart-risk';
import { compareMarketInstruments } from '@/lib/market-directory';
import { triggerValue } from '@/lib/global-order-engine';
import { formatUsd } from '@/lib/global-order-engine';
import { availablePerpCash } from '@/lib/global-markets';
import { addPaperCash } from '@/lib/paper-wallets';
import { useGlobalTrading } from './useGlobalTrading';
import { GlobalOrderTicket, type GlobalTicketTab } from './GlobalOrderTicket';
import { PriceActions } from "@/components/PriceActions";
import { PnlAnalytics, type PnlTab } from "@/components/PnlAnalytics";
import { PNL_SCOPE_KEY, readPnlScope, writePreference } from "@/lib/interface-preferences";
import { filterPnlTrades, pnlDay, pnlOutcome, summarisePnl, type PnlScope } from "@/lib/pnl-analytics";
import { priceTaskError, type PriceRequest, type PriceTask } from "@/lib/price-actions";
import { OptionChainSheet } from "@/components/OptionChainSheet";
import { FnoChartWorkspace } from "@/components/FnoChartWorkspace";
import { FnoListsWorkspace } from "@/components/FnoListsWorkspace";
import { futureToInstrument, optionToInstrument, underlyingToInstrument, type FnoUnderlying } from "@/lib/fno";
import { defaultOptionSide, loadOptionChain, loadOptionExpiries, nearestAtmRow } from "@/lib/fno-client";
import { deriveNetChange, formatInr, formatSignedMarketMove, instruments, mergeInstrumentUniverse, type Candle, type Instrument } from "@/lib/market";
import { getNseMarketStatus, nseSquareOffMinute, type NseSession } from "@/lib/market-hours";
import {
  calculatePosition,
  getDeliveryHoldingQuantity,
  futureFillCashDelta,
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
import { buildClosedTrades, getOrderCharges, type ClosedTradeOutcome } from "@/lib/trade-analytics";
import { calculateUpstoxTradingCharges } from "@/lib/trading-charges";
import type { NormalizedQuote } from "@/lib/upstox";
import { openUpstoxLiveFeed } from "@/lib/upstox-live-feed";
import { useAuth } from "@/components/AuthProvider";
import { BrandMark } from "@/components/BrandMark";
import { usePersistentChartIndicators } from "@/lib/chart-indicator-preferences";
import { useChartPreference } from "@/lib/chart-view-preferences";
import { useToastNotice } from "./useToastNotice";
import { getNativeTradeAlert, type NativeTriggeredPriceAlert } from "@/lib/native-alert";
import { addPaperTradeNotification } from "@/lib/notification-center";
import { RiskSizingPlan } from "@/components/RiskSizingPlan";
import { BarReplayDialog } from "@/components/BarReplay";
import { TradingCoach, type CoachTab } from "@/components/TradingCoach";
import {
  buildOptionPayoff,
  calculateRiskBasedQuantity,
  DEFAULT_TRADING_LIMITS,
  evaluateTradingLimits,
  readTradingLimits,
  type OptionPayoffLeg,
  type TradingLimits,
} from "@/lib/trading-coach";

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
const UPSTOX_AUTO_SQUARE_OFF_HOUR = 15;
const UPSTOX_AUTO_SQUARE_OFF_MINUTE = 0;
const UPSTOX_AUTO_SQUARE_OFF_MINUTES = UPSTOX_AUTO_SQUARE_OFF_HOUR * 60 + UPSTOX_AUTO_SQUARE_OFF_MINUTE;
const UPSTOX_AUTO_SQUARE_OFF_POLICY = "UPSTOX_15_00_2026_02";
const LIVE_INDEX_TICKERS = [
  { label: "NIFTY 50", symbol: "NIFTY", name: "Nifty 50", instrumentKey: "NSE_INDEX|Nifty 50" },
  { label: "BANK NIFTY", symbol: "BANKNIFTY", name: "Nifty Bank", instrumentKey: "NSE_INDEX|Nifty Bank" },
  { label: "SENSEX", symbol: "SENSEX", name: "BSE Sensex", instrumentKey: "BSE_INDEX|SENSEX" },
] as const;
const SEARCHABLE_INDEX_TICKERS = [
  ...LIVE_INDEX_TICKERS,
  { label: "NIFTY NEXT 50", symbol: "NIFTYNXT50", name: "Nifty Next 50", instrumentKey: "NSE_INDEX|Nifty Next 50" },
  { label: "NIFTY 100", symbol: "NIFTY100", name: "Nifty 100", instrumentKey: "NSE_INDEX|Nifty 100" },
  { label: "NIFTY 200", symbol: "NIFTY200", name: "Nifty 200", instrumentKey: "NSE_INDEX|Nifty 200" },
  { label: "NIFTY 500", symbol: "NIFTY500", name: "Nifty 500", instrumentKey: "NSE_INDEX|Nifty 500" },
  { label: "FIN NIFTY", symbol: "FINNIFTY", name: "Nifty Fin Service", instrumentKey: "NSE_INDEX|Nifty Fin Service" },
  { label: "MIDCAP NIFTY", symbol: "MIDCPNIFTY", name: "Nifty Midcap Select", instrumentKey: "NSE_INDEX|NIFTY MID SELECT" },
  { label: "NIFTY IT", symbol: "NIFTYIT", name: "Nifty IT", instrumentKey: "NSE_INDEX|Nifty IT" },
  { label: "NIFTY AUTO", symbol: "NIFTYAUTO", name: "Nifty Auto", instrumentKey: "NSE_INDEX|Nifty Auto" },
  { label: "NIFTY FMCG", symbol: "NIFTYFMCG", name: "Nifty FMCG", instrumentKey: "NSE_INDEX|Nifty FMCG" },
  { label: "NIFTY METAL", symbol: "NIFTYMETAL", name: "Nifty Metal", instrumentKey: "NSE_INDEX|Nifty Metal" },
  { label: "NIFTY PHARMA", symbol: "NIFTYPHARMA", name: "Nifty Pharma", instrumentKey: "NSE_INDEX|Nifty Pharma" },
  { label: "NIFTY REALTY", symbol: "NIFTYREALTY", name: "Nifty Realty", instrumentKey: "NSE_INDEX|Nifty Realty" },
  { label: "NIFTY PSU BANK", symbol: "NIFTYPSUBANK", name: "Nifty PSU Bank", instrumentKey: "NSE_INDEX|Nifty PSU Bank" },
  { label: "NIFTY PRIVATE BANK", symbol: "NIFTYPVTBANK", name: "Nifty Private Bank", instrumentKey: "NSE_INDEX|Nifty Private Bank" },
] as const;
const DEFAULT_RISK_AMOUNT = 2_000;
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

function showProtectionAlert(order: PaperOrder, nativeAlreadyNotified = false) {
  if (typeof window === "undefined") return;
  const reason = order.exitReason === "TARGET" ? "Target reached" : "Stop-loss reached";
  const body = `${order.symbol}: ${order.quantity} unit${order.quantity === 1 ? "" : "s"} exited at ${formatInr(order.price)}.`;
  addPaperTradeNotification({ id: `trade-${order.id}`, kind: "trade", title: reason, body, symbol: order.symbol, instrumentKey: order.instrumentKey });
  const preferences = readNotificationPreferences();
  if (!preferences.trades || preferences.pausedUntil > Date.now() || nativeAlreadyNotified || document.visibilityState === "visible") return;
  if (Capacitor.getPlatform() === "android" && !nativeAlreadyNotified) {
    void getNativeTradeAlert().show({ title: `${order.symbol}: paper ${reason.toLowerCase()}`, body, kind: "trade", notificationId: `trade-${order.id}`, url: "/?screen=pnl" }).catch(() => undefined);
  } else if ("Notification" in window && Notification.permission === "granted") {
    const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", hourCycle: "h23" }).format(new Date()));
    new Notification(`PaperTrade IN - ${reason}`, { body: preferences.hideAmounts ? "Your paper-trade protection event is ready to review." : body, icon: "/papertrade-icon-192.png?v=1.22", tag: `papertrade-${order.id}`, silent: hour >= 21 || hour < 8 });
  }
}


type CustomWatchlist = {
  id: string;
  name: string;
  symbols: string[];
};

type NavigationSection = "home" | "trade" | "fno" | "watchlist" | "holdings" | "orders" | "markets" | "ipo" | "pnl";
type HomeCardId = "market" | "recent" | "portfolio";
type HomeCardPreferences = Record<HomeCardId, boolean>;
type UiDensity = "comfortable" | "compact";
type PnlHistoryFilter = ClosedTradeOutcome;
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
  if (order.exitReason === "EXPIRY") return "Paper expiry";
  if (order.autoSquareOff || order.exitReason === "AUTO_SQUARE_OFF") return "Auto exit";
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

function squareOffTimestamp(sessionDate: string, minute = UPSTOX_AUTO_SQUARE_OFF_MINUTES) {
  return Date.parse(`${sessionDate}T00:00:00+05:30`) + minute * 60_000;
}

function squareOffTimeLabel(timestamp: number) {
  return new Date(timestamp).toLocaleTimeString("en-IN", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

async function fetchSquareOffPrice(instrumentKey: string, sessionDate: string, minute = UPSTOX_AUTO_SQUARE_OFF_MINUTES) {
  const response = await fetch(`/api/upstox/candles?instrumentKey=${encodeURIComponent(instrumentKey)}&timeframe=1m&scope=combined`, { cache: "no-store" });
  const payload = await response.json() as { ok?: boolean; candles?: Candle[] };
  if (!response.ok || !payload.ok || !payload.candles?.length) return undefined;
  const sessionStart = Date.parse(`${sessionDate}T00:00:00+05:30`) / 1_000;
  const squareOffEnd = squareOffTimestamp(sessionDate, minute) / 1_000 + 59;
  const candle = payload.candles
    .filter((item) => Number(item.time) >= sessionStart && Number(item.time) <= squareOffEnd)
    .sort((a, b) => Number(a.time) - Number(b.time))
    .at(-1);
  return candle && Number.isFinite(candle.close) && candle.close > 0 ? candle.close : undefined;
}

function instrumentVenueLabel(instrument: Pick<Instrument, "exchange" | "instrumentKey">) {
  if (instrument.instrumentKey.startsWith("DELTA|")) return "DELTA";
  if (instrument.instrumentKey.startsWith("TVC|")) return "GLOBAL";
  return instrument.exchange;
}

function quoteFromPerp(symbol: PerpSymbol, quote: PerpQuote): NormalizedQuote {
  const previousClose = quote.change > -100 ? quote.last / (1 + quote.change / 100) : quote.last;
  const updatedAt = new Date(quote.at).toISOString();
  return {
    instrumentKey: `DELTA|${symbol}`,
    symbol,
    lastPrice: quote.last,
    netChange: quote.last - previousClose,
    changePercent: quote.change,
    open: previousClose,
    high: Math.max(previousClose, quote.last),
    low: Math.min(previousClose, quote.last),
    previousClose,
    lastTradeAt: updatedAt,
    updatedAt,
  };
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
  const exchangeSession = useNseSession();
  const { configured: authConfigured, user, syncStatus, signOut, deleteAccount } = useAuth();
  const userPreferenceKey = `${UI_PREFERENCES_STORAGE_KEY}:${user?.id ?? "guest"}`;
  const [selected, setSelected] = useState<Instrument>(instruments[0]);
  const globalTrading = useGlobalTrading(user?.id ?? "guest", deltaSymbolFromInstrumentKey(selected.instrumentKey), deltaOptionSymbolFromInstrumentKey(selected.instrumentKey));
  const [globalTicketTab, setGlobalTicketTab] = useState<GlobalTicketTab>("Order");
  const [stockUniverse, setStockUniverse] = useState<Instrument[]>(instruments);
  const [globalInstruments, setGlobalInstruments] = useState<Instrument[]>(GLOBAL_CHART_INSTRUMENTS);
  const [derivativeInstruments, setDerivativeInstruments] = useState<Instrument[]>([]);
  const [spotInstrument, setSpotInstrument] = useState<Instrument | null>(null);
  const [fnoUnderlying, setFnoUnderlying] = useState<FnoUnderlying | null>(null);
  const [fnoUnderlyings, setFnoUnderlyings] = useState<FnoUnderlying[]>([]);
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
  const [chartHistory, setChartHistory] = useState<ChartHistoryRequest>();
  useEffect(() => setChartHistory(undefined), [selected.instrumentKey]);
  const [chartPreferencesReady, setChartPreferencesReady] = useState(false);
  const chooseTimeframe = (period: string) => {
    if (!periods.includes(period)) return;
    setChartHistory(current => current?.years ? undefined : current);
    saveChartTimeframe(localStorage, user?.id ?? "guest", period);
    setTimeframe(period);
  };
  const pnlReviewTimeframe = timeframe;
  const [activeTool, setActiveTool] = useState<DrawingTool>("cursor");
  const [showDrawingLibrary, setShowDrawingLibrary] = useState(false);
  const [showChartFunctions, setShowChartFunctions] = useState(false);
  const [showTimeframeMenu, setShowTimeframeMenu] = useState(false);
  const [showChartStyleMenu, setShowChartStyleMenu] = useState(false);
  const [showComparePicker, setShowComparePicker] = useState(false);
  const [showWatchlistSelector, setShowWatchlistSelector] = useState(false);
  const [chartAction, setChartAction] = useState<ChartActionRequest>();
  const [drawingsLocked, setDrawingsLocked] = useState(false);
  const [undoSignal, setUndoSignal] = useState(0);
  const [redoSignal, setRedoSignal] = useState(0);
  const [toolSignal, setToolSignal] = useState(0);
  const [magnet, setMagnet] = useChartPreference("magnet");
  const [hiddenDrawings, setHiddenDrawings] = useChartPreference("hidden");
  const [chartStyle] = useChartPreference("chartStyle");
  const [comparedSymbols] = useChartPreference("comparedSymbols");
  const [priceActionsHost, setPriceActionsHost] = useState<HTMLDivElement | null>(null);
  const [chartIndicatorHost, setChartIndicatorHost] = useState<HTMLDivElement | null>(null);
  const [homeAlerts,setHomeAlerts]=useState<HomeAlertSnapshot>({ownerId:"",items:[]});
  const [homeAlertRequest,setHomeAlertRequest]=useState<HomeAlertRequest|null>(null);
  const [priceTasks, setPriceTasks] = useState<PriceTask[]>([]);
  const [fnoPriceActionsHost, setFnoPriceActionsHost] = useState<HTMLDivElement | null>(null);
  const [clearSignal, setClearSignal] = useState(0);
  const [side, setSide] = useState<"BUY" | "SELL">("BUY");
  const [theme, setTheme] = useState<"light" | "neon">("light");
  const isAndroidApp = useSyncExternalStore(subscribeToNativePlatform, getAndroidPlatformSnapshot, getServerAndroidPlatformSnapshot);
  const [quantityInput, setQuantityInput] = useState("1");
  const parsedQuantity = Number.parseInt(quantityInput, 10);
  const quantity = Number.isFinite(parsedQuantity) && parsedQuantity > 0 ? parsedQuantity : 1;
  const [targetPrice, setTargetPrice] = useState("");
  const [stopLossPrice, setStopLossPrice] = useState("");
  const [riskSizingOpen, setRiskSizingOpen] = useState(false);
  const [maxRiskInput, setMaxRiskInput] = useState("2000");
  const [tradeStrategy, setTradeStrategy] = useState("Breakout");
  const [tradeThesis, setTradeThesis] = useState("");
  const [tradeConfidence, setTradeConfidence] = useState(3);
  const [orderType, setOrderType] = useState("Market");
  const [priceRequest, setPriceRequest] = useState<PriceRequest | null>(null);
  const [product, setProduct] = useState<"INTRADAY" | "DELIVERY">("INTRADAY");
  const [indicators, setIndicators] = usePersistentChartIndicators(user?.id);
  const [exitQuantity, setExitQuantity] = useState("1");
  const [orders, setOrders] = useState<PaperOrder[]>([]);
  const [protections, setProtections] = useState<PaperProtection[]>([]);
  const [paperDataReady, setPaperDataReady] = useState(false);
  const [nativeProtectionTriggers, setNativeProtectionTriggers] = useState<NativeTriggeredPriceAlert[]>([]);
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
  const lastScannerGroupRef = useRef<"TRADING" | "INVESTMENT">("TRADING");
  useEffect(() => {
    if (marketsInitialGroup !== "IPO") lastScannerGroupRef.current = marketsInitialGroup;
  }, [marketsInitialGroup]);
  const [optionChainOpen, setOptionChainOpen] = useState(false);
  const [openingUnderlyingKey, setOpeningUnderlyingKey] = useState("");
  const [optionSplitPercent, setOptionSplitPercent] = useState(50);
  const [fnoTradeDockOpen, setFnoTradeDockOpen] = useState(false);
  const [workspaceMode, setWorkspaceMode] = useState<"trade" | "fno">("trade");
  const [fnoListOpen, setFnoListOpen] = useState(false);
  const [fnoListQuoteKeys, setFnoListQuoteKeys] = useState<string[]>([]);
  const [marketScannerQuoteKeys, setMarketScannerQuoteKeys] = useState<string[]>([]);
  const [tradeToolbarCollapsed, setTradeToolbarCollapsed] = useState(true);
  const [pnlOpen, setPnlOpen] = useState(false);
  const [pnlTradeMenuId, setPnlTradeMenuId] = useState<string | null>(null);
  const [tradeSelection, setTradeSelection] = useState<{ scope: string; ids: string[] } | null>(null);
  const [pendingDeleteIds, setPendingDeleteIds] = useState<string[] | null>(null);
  const [selectedPnlDateKey, setSelectedPnlDateKey] = useState<string | null>(null);
  const [pnlHistoryFilter, setPnlHistoryFilter] = useState<PnlHistoryFilter>("all");
  const [pnlHistoryOnly, setPnlHistoryOnly] = useState(false);
  const [pnlTab, setPnlTab] = useState<PnlTab>("overview");
  const [pnlScope, setPnlScope] = useState<PnlScope>(readPnlScope);
  const [pnlDrill, setPnlDrill] = useState<{ ids: string[]; label: string } | null>(null);
  const [fundsOpen, setFundsOpen] = useState(false);
  const [fundsCurrency, setFundsCurrency] = useState<"INR" | "USD">("INR");
  const [downloadOpen, setDownloadOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [coachOpen, setCoachOpen] = useState(false);
  const [replayInstrument, setReplayInstrument] = useState<Instrument | null>(null);
  const [replayReviewTimeframe, setReplayReviewTimeframe] = useState<string | null>(null);
  const toolkitBackRef = useRef<(() => void) | null>(null);
  useEffect(() => { toolkitBackRef.current = pendingDeleteIds ? () => setPendingDeleteIds(null) : replayInstrument ? () => { setReplayInstrument(null); setReplayReviewTimeframe(null); } : coachOpen ? () => setCoachOpen(false) : null; }, [pendingDeleteIds, replayInstrument, coachOpen]);
  const [coachTab, setCoachTab] = useState<CoachTab>("journal");
  const [tradingLimits, setTradingLimits] = useState<TradingLimits>(DEFAULT_TRADING_LIMITS);
  const [homeCards, setHomeCards] = useState<HomeCardPreferences>(DEFAULT_HOME_CARDS);
  const [uiDensity, setUiDensity] = useState<UiDensity>("comfortable");
  const [motionEnabled, setMotionEnabled] = useState(true);
  const [recentStocks, setRecentStocks] = useState<string[]>([]);
  const [recentScanners, setRecentScanners] = useState<string[]>([]);
  const [uiPreferencesReady, setUiPreferencesReady] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [accountDeleteArmed, setAccountDeleteArmed] = useState(false);
  const [accountDeleteWorking, setAccountDeleteWorking] = useState(false);
  useEffect(() => {
    const restore = window.setTimeout(() => setTradingLimits(readTradingLimits()), 0);
    return () => window.clearTimeout(restore);
  }, []);
  const [accountDeleteError, setAccountDeleteError] = useState("");
  const [fundsInput, setFundsInput] = useState("100000");
  const [showTradeSymbols, setShowTradeSymbols] = useState(false);
  const [tradeSymbolSearch, setTradeSymbolSearch] = useState("");
  const [toast, setToast] = useToastNotice();
  const [clock, setClock] = useState<Date | null>(null);
  const [feedStatus, setFeedStatus] = useState<FeedStatus>({
    mode: "loading",
    message: "Connecting to Upstox…",
  });
  const [marketQuotes, setMarketQuotes] = useState<Record<string, NormalizedQuote>>({});
  const [marketQuoteUpdatedAt, setMarketQuoteUpdatedAt] = useState<Record<string, number>>({});
  const [globalCandles, setGlobalCandles] = useState<Candle[] | undefined>();
  const globalCandleScopeRef = useRef("");
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
  const marketNavigationActive = activeNavigationSection === "markets" || activeNavigationSection === "watchlist";
  const tradeSymbolPickerRef = useRef<HTMLDivElement>(null);
  const desktopTradeSymbolPickerRef = useRef<HTMLDivElement>(null);
  const pnlTradeListRef = useRef<HTMLDivElement>(null);
  const pendingChartRestoreRef = useRef<{ symbol: string; timeframe: string } | null>({ symbol: "__PENDING__", timeframe: "5m" });
  const autoSquareOffInFlightRef = useRef(false);
  const autoSquareOffRetryAtRef = useRef(0);
  const futureExpiryInFlightRef = useRef(false);
  const futureExpiryRetryAtRef = useRef(0);
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
    const restoredTimeframe = timeframe;
    setSelected(fallback);
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
  }, [timeframe]);

  const returnToTradeFromBack = useCallback(() => {
    setTradeSelection(null);
    setPendingDeleteIds(null);
    setHomeOpen(true);
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
      setPaperDataReady(true);
    }, 0);
    return () => window.clearTimeout(restore);
  }, []);

  useEffect(() => {
    // Switching accounts must pause writes before the new user's preferences load.
    // eslint-disable-next-line react-hooks/set-state-in-effect
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
          density?: UiDensity;
          motionEnabled?: boolean;
          homeExperienceVersion?: number;
        };
        if (saved.watchlist) setWatchlist(saved.watchlist);
        if (saved.marketGroup === "TRADING" || saved.marketGroup === "INVESTMENT" || saved.marketGroup === "IPO") setMarketsInitialGroup(saved.marketGroup);
        setHomeCards({ ...DEFAULT_HOME_CARDS, ...(saved.homeCards ?? {}) });
        setRecentStocks(Array.isArray(saved.recentStocks) ? saved.recentStocks.slice(0, 6) : []);
        setRecentScanners(Array.isArray(saved.recentScanners) ? saved.recentScanners.slice(0, 4) : []);
        setUiDensity(saved.density === "compact" ? "compact" : "comfortable");
        setMotionEnabled(saved.motionEnabled !== false);
        // Normal launches begin at Home. The startup URL handler below still
        // honours explicit notification deep links to IPO or P&L.
        setHomeOpen(true);
        setSidebarOpen(false);
        setHoldingsOpen(false);
        setOrdersOpen(false);
        setMarketsOpen(false);
        setPnlOpen(false);
        setWorkspaceMode("trade");
        setFnoListOpen(false);
      } catch { /* Ignore malformed per-user interface preferences. */ }
      setUiPreferencesReady(true);
    }, 0);
    return () => window.clearTimeout(restore);
  }, [userPreferenceKey]);

  useEffect(() => {
    if (!uiPreferencesReady || !chartPreferencesReady) return;
    localStorage.setItem(userPreferenceKey, JSON.stringify({
      activeSection: activeNavigationSection,
      watchlist,
      timeframe,
      marketGroup: marketsInitialGroup,
      homeCards,
      recentStocks,
      recentScanners,
      density: uiDensity,
      motionEnabled,
      homeExperienceVersion: HOME_EXPERIENCE_VERSION,
    }));
  }, [activeNavigationSection, chartPreferencesReady, homeCards, marketsInitialGroup, motionEnabled, recentScanners, recentStocks, timeframe, uiDensity, uiPreferencesReady, userPreferenceKey, watchlist]);

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
      const requestedTimeframe = readChartTimeframe(localStorage, user?.id ?? "guest", queryTimeframe, savedChart.timeframe);

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
      if (savedChart.instrument?.instrumentKey && savedChart.instrument.assetType === "OPTION" && !isGlobalInstrumentKey(savedChart.instrument.instrumentKey)) {
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
      const requestedScreen = params.get("screen");
      if (requestedScreen === "ipo" || requestedScreen === "pnl") {
        openNavigationSection(requestedScreen);
        const cleanUrl = new URL(window.location.href);
        cleanUrl.searchParams.delete("screen");
        window.history.replaceState(window.history.state, "", cleanUrl);
      }
      const savedInstrumentSymbol = typeof savedChart.instrument?.symbol === "string" ? savedChart.instrument.symbol.toUpperCase() : "";
      if (requestedSymbol && savedInstrumentSymbol !== requestedSymbol) {
        const fallbackInstrument = [...instruments, ...GLOBAL_CHART_INSTRUMENTS].find((item) => item.symbol === requestedSymbol);
        if (fallbackInstrument) {
          setSelected(fallbackInstrument);
        }
      }
      setChartPreferencesReady(true);
    }, 0);
    return () => window.clearTimeout(applyRequestedChart);
  }, []);

  useEffect(() => {
    if (!chartPreferencesReady) return;
    const pending = pendingChartRestoreRef.current;
    if (pending && selected.symbol !== pending.symbol) return;
    pendingChartRestoreRef.current = null;
    localStorage.setItem(LAST_CHART_STORAGE_KEY, JSON.stringify({ symbol: selected.symbol, timeframe, instrument: selected, spotInstrument, fnoUnderlying, workspaceMode, fnoTopMode }));
  }, [chartPreferencesReady, fnoTopMode, fnoUnderlying, selected, spotInstrument, timeframe, workspaceMode]);

  useEffect(() => {
    if (!chartPreferencesReady) return;
    if (selected.assetType === "OPTION" || selected.assetType === "FUTURE") return;
    const selectedUnderlying = fnoUnderlying?.instrumentKey === selected.instrumentKey ? fnoUnderlying : undefined;
    localStorage.setItem(LAST_CASH_CHART_STORAGE_KEY, JSON.stringify({ instrument: selected, timeframe, fnoUnderlying: selectedUnderlying }));
  }, [chartPreferencesReady, fnoUnderlying, selected, timeframe]);

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
      if (toolkitBackRef.current) { toolkitBackRef.current(); return; }
      if (!window.dispatchEvent(new Event(TRANSIENT_BACK_EVENT, { cancelable: true }))) return;
      if (activeNavigationSectionRef.current !== "home") {
        exitBackDeadlineRef.current = 0;
        if (exitBackToastTimerRef.current !== null) window.clearTimeout(exitBackToastTimerRef.current);
        returnToTradeFromBackRef.current();
        setToast("");
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
      setWorkspaceMode("trade");
      setSpotInstrument(null);
      setFnoUnderlying(null);
      setFnoFutureInstrument(null);
      setFnoTopMode("SPOT");
      setOptionChainOpen(false);
      setFnoTradeDockOpen(false);
      setSidebarOpen(false);
    };
    window.addEventListener("popstate", restorePreviousChart);
    return () => window.removeEventListener("popstate", restorePreviousChart);
  }, [timeframe, workspaceMode]);

  useEffect(() => {
    if (!chartPreferencesReady) return;
    if (workspaceMode !== "trade" || selected.assetType === "OPTION" || selected.assetType === "FUTURE") return;
    const currentState = window.history.state ?? {};
    const url = new URL(window.location.href);
    url.searchParams.set("symbol", selected.symbol);
    url.searchParams.set("timeframe", timeframe);
    window.history.replaceState({ ...currentState, papertradeChart: { instrument: selected, timeframe } }, "", url);
  }, [chartPreferencesReady, selected, timeframe, workspaceMode]);

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
      setSelected((current) => [...merged, ...globalInstruments].find((item) => item.symbol === (requestedSymbol || current.symbol)) ?? current);
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

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/global-markets?mode=catalog", { signal: controller.signal })
      .then(async response => {
        const payload = await response.json() as { ok?: boolean; instruments?: Instrument[] };
        if (!response.ok || !payload.ok || !Array.isArray(payload.instruments)) return;
        const merged = [...new Map([...GLOBAL_CHART_INSTRUMENTS, ...payload.instruments].map(item => [item.instrumentKey, item])).values()];
        setGlobalInstruments(merged);
        const pending = pendingChartRestoreRef.current;
        if (pending) {
          const target = merged.find(item => item.symbol === pending.symbol);
          if (target) { setSelected(target); setSpotInstrument(null); setFnoUnderlying(null); setWorkspaceMode("trade"); }
        }
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/upstox/fno-underlyings", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json() as { ok?: boolean; underlyings?: FnoUnderlying[] };
        if (response.ok && payload.ok) setFnoUnderlyings(payload.underlyings ?? []);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

  const futureTradingDate = indiaDateKey(clock ?? new Date());
  const stockFutureInstruments = useMemo(() => fnoUnderlyings
    .filter((underlying) => underlying.underlyingType === "EQUITY")
    .flatMap((underlying) => (underlying.futures ?? []).filter((contract) => contract.expiry >= futureTradingDate).map((contract) => futureToInstrument(contract, underlying))), [fnoUnderlyings, futureTradingDate]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const customList = customWatchlists.find((list) => `custom:${list.id}` === watchlist);
    const standardList = watchlistTabs.find((tab) => tab === watchlist);
    const universe = customList
      ? [...new Map([...stockUniverse, ...derivativeInstruments, ...stockFutureInstruments, ...globalInstruments].map((item) => [item.instrumentKey, item])).values()]
      : term
        ? [...stockUniverse, ...stockFutureInstruments, ...globalInstruments]
        : stockUniverse;
    return universe.filter((item) => {
      const matchesList = Boolean(term)
        || customList?.symbols.includes(item.symbol)
        || standardList === "ALL NSE"
        || (standardList !== undefined && item.categories.includes(standardList));
      return matchesList && (!term || item.symbol.toLowerCase().includes(term) || item.name.toLowerCase().includes(term));
    });
  }, [customWatchlists, derivativeInstruments, globalInstruments, search, stockFutureInstruments, stockUniverse, watchlist]);
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
    return [...stockUniverse, ...stockFutureInstruments, ...globalInstruments]
      .filter((item) => !term || item.symbol.toLowerCase().includes(term) || item.name.toLowerCase().includes(term))
      .sort((a, b) => (term ? Number(isGlobalInstrumentKey(b.instrumentKey)) - Number(isGlobalInstrumentKey(a.instrumentKey)) : 0) || compareMarketInstruments(a, b))
      .slice(0, 120);
  }, [globalInstruments, stockFutureInstruments, stockUniverse, tradeSymbolSearch]);
  const positionSymbols = useMemo(() => [...new Set(orders.map((order) => order.symbol))].filter((symbol) => {
    const lastFill = orders.find((order) => order.symbol === symbol);
    return calculatePosition(orders, symbol, lastFill?.price ?? 0, "INTRADAY").quantity > 0 || calculatePosition(orders, symbol, lastFill?.price ?? 0, "DELIVERY").quantity > 0;
  }), [orders]);
  const visibleInstruments = filtered.slice(0, watchlistLimit);
  const tradingUniverse = useMemo(() => {
    const byKey = new Map<string, Instrument>();
    for (const item of [...stockUniverse, ...derivativeInstruments, ...stockFutureInstruments, ...globalInstruments]) byKey.set(item.instrumentKey, item);
    return [...byKey.values()];
  }, [derivativeInstruments, globalInstruments, stockFutureInstruments, stockUniverse]);

  useEffect(() => {
    if (!paperDataReady || !isAndroidApp) return;
    const alerts = protections.flatMap((protection) => {
      const instrument = tradingUniverse.find((item) => item.symbol === protection.symbol);
      if (!instrument?.instrumentKey) return [];
      return [{
        id: protection.id,
        symbol: protection.symbol,
        instrumentKey: instrument.instrumentKey,
        product: protection.product,
        side: protection.side,
        targetPrice: protection.targetPrice,
        stopLossPrice: protection.stopLossPrice,
      }];
    });
    void getNativeTradeAlert().setPriceAlerts({ alerts }).catch(() => undefined);
  }, [isAndroidApp, paperDataReady, protections, tradingUniverse]);

  useEffect(() => {
    if (!paperDataReady || !isAndroidApp) return;
    let disposed = false;
    let listener: { remove: () => Promise<void> } | undefined;
    const consume = async () => {
      const result = await getNativeTradeAlert().consumeTriggeredPriceAlerts().catch(() => undefined);
      const alerts = result?.alerts?.filter((item) => item
        && item.id
        && (item.trigger === "TARGET" || item.trigger === "STOP_LOSS")
        && Number.isFinite(item.triggeredPrice)
        && Number.isFinite(item.triggeredAt)) ?? [];
      if (!disposed && alerts.length) {
        setNativeProtectionTriggers((current) => [...new Map([...current, ...alerts].map((item) => [item.id, item])).values()]);
      }
    };
    void consume();
    void CapacitorApp.addListener("appStateChange", ({ isActive }) => { if (isActive) void consume(); }).then((handle) => {
      if (disposed) void handle.remove();
      else listener = handle;
    });
    return () => {
      disposed = true;
      if (listener) void listener.remove();
    };
  }, [isAndroidApp, paperDataReady]);

  const applyRealtimeQuote = useCallback((instrument: Instrument, price: number, timestampMs = Date.now()) => {
    if (!Number.isFinite(price) || price <= 0) return;
    const receivedAt = Date.now();
    const updatedAt = new Date(timestampMs).toISOString();
    setMarketQuotes((current) => {
      const previous = current[instrument.instrumentKey] ?? current[instrument.symbol];
      if (previous && Date.parse(previous.lastTradeAt) > timestampMs) return current;
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
  const handleChartPrice = useCallback((price: number, timestampMs: number) => {
    applyRealtimeQuote(selected, price, timestampMs);
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
    ].filter((value): value is string => Boolean(value) && !isGlobalInstrumentKey(value)))].slice(0, 500).join(","),
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
  const selectedFnoUnderlying = useMemo<FnoUnderlying | null>(() => {
    if (selected.assetType === "OPTION" || selected.assetType === "FUTURE") return null;
    if (fnoUnderlying?.instrumentKey === selected.instrumentKey || fnoUnderlying?.symbol === selected.symbol) return fnoUnderlying;
    return fnoUnderlyings.find((item) => item.instrumentKey === selected.instrumentKey || item.symbol === selected.symbol) ?? null;
  }, [fnoUnderlying, fnoUnderlyings, selected.assetType, selected.instrumentKey, selected.symbol]);

  const deltaQuoteSymbols = useMemo(
    () => [...new Set([
      deltaSymbolFromInstrumentKey(selected.instrumentKey) ?? deltaOptionSymbolFromInstrumentKey(selected.instrumentKey) ?? (selected.instrumentKey.startsWith("DELTA|") ? selected.symbol : null),
      deltaSymbolFromInstrumentKey(fnoTopInstrument?.instrumentKey),
      ...visibleInstruments.filter(item => deltaSymbolFromInstrumentKey(item.instrumentKey) || deltaOptionSymbolFromInstrumentKey(item.instrumentKey)).slice(0, 8).map((item) => deltaSymbolFromInstrumentKey(item.instrumentKey) ?? deltaOptionSymbolFromInstrumentKey(item.instrumentKey)),
      ...positionSymbols.map((symbol) => deltaSymbolFromInstrumentKey(tradingUniverse.find((item) => item.symbol === symbol)?.instrumentKey)),
    ].filter((value): value is PerpSymbol => Boolean(value)))].sort().join(","),
    [fnoTopInstrument?.instrumentKey, positionSymbols, selected.instrumentKey, tradingUniverse, visibleInstruments],
  );

  useEffect(() => {
    if (!deltaQuoteSymbols.length) return;
    const controller = new AbortController();
    let disposed = false;
    let requestInFlight = false;

    async function loadDeltaQuotes() {
      if (requestInFlight || document.visibilityState === "hidden") return;
      requestInFlight = true;
      try {
        const entries = await Promise.all(deltaQuoteSymbols.split(",").map(async (symbol) => {
          const response = await fetch(`/api/global-markets?symbol=${symbol}`, { cache: "no-store", signal: controller.signal });
          const payload = await response.json() as { ok?: boolean; quote?: PerpQuote };
          if (!response.ok || !payload.ok || !payload.quote) return null;
          return [symbol, quoteFromPerp(symbol, payload.quote)] as const;
        }));
        if (disposed) return;
        const receivedAt = Date.now();
        setMarketQuotes((current) => {
          const next = { ...current };
          for (const entry of entries) {
            if (!entry) continue;
            const [symbol, quote] = entry;
            next[quote.instrumentKey] = quote;
            next[symbol] = quote;
          }
          return next;
        });
        setMarketQuoteUpdatedAt((current) => {
          const next = { ...current };
          for (const entry of entries) {
            if (!entry) continue;
            const [symbol, quote] = entry;
            next[quote.instrumentKey] = receivedAt;
            next[symbol] = receivedAt;
          }
          return next;
        });
      } catch {
        // Keep the last verified quote visible while Delta is temporarily unavailable.
      } finally {
        requestInFlight = false;
      }
    }

    void loadDeltaQuotes();
    const interval = window.setInterval(() => void loadDeltaQuotes(), 5000);
    return () => {
      disposed = true;
      controller.abort();
      window.clearInterval(interval);
    };
  }, [deltaQuoteSymbols]);

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
          setMarketQuotes((current) => {
            const next = { ...current };
            for (const [key, quote] of Object.entries(payload.quotes ?? {})) {
              const previousTime = Date.parse(current[key]?.lastTradeAt ?? "");
              const incomingTime = Date.parse(quote.lastTradeAt ?? "");
              if (Number.isFinite(previousTime) && (!Number.isFinite(incomingTime) || incomingTime < previousTime)) continue;
              next[key] = quote;
            }
            return next;
          });
          const receivedAt = Date.now();
          setMarketQuoteUpdatedAt((current) => ({
            ...current,
            ...Object.fromEntries(Object.keys(payload.quotes ?? {}).map((key) => [key, receivedAt])),
          }));
          retryAt = 0;
        } else if (payload.error?.code === "RATE_LIMITED") {
          retryAt = Date.now() + Math.max(30, payload.error.retryAfterSeconds ?? 30) * 1_000;
          setToast("Upstox rate limit reached. Live trading is paused; retrying automatically.");
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
    const marketClock = getNseMarketStatus(clock, exchangeSession);
    const cutoffMinute = nseSquareOffMinute(clock, exchangeSession);
    const afterSquareOff = marketClock.isTradingDay && marketClock.minutesFromMidnight >= cutoffMinute;
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
      return [{ symbol, position, instrument, quote, sessionDate: carriedOver ? orderIndiaDate : currentIndiaDate, cutoffMinute: carriedOver ? UPSTOX_AUTO_SQUARE_OFF_MINUTES : cutoffMinute }];
    });
    if (!pending.length) return;
    autoSquareOffInFlightRef.current = true;
    void Promise.all(pending.map(async (item) => {
      let cutoffMinute = item.cutoffMinute;
      if (item.sessionDate !== currentIndiaDate) {
        const historical = await fetch(`/api/market/session?date=${item.sessionDate}`, { cache: "no-store" })
          .then(response => response.json()).catch(() => null) as { session?: NseSession } | null;
        if (!historical?.session?.sessions.length) return { ...item, resolvedPrice: undefined };
        cutoffMinute = nseSquareOffMinute(new Date(`${item.sessionDate}T00:00:00+05:30`), historical.session);
      }
      return { ...item, cutoffMinute, resolvedPrice: await fetchSquareOffPrice(item.instrument.instrumentKey, item.sessionDate, cutoffMinute).catch(() => undefined) };
    })).then((resolved) => {
      const automaticOrders: PaperOrder[] = [];
      let nextBalance = balance;
      resolved.forEach((item, index) => {
        const squareOffPrice = item.resolvedPrice;
        if (!squareOffPrice || !Number.isFinite(squareOffPrice) || squareOffPrice <= 0) return;
        const closingSide = item.position.side === "LONG" ? "SELL" : "BUY";
        const charges = calculateInstrumentCharges(item.instrument, { side: closingSide, product: "INTRADAY", quantity: item.position.quantity, price: squareOffPrice });
        const exitTimestamp = squareOffTimestamp(item.sessionDate, item.cutoffMinute);
        const automaticOrder: PaperOrder = {
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
          squareOffPolicy: "NSE_SESSION_30_MIN_V1",
          exitReason: "AUTO_SQUARE_OFF",
          priceSource: item.resolvedPrice ? "UPSTOX_CANDLE" : "UPSTOX_QUOTE",
          instrumentKey: item.instrument.instrumentKey,
          instrumentName: item.instrument.name,
          assetType: item.instrument.assetType,
          expiry: item.instrument.expiry,
          lotSize: item.instrument.lotSize,
          underlyingKey: item.instrument.underlyingKey,
          underlyingSymbol: item.instrument.underlyingSymbol,
        };
        if (item.instrument.assetType === "FUTURE") {
          automaticOrder.cashDelta = futureFillCashDelta([...automaticOrders, ...orders], automaticOrder).cashDelta;
          nextBalance += automaticOrder.cashDelta;
        } else {
          const releasedMargin = squareOffPrice * item.position.quantity * 0.2;
          nextBalance = closingSide === "SELL" ? nextBalance + releasedMargin - charges.total : nextBalance - releasedMargin - charges.total;
        }
        automaticOrders.push(automaticOrder);
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
      setToast(`${automaticOrders.length} intraday position${automaticOrders.length > 1 ? "s" : ""} auto squared off for the exchange session`);
    }).finally(() => {
      autoSquareOffInFlightRef.current = false;
    });
  }, [balance, clock, exchangeSession, marketQuotes, orders, tradingUniverse]);

  useEffect(() => {
    if (!clock || !orders.length || futureExpiryInFlightRef.current || autoSquareOffInFlightRef.current || Date.now() < futureExpiryRetryAtRef.current) return;
    const today = indiaDateKey(clock);
    const afterClose = getNseMarketStatus(clock).minutesFromMidnight >= 15 * 60 + 30;
    const candidates = [...new Set(orders.filter((order) => order.assetType === "FUTURE" && order.product === "DELIVERY" && order.expiry && order.underlyingKey).map((order) => order.symbol))]
      .flatMap((symbol) => {
        const contract = orders.find((order) => order.symbol === symbol && order.assetType === "FUTURE" && order.product === "DELIVERY" && order.expiry && order.underlyingKey);
        if (!contract?.expiry || !contract.underlyingKey || !(contract.expiry < today || (contract.expiry === today && afterClose))) return [];
        const position = calculatePosition(orders, symbol, contract.price, "DELIVERY");
        return position.quantity > 0 ? [{ contract, position }] : [];
      });
    if (!candidates.length) return;
    futureExpiryInFlightRef.current = true;
    void Promise.all(candidates.map(async ({ contract }) => {
      try {
        const response = await fetch(`/api/upstox/candles?instrumentKey=${encodeURIComponent(contract.underlyingKey!)}&timeframe=1D&scope=combined`, { cache: "no-store" });
        const payload = await response.json() as { ok?: boolean; candles?: Candle[] };
        const candle = response.ok && payload.ok ? payload.candles?.find((item) => indiaDateKey(item.time * 1000) === contract.expiry) : undefined;
        return { contract, price: candle?.close };
      } catch { return { contract, price: undefined }; }
    })).then((resolved) => {
      let nextOrders = readPaperOrders();
      const storedBalance = localStorage.getItem("papertrade-balance");
      const parsedBalance = Number(storedBalance);
      let nextBalance = storedBalance !== null && Number.isFinite(parsedBalance) ? parsedBalance : balance;
      const settled: PaperOrder[] = [];
      for (const { contract, price } of resolved) {
        if (!price || !Number.isFinite(price) || price <= 0 || !contract.expiry) continue;
        const position = calculatePosition(nextOrders, contract.symbol, price, "DELIVERY");
        if (!position.quantity) continue;
        const side = position.side === "LONG" ? "SELL" : "BUY";
        const at = Date.parse(`${contract.expiry}T15:30:00+05:30`);
        const charges = calculateUpstoxTradingCharges("FUTURE", { side, product: "DELIVERY", quantity: position.quantity, price });
        const fill: PaperOrder = { ...contract, id: `future-expiry:${contract.instrumentKey}:${contract.expiry}`, side, quantity: position.quantity, price, time: squareOffTimeLabel(at), createdAt: at, charges, exitReason: "EXPIRY", priceSource: "UPSTOX_CANDLE" };
        fill.cashDelta = futureFillCashDelta(nextOrders, fill).cashDelta;
        nextBalance += fill.cashDelta;
        nextOrders = [fill, ...nextOrders];
        settled.push(fill);
      }
      if (!settled.length) { futureExpiryRetryAtRef.current = Date.now() + 60_000; return; }
      writePaperOrders(nextOrders);
      localStorage.setItem("papertrade-balance", String(nextBalance));
      setOrders(nextOrders);
      setBalance(nextBalance);
      setProtections((current) => {
        const symbols = new Set(settled.map((item) => item.symbol));
        const remaining = current.filter((item) => !(item.product === "DELIVERY" && symbols.has(item.symbol)));
        writePaperProtections(remaining);
        return remaining;
      });
      setToast(`${settled.length} stock future${settled.length === 1 ? "" : "s"} paper-settled at the expiry-day stock close. No shares were delivered.`);
    }).finally(() => { futureExpiryInFlightRef.current = false; });
  }, [balance, clock, orders]);

  useEffect(() => {
    if (!orders.length || autoSquareOffRepairInFlightRef.current) return;
    const candidates = orders
      .filter((order) => order.autoSquareOff && order.exitReason === "AUTO_SQUARE_OFF" && order.squareOffPolicy !== UPSTOX_AUTO_SQUARE_OFF_POLICY && order.squareOffPolicy !== "NSE_SESSION_30_MIN_V1")
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
    }).finally(() => {
      autoSquareOffRepairInFlightRef.current = false;
    });
  }, [orders, tradingUniverse]);

  useEffect(() => {
    if (!clock || !orders.length || !protections.length) return;
    const nativeTriggersById = new Map(nativeProtectionTriggers.map((item) => [item.id, item]));
    if (!getNseMarketStatus(clock, exchangeSession).isOpen && !nativeTriggersById.size) return;
    const afterIntradaySquareOff = getNseMarketStatus(clock, exchangeSession).minutesFromMidnight >= nseSquareOffMinute(clock, exchangeSession);
    const triggeredOrders: PaperOrder[] = [];
    const clearedProtectionIds = new Set<string>();
    const nativeTriggeredOrderIds = new Set<string>();
    const consumedNativeTriggerIds = new Set<string>();
    let nextBalance = balance;

    protections.forEach((protection, index) => {
      const nativeTrigger = nativeTriggersById.get(protection.id);
      if (nativeTrigger) consumedNativeTriggerIds.add(protection.id);
      if (protection.product === "INTRADAY" && afterIntradaySquareOff && !nativeTrigger) return;
      const instrument = tradingUniverse.find((item) => item.symbol === protection.symbol);
      const quote = instrument ? marketQuotes[instrument.instrumentKey] ?? marketQuotes[protection.symbol] : marketQuotes[protection.symbol];
      const quoteKey = instrument && marketQuotes[instrument.instrumentKey] ? instrument.instrumentKey : protection.symbol;
      const quoteIsFresh = Boolean(nativeTrigger || (quote && clock.getTime() - (marketQuoteUpdatedAt[quoteKey] ?? 0) <= 45_000));
      const price = nativeTrigger?.triggeredPrice ?? quote?.lastPrice;
      const latestFill = orders.find((order) => order.symbol === protection.symbol && (order.product ?? "INTRADAY") === protection.product);
      const position = calculatePosition(orders, protection.symbol, price ?? latestFill?.price ?? Number.NaN, protection.product);
      if (!position.quantity || position.side === "FLAT" || position.side !== protection.side) {
        clearedProtectionIds.add(protection.id);
        return;
      }
      if (!quoteIsFresh || !price || !Number.isFinite(price)) return;
      const trigger = nativeTrigger?.trigger ?? getProtectionTrigger(protection, price);
      if (!trigger) return;
      const executionPrice = getProtectionExecutionPrice(protection, price, trigger);
      const closingSide = position.side === "LONG" ? "SELL" : "BUY";
      const charges = calculateInstrumentCharges(instrument ?? { assetType: "EQUITY" }, { side: closingSide, product: protection.product, quantity: position.quantity, price: executionPrice });
      const triggeredAt = nativeTrigger?.triggeredAt ?? clock.getTime();
      const triggeredDate = new Date(triggeredAt);
      const order: PaperOrder = {
        id: `${triggeredAt + 10_000 + index}`,
        symbol: protection.symbol,
        side: closingSide,
        quantity: position.quantity,
        price: executionPrice,
        status: "COMPLETE",
        time: triggeredDate.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "Asia/Kolkata" }),
        product: protection.product,
        createdAt: triggeredAt,
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
      if (instrument?.assetType === "FUTURE") order.cashDelta = futureFillCashDelta([...triggeredOrders, ...orders], order).cashDelta;
      triggeredOrders.push(order);
      if (nativeTrigger) nativeTriggeredOrderIds.add(order.id);
      clearedProtectionIds.add(protection.id);
      if (order.cashDelta !== undefined) nextBalance += order.cashDelta;
      else {
        const releasedCapital = paperOrderCapitalValue(instrument?.assetType ?? "EQUITY", protection.product, position.quantity, executionPrice);
        nextBalance = closingSide === "SELL" ? nextBalance + releasedCapital - charges.total : nextBalance - releasedCapital - charges.total;
      }
    });

    if (consumedNativeTriggerIds.size) {
      // Native trigger reconciliation must be atomic with the protective exit below.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setNativeProtectionTriggers((current) => current.filter((item) => !consumedNativeTriggerIds.has(item.id)));
    }
    if (!triggeredOrders.length && !clearedProtectionIds.size) return;
    const remainingProtections = protections.filter((item) => !clearedProtectionIds.has(item.id));
    // Protective exits are synchronized with the latest live quote.
    setProtections(remainingProtections);
    writePaperProtections(remainingProtections);
    if (!triggeredOrders.length) return;
    const nextOrders = [...triggeredOrders, ...orders];
    setOrders(nextOrders);
    setBalance(nextBalance);
    writePaperOrders(nextOrders);
    localStorage.setItem("papertrade-balance", String(nextBalance));
    const reasons = triggeredOrders.map((order) => order.exitReason === "TARGET" ? "target" : "stop loss");
    triggeredOrders.forEach((order) => showProtectionAlert(order, nativeTriggeredOrderIds.has(order.id)));
    const alertSummary = triggeredOrders.length === 1
      ? `${triggeredOrders[0].symbol} exited: ${triggeredOrders[0].exitReason === "TARGET" ? "target reached" : "stop-loss reached"} at ${formatInr(triggeredOrders[0].price)}`
      : `${triggeredOrders.length} positions exited by ${[...new Set(reasons)].join(" / ")}`;
    setToast(alertSummary);
  }, [balance, clock, exchangeSession, marketQuoteUpdatedAt, marketQuotes, nativeProtectionTriggers, orders, protections, selected.symbol, tradingUniverse]);
  const handleFeedStatus = useCallback((status: FeedStatus) => setFeedStatus(status), []);
  const selectedDeltaSymbol = deltaSymbolFromInstrumentKey(selected.instrumentKey);
  const selectedDeltaOption = deltaOptionSymbolFromInstrumentKey(selected.instrumentKey);
  const selectedDeltaDatedFuture = selected.instrumentKey.startsWith("DELTA|") && !selectedDeltaSymbol && !selectedDeltaOption;
  const selectedDeltaChartSymbol = selectedDeltaSymbol ?? selectedDeltaOption ?? (selectedDeltaDatedFuture ? selected.symbol : null);
  useEffect(() => {
    if (!selectedDeltaChartSymbol) {
      setGlobalCandles(undefined);
      return;
    }
    const controller = new AbortController();
    let retryTimer = 0;
    let running = false;
    setGlobalCandles([]);
    setFeedStatus({ mode: "loading", message: "Connecting to Delta..." });
    async function loadGlobalCandles() {
      if (running || document.hidden || controller.signal.aborted) return;
      running = true;
      try {
        const params = new URLSearchParams({ mode: "candles", symbol: selectedDeltaChartSymbol!, timeframe });
        const response = await fetch(`/api/global-markets?${params}`, { cache: "no-store", signal: controller.signal });
        const payload = await response.json() as { ok?: boolean; candles?: Candle[]; fetchedAt?: number; error?: string };
        if (!response.ok || !payload.ok || !payload.candles?.length) throw new Error(payload.error || "Delta candles are unavailable.");
        if (controller.signal.aborted) return;
        const nextCandles = payload.candles;
        globalCandleScopeRef.current = `${selectedDeltaChartSymbol}:${timeframe}`;
        setGlobalCandles(previous => previous?.length === nextCandles.length && previous.every((c, i) => candlesEqual(c, nextCandles[i])) ? previous : nextCandles);
        setFeedStatus({ mode: "live", message: "Delta Exchange India candles", updatedAt: payload.fetchedAt ? new Date(payload.fetchedAt).toISOString() : undefined });
      } catch (error) {
        if (controller.signal.aborted) return;
        setFeedStatus({ mode: "error", message: `${error instanceof Error ? error.message : "Delta candles are unavailable."} Chart paused` });
      } finally {
        running = false;
        if (!controller.signal.aborted) retryTimer = window.setTimeout(() => void loadGlobalCandles(), 15_000);
      }
    }
    void loadGlobalCandles();
    const resume = () => { if (!document.hidden) { window.clearTimeout(retryTimer); void loadGlobalCandles(); } };
    document.addEventListener("visibilitychange", resume);
    return () => {
      controller.abort();
      window.clearTimeout(retryTimer);
      document.removeEventListener("visibilitychange", resume);
    };
  }, [selectedDeltaChartSymbol, timeframe]);
  const selectedQuote = marketQuotes[selected.instrumentKey] ?? marketQuotes[selected.symbol];
  const selectedQuoteKey = marketQuotes[selected.instrumentKey] ? selected.instrumentKey : selected.symbol;
  const selectedVenueLabel = instrumentVenueLabel(selected);
  const selectedIsWatchOnly = selected.instrumentKey.startsWith("TVC|") || selectedDeltaDatedFuture;
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
  const orderEstimatePrice = verifiedLivePrice ?? selectedQuote?.lastPrice ?? selected.price;
  const orderValue = orderEstimatePrice * quantity;
  const quantityStep = selected.assetType === "OPTION" || selected.assetType === "FUTURE" ? Math.max(1, selected.lotSize ?? 1) : 1;
  const orderLots = selected.assetType === "OPTION" || selected.assetType === "FUTURE" ? quantity / quantityStep : 0;
  const margin = orderValue * 0.2;
  const isCashDeliveryOrder = product === "DELIVERY" && selected.assetType !== "OPTION" && selected.assetType !== "FUTURE";
  const estimatedFundsRequired = paperOrderCapitalValue(selected.assetType, product, quantity, orderEstimatePrice);
  const deliveryHoldingQuantity = getDeliveryHoldingQuantity(orders, selected.symbol);
  const deliverySellError = isCashDeliveryOrder && side === "SELL"
    ? validateDeliverySell(orders, selected.symbol, quantity)
    : null;
  const estimatedOrderCharges = calculateInstrumentCharges(selected, { side, product, quantity, price: orderEstimatePrice });
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
  const requestedTargetPrice = Number(targetPrice);
  const requestedStopLossPrice = Number(stopLossPrice);
  const chartTargetPrice = Number.isFinite(requestedTargetPrice) && requestedTargetPrice > 0
    ? requestedTargetPrice
    : 0;
  const chartStopLossPrice = Number.isFinite(requestedStopLossPrice) && requestedStopLossPrice > 0
    ? requestedStopLossPrice
    : 0;
  const activeRiskToolEnabled = selectedPosition.quantity > 0;

  useEffect(() => {
    const restoreProtection = window.setTimeout(() => {
      if (selectedProtection) {
        setTargetPrice(selectedProtection.targetPrice?.toFixed(2) ?? "");
        setStopLossPrice(selectedProtection.stopLossPrice?.toFixed(2) ?? "");
      } else {
        setTargetPrice("");
        setStopLossPrice("");
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
      quoteAvailable: Number.isFinite(positionLivePrice) && positionLivePrice > 0,
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
      dayPnl: summary.dayPnl + holdingPerformance(orders, holding.symbol, holding.livePrice, quote ? quote.lastPrice - quote.netChange : null, clock?.getTime() ?? Date.now()).dayPnl,
      exitCharges: summary.exitCharges + exitCharges,
    };
  }, { invested: 0, current: 0, pnl: 0, dayPnl: 0, exitCharges: 0 }), [holdings, marketQuotes, tradingUniverse, orders, clock]);
  const holdingsDayBase = holdingsSummary.current - holdingsSummary.dayPnl;
  const holdingsDayReturnPercent = holdingsDayBase > 0 ? holdingsSummary.dayPnl / holdingsDayBase * 100 : 0;
  const holdingsTotalReturnPercent = holdingsSummary.invested > 0 ? holdingsSummary.pnl / holdingsSummary.invested * 100 : 0;
  const marketStatus = useMemo(
    () => clock ? getNseMarketStatus(clock, exchangeSession) : { isOpen: false, message: "Checking NSE session…" },
    [clock, exchangeSession],
  );
  const intradayOrdersAllowed = Boolean(
    clock && marketStatus.isOpen && getNseMarketStatus(clock, exchangeSession).minutesFromMidnight < nseSquareOffMinute(clock, exchangeSession),
  );
  const marketOrdersAllowed = Boolean(clock && marketStatus.isOpen);
  const selectedMarketOrdersAllowed = selectedIsWatchOnly ? false : selectedDeltaChartSymbol ? selectedQuoteIsFresh : marketOrdersAllowed;
  const selectedOrderTicketAvailable = !selectedIsWatchOnly && selected.assetType !== "INDEX" && (selectedDeltaChartSymbol ? selectedQuoteIsFresh : true);
  const afterHoursDeliveryEstimate = orderEstimatePrice;
  const afterHoursDeliveryCanQueue = !selectedDeltaChartSymbol && !marketOrdersAllowed && product === "DELIVERY" && (selected.assetType === "EQUITY" || !selected.assetType) && Number.isFinite(afterHoursDeliveryEstimate) && afterHoursDeliveryEstimate > 0;
  const orderButtonPriceLabel = verifiedLivePrice?.toFixed(2) ?? (afterHoursDeliveryEstimate > 0 ? `${afterHoursDeliveryEstimate.toFixed(2)} est.` : "—");
  const selectedGlobalPosition = globalTrading.account?.positions.find(p => p.symbol === selectedDeltaSymbol);
  const selectedGlobalQuote = selectedDeltaSymbol ? globalTrading.snapshots[selectedDeltaSymbol]?.quote : undefined;
  const selectedOptionPosition = globalTrading.account?.optionPositions?.find(p => p.symbol === selectedDeltaOption);
  const selectedOptionQuote = selectedDeltaOption ? globalTrading.optionSnapshots[selectedDeltaOption]?.quote : undefined;
  const globalOpenPnl = (globalTrading.account?.positions.reduce((sum, p) => sum + (globalTrading.snapshots[p.symbol]?.quote ? positionPnl(p, globalTrading.snapshots[p.symbol]!.quote.mark) : 0), 0) ?? 0)
    + (globalTrading.account?.optionPositions?.reduce((sum, p) => sum + (globalTrading.optionSnapshots[p.symbol]?.quote ? optionPnl(p, globalTrading.optionSnapshots[p.symbol].quote.mark) : 0), 0) ?? 0);
  const chartPnl = selectedDeltaSymbol ? selectedGlobalPosition && selectedGlobalQuote ? positionPnl(selectedGlobalPosition, selectedGlobalQuote.mark) : 0 : selectedDeltaOption ? selectedOptionPosition && selectedOptionQuote ? optionPnl(selectedOptionPosition, selectedOptionQuote.mark) : 0 : selectedPosition.unrealizedPnl;
  const chartPnlVisible = selectedDeltaSymbol ? !!selectedGlobalPosition && freshPerpQuote(selectedGlobalQuote, globalTrading.clock) : selectedDeltaOption ? !!selectedOptionPosition && !!selectedOptionQuote : selectedPosition.quantity > 0 && selectedQuoteIsFresh;
  const chartPnlText = selectedDeltaSymbol || selectedDeltaOption ? formatUsd(chartPnl) : `${chartPnl >= 0 ? "+" : ""}${formatInr(chartPnl)}`;
  function openChartPositions() {
    if (selectedDeltaSymbol || selectedDeltaOption) { setGlobalTicketTab("Positions"); setOrderSheetOpen(true); setDesktopOrderPanelOpen(true); }
    else setPositionsOpen(true);
  }
  const intradayStatusMessage = marketStatus.isOpen && !intradayOrdersAllowed
    ? "Intraday entry is closed for this session’s auto square-off window"
    : marketStatus.message;
  const todayOrders = useMemo(() => {
    if (!clock) return [];
    const start = new Date(clock);
    start.setHours(0, 0, 0, 0);
    return orders.filter((order) => getPaperOrderTimestamp(order) >= start.getTime());
  }, [clock, orders]);
  const closedTrades = useMemo(() => buildClosedTrades(orders), [orders]);
  const maxRiskAmount = Number(maxRiskInput);
  const suggestedRiskQuantity = chartStopLossPrice > 0 ? calculateRiskBasedQuantity(visibleLivePrice, chartStopLossPrice, maxRiskAmount, quantityStep) : 0;
  const plannedRisk = chartStopLossPrice > 0 ? Math.abs(visibleLivePrice - chartStopLossPrice) * quantity : Number.NaN;
  const plannedReward = chartTargetPrice > 0 ? Math.abs(chartTargetPrice - visibleLivePrice) * quantity : Number.NaN;
  const rewardRiskRatio = plannedRisk > 0 ? plannedReward / plannedRisk : 0;
  const tradingLimitStatus = useMemo(() => evaluateTradingLimits(orders, closedTrades, tradingLimits, clock?.getTime() ?? 0), [clock, closedTrades, orders, tradingLimits]);
  const proposedOptionLeg: OptionPayoffLeg | null = selected.assetType === "OPTION" && selected.optionType && selected.strikePrice && visibleLivePrice > 0 ? {
    optionType: selected.optionType,
    side,
    strike: selected.strikePrice,
    premium: visibleLivePrice,
    quantity,
  } : null;
  const optionSpotPrice = topQuote?.lastPrice ?? spotInstrument?.price ?? selected.price;
  const singleOptionPayoff = proposedOptionLeg ? buildOptionPayoff([proposedOptionLeg], optionSpotPrice) : null;
  const orderReducesOpenPosition = selectedPosition.quantity > 0 && positionProduct === product && ((selectedPosition.side === "LONG" && side === "SELL") || (selectedPosition.side === "SHORT" && side === "BUY"));
  const homeStockOptions = useMemo(() => [...SEARCHABLE_INDEX_TICKERS.map((instrument) => {
    const quote = marketQuotes[instrument.instrumentKey] ?? marketQuotes[instrument.symbol];
    return { symbol: instrument.symbol, name: instrument.name, price: quote?.lastPrice ?? 0, changePercent: quote?.changePercent ?? 0, categories: ["INDEX"], instrumentKey: instrument.instrumentKey, assetType: "INDEX" as const };
  }), ...stockUniverse.filter((instrument) => instrument.assetType !== "INDEX" && instrument.assetType !== "OPTION" && instrument.assetType !== "FUTURE").map((instrument) => {
    const quote = marketQuotes[instrument.instrumentKey] ?? marketQuotes[instrument.symbol];
    return {
      symbol: instrument.symbol,
      name: instrument.name,
      price: quote?.lastPrice ?? instrument.price,
      changePercent: quote?.changePercent ?? instrument.change,
      categories: instrument.categories,
      instrumentKey: instrument.instrumentKey,
      assetType: "EQUITY" as const,
    };
  }), ...globalInstruments.map((instrument) => {
    const quote = marketQuotes[instrument.instrumentKey] ?? marketQuotes[instrument.symbol];
    return {
      symbol: instrument.symbol,
      name: instrument.name,
      price: quote?.lastPrice ?? instrument.price,
      changePercent: quote?.changePercent ?? instrument.change,
      categories: instrument.categories,
      instrumentKey: instrument.instrumentKey,
      assetType: instrument.assetType,
    };
  })], [globalInstruments, marketQuotes, stockUniverse]);
  const homeRiskSummary = useMemo(() => {
    const topHolding = holdings.reduce((largest, holding) => holding.marketValue > largest.marketValue ? holding : largest, { symbol: "—", marketValue: 0 });
    const topConcentration = holdingsSummary.current > 0 ? topHolding.marketValue / holdingsSummary.current * 100 : 0;
    return {
      exposure: holdings.every(p=>p.quoteAvailable) ? holdingsSummary.current : Number.NaN,
      topSymbol: topHolding.symbol,
      topConcentration,
      label: (topConcentration >= 40 ? "High" : topConcentration >= 25 ? "Moderate" : "Low") as "Low" | "Moderate" | "High",
    };
  }, [holdings, holdingsSummary.current]);
  const todayClosedPnl = useMemo(() => {
    if (!clock) return 0;
    const todayKey = indiaDateKey(clock);
    return closedTrades.filter((trade) => trade.closedAt > 0 && indiaDateKey(trade.closedAt) === todayKey).reduce((sum, trade) => sum + trade.netPnl, 0);
  }, [clock, closedTrades]);
  const homeOpenDayChange=useMemo(()=>homeOpenChange(orders,openPositions.map(p=>{
    const instrument=tradingUniverse.find(i=>i.symbol===p.symbol),quote=marketQuotes[instrument?.instrumentKey??p.symbol]??marketQuotes[p.symbol];
    return {symbol:p.symbol,product:p.product,price:p.quoteAvailable?p.livePrice:Number.NaN,previousClose:quote?.previousClose??null};
  }),clock?.getTime()??0),[orders,openPositions,tradingUniverse,marketQuotes,clock]);

  // Scheduled portfolio reviews are delivered by the server, never on app resume.
  const pnlToday = pnlDay(clock?.getTime() ?? Date.now());
  const pnlCalendarTrades = useMemo(() => filterPnlTrades(closedTrades, orders, pnlScope, Date.parse(`${pnlToday}T12:00:00+05:30`)), [closedTrades, orders, pnlScope, pnlToday]);
  const pnlScopedTrades = useMemo(() => selectedPnlDateKey ? pnlCalendarTrades.filter(trade => pnlDay(trade.closedAt) === selectedPnlDateKey) : pnlCalendarTrades, [pnlCalendarTrades, selectedPnlDateKey]);
  const pnlDrilledTrades = useMemo(() => pnlDrill ? pnlScopedTrades.filter(trade => pnlDrill.ids.includes(trade.id)) : pnlScopedTrades, [pnlScopedTrades, pnlDrill]);
  const pnlVisuals = useMemo(() => summarisePnl(pnlDrilledTrades), [pnlDrilledTrades]);
  const visiblePnlTrades = useMemo(() => pnlDrilledTrades.filter(trade => pnlHistoryFilter === "all" || pnlOutcome(trade.netPnl) === pnlHistoryFilter), [pnlDrilledTrades, pnlHistoryFilter]);
  const tradeSelectionScope = `${pnlOpen}:${selectedPnlDateKey}:${pnlHistoryFilter}:${JSON.stringify(pnlScope)}:${pnlDrill?.label ?? ""}:${pnlTab}`;
  const selectingTrades = tradeSelection?.scope === tradeSelectionScope;
  useTransientBack(pnlOpen, () => returnToTradeFromBackRef.current());
  useTransientBack(Boolean(selectingTrades && pnlOpen), () => setTradeSelection(null));
  useTransientBack(Boolean(pendingDeleteIds && pnlOpen), () => setPendingDeleteIds(null));
  const selectedTradeIds = selectingTrades ? visiblePnlTrades.filter((trade) => tradeSelection.ids.includes(trade.id)).map((trade) => trade.id) : [];
  const pendingDeletion = useMemo(() => pendingDeleteIds ? prepareClosedTradeDeletion(orders, pendingDeleteIds) : null, [orders, pendingDeleteIds]);
  function toggleTradeSelection(id: string) {
    setTradeSelection({ scope: tradeSelectionScope, ids: selectedTradeIds.includes(id) ? selectedTradeIds.filter((selectedId) => selectedId !== id) : [...selectedTradeIds, id] });
  }
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
  const requestedExitQuantity = Number.parseInt(exitQuantity, 10);
  const safeExitQuantity = selectedPosition.quantity > 0
    ? Math.min(Math.max(quantityStep, Math.floor((Number.isFinite(requestedExitQuantity) ? requestedExitQuantity : quantityStep) / quantityStep) * quantityStep), selectedPosition.quantity)
    : 1;

  function protectionValues() {
    const target = targetPrice.trim() ? Number(targetPrice) : undefined;
    const stopLoss = stopLossPrice.trim() ? Number(stopLossPrice) : undefined;
    return { target, stopLoss };
  }

  function activateRiskTool(nextSide: "BUY" | "SELL") {
    setSide(nextSide);
    const positionMatches = selectedPosition.quantity > 0 && positionProduct === product && selectedPosition.side === (nextSide === "BUY" ? "LONG" : "SHORT");
    // Opening a ticket never creates a target or stop loss.
    setTargetPrice(positionMatches ? selectedProtection?.targetPrice?.toFixed(2) ?? "" : "");
    setStopLossPrice(positionMatches ? selectedProtection?.stopLossPrice?.toFixed(2) ?? "" : "");
  }

  function updateChartRiskLevel(level: "target" | "stopLoss", value: number, committed: boolean) {
    if (selectedDeltaChartSymbol) {
      if (!committed) return;
      const symbol = selectedDeltaChartSymbol;
      let error = "Could not save protection. Please try again.";
      void globalTrading.transact((account, perps, options) => {
        try {
          const quote = selectedDeltaOption ? options[symbol]?.quote : perps[symbol]?.quote;
          if (!quote) throw new Error("Waiting for a fresh global quote.");
          return selectedDeltaOption ? moveOptionChartLevel(account, symbol, level, value, quote, Date.now()) : moveGlobalChartLevel(account, symbol, level, value, quote, Date.now());
        } catch (cause) { error = cause instanceof Error ? cause.message : error; throw cause; }
      }).then(saved => setToast(saved ? `${level === "target" ? "Target" : "Stop loss"} saved · ${symbol} · USD` : error));
      return;
    }
    if (!committed || selectedPosition.quantity <= 0 || selectedPosition.side === "FLAT") return;
    if (!verifiedLivePrice || !Number.isFinite(value) || value <= 0) {
      setToast("Live price unavailable. Protection was not placed.");
      return;
    }
    const direction = selectedPosition.side === "LONG" ? 1 : -1;
    const validSide = (value - verifiedLivePrice) * direction * (level === "target" ? 1 : -1) > 0;
    if (!validSide) {
      setToast("That level is already crossed by the live price. Choose a new level.");
      return;
    }
    const formatted = value.toFixed(2);
    if (level === "target") setTargetPrice(formatted);
    else setStopLossPrice(formatted);
    const nextTarget = level === "target" ? value : selectedProtection?.targetPrice;
    const nextStop = level === "stopLoss" ? value : selectedProtection?.stopLossPrice;
    saveProtection({
      id: selectedProtection?.id ?? `${new Date().getTime()}-chart-risk`,
      symbol: selected.symbol,
      product: positionProduct,
      side: selectedPosition.side,
      targetPrice: nextTarget,
      stopLossPrice: nextStop,
      createdAt: selectedProtection?.createdAt ?? new Date().getTime(),
    }, selected.symbol, positionProduct);
    setToast(`${level === "target" ? "Take profit" : "Stop loss"} paper order placed · ${selected.symbol} · ${selectedPosition.quantity} units at ${formatInr(value)}`);
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
  }

  function openFunds(currency: "INR" | "USD") {
    setFundsCurrency(currency);
    setFundsInput("");
    setFundsOpen(true);
  }

  function openHeaderWallet() {
    if (selectedDeltaChartSymbol && activeNavigationSection === "trade") { openFunds("USD"); return; }
    try {
      const saved = JSON.parse(localStorage.getItem(homePreferenceKey(user?.id ?? "guest")) ?? "null") as { market?: string } | null;
      openFunds(saved?.market === "global" ? "USD" : "INR");
    } catch { openFunds("INR"); }
  }

  function closeGlobalChartPosition() {
    const symbol = selectedDeltaChartSymbol;
    if (!symbol) return;
    let error = "Could not close this paper position. Please try again.";
    void globalTrading.transact((account, perps, options) => {
      try {
        if (selectedDeltaOption) {
          const p = account.optionPositions?.find(p => p.symbol === symbol), q = options[symbol]?.quote;
          if (!p || !q) throw new Error("Position or live option quote is unavailable.");
          return closeOption(account, symbol, q, p.contracts, Date.now());
        }
        const p = account.positions.find(p => p.symbol === symbol), q = perps[symbol]?.quote;
        if (!p || !q) throw new Error("Position or live quote is unavailable.");
        return closePerp(account, symbol, q, p.contracts, Date.now());
      } catch (cause) { error = cause instanceof Error ? cause.message : error; throw cause; }
    }).then(saved => setToast(saved ? `Paper position closed · ${symbol}` : error));
  }

  async function addVirtualFunds() {
    const requestedAmount = Number(fundsInput);
    try {
      if (fundsCurrency === "USD") {
        if (!globalTrading.account) throw new Error("Global wallet is still loading.");
        const ok = await globalTrading.transact(account => ({ ...account, wallet: addPaperCash(account.wallet, requestedAmount), revision: account.revision + 1 }));
        if (!ok) throw new Error("Dollar wallet could not be saved. Please try again.");
        setToast(`${formatUsd(requestedAmount)} added to your global practice wallet`);
      } else {
        const stored = Number(localStorage.getItem("papertrade-balance") ?? balance);
        const nextBalance = addPaperCash(stored, requestedAmount);
        localStorage.setItem("papertrade-balance", String(nextBalance));
        setBalance(nextBalance);
        setToast(`${formatInr(requestedAmount)} added to your Indian practice wallet`);
      }
      setFundsOpen(false);
    } catch (error) { setToast(error instanceof Error ? error.message : "Could not add practice cash."); }
  }

  function confirmClosedTradeDeletion() {
    if (!pendingDeleteIds) return;
    const deletion = prepareClosedTradeDeletion(orders, pendingDeleteIds);
    if (deletion.error || !deletion.removedOrders.length) return;
    const nextBalance = balance + deletion.balanceAdjustment;
    setOrders(deletion.orders);
    setBalance(nextBalance);
    writePaperOrders(deletion.orders);
    localStorage.setItem("papertrade-balance", String(nextBalance));
    const nextProtections = protections.filter((protection) => {
      const affected = deletion.trades.some((trade) => trade.symbol === protection.symbol && trade.product === protection.product);
      return !affected || calculatePosition(deletion.orders, protection.symbol, Number.NaN, protection.product).quantity !== 0;
    });
    setProtections(nextProtections);
    writePaperProtections(nextProtections);
    setPendingDeleteIds(null);
    setTradeSelection(null);
    setPnlTradeMenuId(null);
    setToast(`${deletion.trades.length} trade${deletion.trades.length === 1 ? "" : "s"} deleted and account totals recalculated`);
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
      return;
    }
    const error = protectionError(selectedPosition.side, verifiedLivePrice);
    if (error) {
      setToast(error);
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
  }

  function placeOrder() {
    if (isGlobalInstrumentKey(selected.instrumentKey)) { setOrderSheetOpen(true); setGlobalTicketTab("Order"); return; }
    if (orderType !== "Market") {
      setOrderSheetOpen(false);
      setPriceRequest({ instrument: selected, price: verifiedLivePrice ?? selected.price, mode: "order", side, orderType: orderType === "SL" ? "SL" : "Limit", quantity, product });
      return;
    }
    const currentSession = getNseMarketStatus(new Date(), exchangeSession);
    if (!selectedDeltaChartSymbol && !currentSession.isOpen && afterHoursDeliveryCanQueue) {
      if (!Number.isSafeInteger(quantity) || quantity < 1) { setToast("Enter a valid delivery quantity."); return; }
      setOrderSheetOpen(false);
      setPriceRequest({ instrument: selected, price: afterHoursDeliveryEstimate, mode: "order", side, orderType: "Market", quantity, product: "DELIVERY" });
      return;
    }
    if (!selectedDeltaSymbol && !currentSession.isOpen) { setToast(currentSession.message); return; }
    if (!Number.isFinite(quantity) || quantity < 1) return;
    if (tradingLimitStatus.blocked && !orderReducesOpenPosition) {
      setToast(tradingLimitStatus.reasons[0] || "A personal trading limit is active.");
      return;
    }
    if ((selected.assetType === "OPTION" || selected.assetType === "FUTURE") && quantity % quantityStep !== 0) {
      setToast(`F&O quantity must be a multiple of the ${quantityStep}-unit lot size.`);
      return;
    }
    if (selected.assetType === "FUTURE" && (!selected.expiry || selected.expiry < indiaDateKey(new Date()))) {
      setToast("This futures contract has expired. Choose an active expiry.");
      return;
    }
    const executionPrice = verifiedLivePrice;
    if (!executionPrice || !Number.isFinite(executionPrice) || executionPrice <= 0) {
      setToast(selectedDeltaSymbol ? "Live Delta price unavailable. Paper order was not placed." : "Live Upstox price unavailable. Paper order was not placed.");
      return;
    }
    if (selectedIsWatchOnly) {
      setToast("Brent is available as a watch-only global reference.");
      return;
    }
    if (!selectedDeltaSymbol) {
      if (!marketOrdersAllowed) {
        setToast(marketStatus.message);
        return;
      }
      if (product === "INTRADAY" && !intradayOrdersAllowed) {
        setToast(intradayStatusMessage);
        return;
      }
    }
    if (isCashDeliveryOrder && side === "SELL") {
      const sellError = validateDeliverySell(orders, selected.symbol, quantity);
      if (sellError) {
        setToast(sellError);
        return;
      }
    }
    const executionCharges = calculateInstrumentCharges(selected, { side, product, quantity, price: executionPrice });
    const executionCapital = paperOrderCapitalValue(selected.assetType, product, quantity, executionPrice);
    if (selected.assetType !== "FUTURE" && side === "BUY" && executionCapital + executionCharges.total > balance) {
      setToast(`Insufficient virtual cash. Required ${formatInr(executionCapital + executionCharges.total)}.`);
      return;
    }
    const intendedDirection = side === "BUY" ? "LONG" : "SHORT";
    const riskError = isCashDeliveryOrder && side === "SELL" ? null : protectionError(intendedDirection, executionPrice);
    if (riskError) {
      setToast(riskError);
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
      journalPlan: { strategy: tradeStrategy, thesis: tradeThesis.trim(), confidence: tradeConfidence },
    };
    const futureCash = selected.assetType === "FUTURE" ? futureFillCashDelta(orders, order) : null;
    const currentFuturePosition = futureCash ? calculatePosition(orders, selected.symbol, executionPrice, product) : null;
    const reducingFuture = !!currentFuturePosition && currentFuturePosition.quantity >= quantity &&
      ((currentFuturePosition.side === "LONG" && side === "SELL") || (currentFuturePosition.side === "SHORT" && side === "BUY"));
    if (futureCash && balance + futureCash.cashDelta < 0 && !reducingFuture) {
      setToast(`Insufficient virtual cash for estimated futures margin. Required ${formatInr(-futureCash.cashDelta)}.`);
      return;
    }
    if (futureCash) order.cashDelta = futureCash.cashDelta;
    const nextOrders = [order, ...orders];
    const nextBalance = futureCash ? balance + futureCash.cashDelta : (side === "BUY" ? balance - executionCapital : balance + executionCapital) - executionCharges.total;
    const nextPosition = calculatePosition(nextOrders, selected.symbol, executionPrice, product);
    const requestedProtection = protectionValues();
    const { target, stopLoss } = requestedProtection;
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
    setTradeThesis("");
    setOrderSheetOpen(false);
    setToast(`${side === "BUY" ? "Bought" : "Sold"} ${quantity} ${selected.symbol} · charges ${formatInr(executionCharges.total)}`);
  }

  function exitPosition(requestedQuantity: number, requestedPosition?: {
    symbol: string;
    product: "INTRADAY" | "DELIVERY";
    side: "LONG" | "SHORT";
    quantity: number;
    livePrice: number;
  }) {
    const exitInstrument = requestedPosition
      ? tradingUniverse.find((item) => item.symbol === requestedPosition.symbol)
      : selected;
    const exitSide = requestedPosition?.side ?? selectedPosition.side;
    const exitPositionQuantity = requestedPosition?.quantity ?? selectedPosition.quantity;
    const exitProduct = requestedPosition?.product ?? positionProduct;
    const executionPrice = requestedPosition?.livePrice ?? verifiedLivePrice;
    if (!exitInstrument || exitPositionQuantity <= 0 || exitSide === "FLAT") return;
    if (!executionPrice || !Number.isFinite(executionPrice) || executionPrice <= 0) {
      setToast("Live Upstox price unavailable. Position was not exited.");
      return;
    }
    const exitIsDelta = Boolean(deltaSymbolFromInstrumentKey(exitInstrument.instrumentKey));
    if (!exitIsDelta && !marketOrdersAllowed) {
      setToast(marketStatus.message);
      return;
    }
    if (!exitIsDelta && exitProduct === "INTRADAY" && !intradayOrdersAllowed) {
      setToast(intradayStatusMessage);
      return;
    }
    const exitStep = exitInstrument.assetType === "FUTURE" || exitInstrument.assetType === "OPTION" ? Math.max(1, exitInstrument.lotSize ?? 1) : 1;
    const closingQuantity = Math.min(exitPositionQuantity, Math.max(exitStep, Math.floor(requestedQuantity / exitStep) * exitStep));
    const closingSide = exitSide === "LONG" ? "SELL" : "BUY";
    const exitCharges = calculateInstrumentCharges(exitInstrument, { side: closingSide, product: exitProduct, quantity: closingQuantity, price: executionPrice });
    const order: PaperOrder = {
      id: `${new Date().getTime()}`,
      symbol: exitInstrument.symbol,
      side: closingSide,
      quantity: closingQuantity,
      price: executionPrice,
      status: "COMPLETE",
      time: new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
      product: exitProduct,
      createdAt: new Date().getTime(),
      charges: exitCharges,
      exitReason: "MANUAL",
      priceSource: marketQuotes[exitInstrument.instrumentKey]?.lastPrice ? "UPSTOX_QUOTE" : "UPSTOX_CANDLE",
      instrumentKey: exitInstrument.instrumentKey,
      instrumentName: exitInstrument.name,
      assetType: exitInstrument.assetType ?? "EQUITY",
      optionType: exitInstrument.optionType,
      strikePrice: exitInstrument.strikePrice,
      expiry: exitInstrument.expiry,
      lotSize: exitInstrument.lotSize,
      underlyingKey: exitInstrument.underlyingKey,
      underlyingSymbol: exitInstrument.underlyingSymbol,
    };
    const futureCash = exitInstrument.assetType === "FUTURE" ? futureFillCashDelta(orders, order) : null;
    if (futureCash) order.cashDelta = futureCash.cashDelta;
    const nextOrders = [order, ...orders];
    const exitCapital = paperOrderCapitalValue(exitInstrument.assetType, exitProduct, closingQuantity, executionPrice);
    const nextBalance = futureCash ? balance + futureCash.cashDelta : (closingSide === "BUY" ? balance - exitCapital : balance + exitCapital) - exitCharges.total;
    setOrders(nextOrders);
    setBalance(nextBalance);
    setExitQuantity(String(exitStep));
    writePaperOrders(nextOrders);
    localStorage.setItem("papertrade-balance", String(nextBalance));
    if (closingQuantity >= exitPositionQuantity) saveProtection(null, exitInstrument.symbol, exitProduct);
    setToast(`Exited ${closingQuantity} ${exitInstrument.symbol} · charges ${formatInr(exitCharges.total)}`);
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
    if (isGlobalInstrumentKey(item.instrumentKey) || item.assetType === "FUTURE") setProduct("DELIVERY");
    if (item.assetType === "FUTURE") { setQuantityInput(String(Math.max(1, item.lotSize ?? 1))); setExitQuantity(String(Math.max(1, item.lotSize ?? 1))); }
    if (item.assetType !== "OPTION" || isGlobalInstrumentKey(item.instrumentKey)) {
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
      setOptionSplitPercent(50);
      setToast(`${underlying.symbol} opened with the nearest ATM ${contract.optionType}.`);
    } catch (error) {
      setFnoUnderlying(null);
      setFnoFutureInstrument(null);
      setToast(error instanceof Error ? error.message : "Unable to open this F&O symbol.");
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
    if (selectedIsWatchOnly) { setToast("This global reference has no live paper order contract."); return; }
    if (selected.assetType === "INDEX") { setToast("Indices cannot be traded directly. Choose a stock or F&O contract."); return; }
    if (!selectedDeltaChartSymbol && !getNseMarketStatus(new Date(), exchangeSession).isOpen) setProduct("DELIVERY");
    if (selectedDeltaSymbol || selectedDeltaOption) { setSide(nextSide); setGlobalTicketTab("Order"); setDesktopOrderPanelOpen(true); }
    else activateRiskTool(nextSide);
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
    setHomeOpen(false);
    setFnoListOpen(false);
    setOptionChainOpen(false);
    setOrderSheetOpen(false);
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
      setWorkspaceMode("fno");
      setFnoListOpen(false);
      return;
    }
    setFnoListOpen(false);
    setSidebarOpen(section === "watchlist");
    setPositionsOpen(false);
    setHoldingsOpen(section === "holdings");
    setOrdersOpen(section === "orders");
    if (section === "markets" || section === "ipo") setMarketsInitialGroup(section === "ipo" ? "IPO" : lastScannerGroupRef.current);
    setMarketsOpen(section === "markets" || section === "ipo");
    if (section === "pnl") {
      setPnlHistoryOnly(false);
      setPnlTab("overview");
      setPnlScope(readPnlScope());
      setPnlDrill(null);
      setPnlHistoryFilter("all");
      setSelectedPnlDateKey(null);
    }
    setPnlOpen(section === "pnl");
  }

  function fillPriceOrder(task: PriceTask, executionPrice: number): string | null {
    if (isGlobalInstrumentKey(task.instrument.instrumentKey)) return "Use the Global USD order ticket for this instrument.";
    if (!paperDataReady) return "Paper account is not ready. Please queue the order again.";
    const invalid = priceTaskError(task);
    if (invalid) return invalid;
    if (!getNseMarketStatus(new Date(), exchangeSession).isOpen) return "Market is closed.";
    if (task.product === "INTRADAY" && !intradayOrdersAllowed) return "Intraday trading is closed.";
    const instrument = task.instrument;
    const currentOrders = readPaperOrders();
    if (currentOrders.some(o => o.id === task.id)) return null;
    const storedCash = Number(localStorage.getItem("papertrade-balance"));
    const currentCash = Number.isFinite(storedCash) ? storedCash : balance;
    const position = calculatePosition(currentOrders, instrument.symbol, executionPrice, task.product);
    const reduces = position.quantity >= task.quantity && ((position.side === "LONG" && task.side === "SELL") || (position.side === "SHORT" && task.side === "BUY"));
    if (tradingLimitStatus.blocked && !reduces) return tradingLimitStatus.reasons[0] || "Personal trading limit is active.";
    if (instrument.expiry && Date.parse(instrument.expiry) < new Date().setHours(0, 0, 0, 0)) return "The derivative has expired.";
    if (task.product === "DELIVERY" && task.side === "SELL" && !["OPTION", "FUTURE"].includes(instrument.assetType ?? "")) {
      const error = validateDeliverySell(currentOrders, instrument.symbol, task.quantity); if (error) return error;
    }
    const charges = calculateInstrumentCharges(instrument, { side: task.side, product: task.product, quantity: task.quantity, price: executionPrice });
    const capital = paperOrderCapitalValue(instrument.assetType, task.product, task.quantity, executionPrice);
    if (instrument.assetType !== "FUTURE" && !reduces && capital + charges.total > currentCash) return "Insufficient virtual cash at the trigger price.";
    const now = Date.now();
    const order: PaperOrder = { ...instrument, id: task.id, symbol: instrument.symbol, instrumentName: instrument.name, side: task.side, product: task.product, quantity: task.quantity, price: executionPrice, status: "COMPLETE", createdAt: now, time: new Date(now).toLocaleTimeString("en-IN"), charges, priceSource: "UPSTOX_QUOTE" };
    const futureCash = instrument.assetType === "FUTURE" ? futureFillCashDelta(currentOrders, order) : null;
    if (futureCash && currentCash + futureCash.cashDelta < 0 && !reduces) return "Insufficient virtual cash for estimated futures margin at the trigger price.";
    if (futureCash) order.cashDelta = futureCash.cashDelta;
    const next = [order, ...currentOrders];
    const nextBalance = futureCash ? currentCash + futureCash.cashDelta : currentCash + (task.side === "BUY" ? -capital : capital) - charges.total;
    setOrders(next); setBalance(nextBalance); writePaperOrders(next); localStorage.setItem("papertrade-balance", String(nextBalance));
    const nextPosition = calculatePosition(next, instrument.symbol, executionPrice, task.product);
    if (!nextPosition.quantity || nextPosition.side !== position.side) saveProtection(null, instrument.symbol, task.product);
    return null;
  }

  function validateQueuedPriceOrder(task: PriceTask): string | null {
    if (isGlobalInstrumentKey(task.instrument.instrumentKey)) return "Use the Global USD order ticket for this instrument.";
    if (!paperDataReady) return "Please wait for your paper account to load.";
    const position = calculatePosition(orders, task.instrument.symbol, task.price, task.product);
    const reduces = position.quantity >= task.quantity && ((position.side === "LONG" && task.side === "SELL") || (position.side === "SHORT" && task.side === "BUY"));
    if (tradingLimitStatus.blocked && !reduces) return tradingLimitStatus.reasons[0] || "Personal trading limit is active.";
    if (task.product === "DELIVERY" && task.side === "SELL" && !["OPTION", "FUTURE"].includes(task.instrument.assetType ?? "")) {
      const error = validateDeliverySell(orders, task.instrument.symbol, task.quantity); if (error) return error;
    }
    const charges = calculateInstrumentCharges(task.instrument, { side: task.side, product: task.product, quantity: task.quantity, price: task.price });
    const capital = paperOrderCapitalValue(task.instrument.assetType, task.product, task.quantity, task.price);
    if (task.instrument.assetType === "FUTURE") {
      const estimate: PaperOrder = { id: String(Date.now()), symbol: task.instrument.symbol, side: task.side, quantity: task.quantity, price: task.price, status: "COMPLETE", time: "", product: task.product, charges, instrumentKey: task.instrument.instrumentKey, assetType: "FUTURE" };
      const cash = futureFillCashDelta(orders, estimate);
      if (!reduces && balance + cash.cashDelta < 0) return `Insufficient virtual cash. Estimated futures margin: ${formatInr(-cash.cashDelta)}.`;
    } else if (!reduces && capital + charges.total > balance) return `Insufficient virtual cash. Estimated requirement: ${formatInr(capital + charges.total)}.`;
    return null;
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
    <StockLogoProvider instruments={tradingUniverse}>
    <main className="terminal-shell" data-theme={theme} data-density={uiDensity} data-motion={uiPreferencesReady && motionEnabled ? "full" : "reduced"} data-platform={isAndroidApp ? "android" : "web"} data-section={activeNavigationSection}>
      <PushNotificationBridge userId={user?.id} reviewCount={closedTrades.filter(trade => indiaDateKey(trade.closedAt) === indiaDateKey(clock || Date.now())).length} />
      <SessionOpenAlerts />
      <PriceActions key={user?.id ?? "local"} ownerId={user?.id ?? "local"} request={priceRequest} onClose={() => setPriceRequest(null)} onFill={fillPriceOrder} onValidate={validateQueuedPriceOrder} marketOpen={paperDataReady && marketStatus.isOpen} intradayOpen={intradayOrdersAllowed} onNotice={setToast} onTasksChange={setPriceTasks} onHomeAlertsChange={setHomeAlerts} homeAlertRequest={homeAlertRequest} timeframe={timeframe} onOpenTechnical={(instrument, frame) => { setHomeOpen(false); setFnoListOpen(false); setHoldingsOpen(false); setOrdersOpen(false); setMarketsOpen(false); setPnlOpen(false); setWorkspaceMode("trade"); chooseTradeInstrument(instrument); setTimeframe(frame); }} onCreateAlert={() => setPriceRequest({ instrument: selected, price: verifiedLivePrice ?? selected.price, mode: "alert" })} triggerHost={activeNavigationSection === "fno" ? fnoPriceActionsHost : priceActionsHost} visible={activeNavigationSection === "trade" || activeNavigationSection === "fno"} />
      <header className="topbar">
        <Brand onClick={() => openNavigationSection("home")} />
        <nav className="main-nav" aria-label="Main navigation">
          <button className={activeNavigationSection === "home" ? "nav-active" : ""} onClick={() => openNavigationSection("home")}>Home</button><button className={activeNavigationSection === "trade" ? "nav-active" : ""} onClick={() => openNavigationSection("trade")}>Charts</button><button className={activeNavigationSection === "fno" ? "nav-active" : ""} onClick={() => openNavigationSection("fno")}>F&amp;O</button><button className={activeNavigationSection === "holdings" ? "nav-active" : ""} onClick={() => openNavigationSection("holdings")}>Holdings</button><button className={activeNavigationSection === "orders" ? "nav-active" : ""} onClick={() => openNavigationSection("orders")}>Orders</button><button className={marketNavigationActive ? "nav-active" : ""} onClick={() => openNavigationSection("markets")}>Watchlist</button><button className={activeNavigationSection === "ipo" ? "nav-active" : ""} onClick={() => openNavigationSection("ipo")}>IPOs</button><button className={activeNavigationSection === "pnl" ? "nav-active" : ""} onClick={() => openNavigationSection("pnl")}>P&amp;L</button>
        </nav>
        <div className="top-actions">
          <div className={`market-status ${feedStatus.mode}`} title={feedStatus.mode === "live" ? "Live Upstox data" : "Live data unavailable"} aria-label={feedStatus.mode === "live" ? "Live market data connected" : "Live market data unavailable"}>
            <span /> <span className="market-status-text">{feedStatus.mode === "live" ? "Live data" : "Data offline"}</span>
          </div>
          <button className="funds-button" onClick={() => openFunds(selectedDeltaChartSymbol && activeNavigationSection === "trade" ? "USD" : "INR")} title="Add practice cash to the selected market wallet"><WalletCards size={16} /> {selectedDeltaChartSymbol && activeNavigationSection === "trade" ? globalTrading.account ? formatUsd(globalTrading.account.wallet) : "USD wallet" : formatInr(balance)}</button>
          {!isAndroidApp && <button className="download-button" onClick={() => setDownloadOpen(true)} title="Get the mobile app"><Download size={16} /> Get app</button>}
          {!isAndroidApp && <button className="api-button" onClick={() => setShowApi(true)}><Cable size={16} /> Broker API</button>}
          <button className="suggestion-button" onClick={() => setFeedbackOpen(true)} aria-label="Send suggestions" title="Send suggestions"><MessageCircle size={16} /><span>Suggestions</span></button>
          <NotificationCenter />
          <button type="button" className="icon-button header-coach-button" onClick={() => { setCoachTab("journal"); setCoachOpen(true); setMoreMenuOpen(false); }} aria-label="Open trading coach" title="Trading coach"><Target size={19} /></button>
          <div className="more-menu-wrap">
            <button className={`icon-button more-menu-trigger ${moreMenuOpen ? "active" : ""}`} onClick={() => setMoreMenuOpen((value) => !value)} aria-expanded={moreMenuOpen} aria-label="More options"><MoreHorizontal size={19} /></button>
            {moreMenuOpen && <>
              <button className="more-menu-scrim" aria-label="Close more options" onClick={() => setMoreMenuOpen(false)} />
              <section className="more-menu-panel" aria-label="More options">
                <header><SlidersHorizontal size={17} /><span><b>More</b><small>Personalise your home screen</small></span></header>
                <div className="home-card-toggles">
                  <b>Home cards</b>
                  {([['market', 'Market pulse'], ['portfolio', 'Portfolio summary']] as Array<[HomeCardId, string]>).map(([id, label]) => <button key={id} className={homeCards[id] ? "active" : ""} onClick={() => toggleHomeCard(id)} role="switch" aria-checked={homeCards[id]}><span>{label}</span><i /></button>)}
                </div>
                <div className="density-picker">
                  <b>Display density</b>
                  <div><button className={uiDensity === "comfortable" ? "active" : ""} onClick={() => setUiDensity("comfortable")}>Comfortable</button><button className={uiDensity === "compact" ? "active" : ""} onClick={() => setUiDensity("compact")}>Compact</button></div>
                </div>
                <div className="home-card-toggles motion-preference">
                  <b>Motion</b>
                  <button type="button" className={motionEnabled ? "active" : ""} onClick={() => setMotionEnabled((value) => !value)} role="switch" aria-checked={motionEnabled} aria-describedby="motion-preference-help"><span>Animations</span><i aria-hidden="true" /></button>
                  <small id="motion-preference-help">Quick, gentle transitions. Your device’s reduced-motion setting always takes priority.</small>
                </div>
              </section>
            </>}
          </div>
          <button className="icon-button header-wallet-button" onClick={openHeaderWallet} aria-label="Practice wallet" title="Practice wallet"><WalletCards size={17} /></button>
          <button className="icon-button theme-toggle" onClick={toggleTheme} aria-label={theme === "neon" ? "Use light theme" : "Use neon dark theme"} title={theme === "neon" ? "Light theme" : "Neon dark theme"}>{theme === "neon" ? <Sun size={17} /> : <Moon size={17} />}</button>
          {authConfigured && user && <button className="profile-button account-button" onClick={() => setAccountOpen(true)} aria-label="Open account" title={user.email ?? "Account"}>{user.user_metadata?.avatar_url ? <Image unoptimized width={36} height={36} src={user.user_metadata.avatar_url as string} alt="" referrerPolicy="no-referrer" /> : <UserRound size={18} />}</button>}
        </div>
      </header>

      {!holdingsOpen && !homeOpen && <div className={`workspace section-${activeNavigationSection} ${desktopOrderPanelOpen ? "" : "order-panel-collapsed"}`}>
        <aside className={`watchlist-panel ${sidebarOpen ? "mobile-open" : ""}`}>
          {sidebarOpen && <div className="watchlist-market-header">

            <MarketSectionTabs active="WATCHLIST" onChange={(section) => {
              if (section === "WATCHLIST") return;
              openNavigationSection("markets");
              setMarketsInitialGroup(section);
            }} />
          </div>}
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
                  <StockLogo {...item} />
                  <span className="instrument-name"><b>{item.symbol}</b><small>{item.name}</small></span>
                  <span className="instrument-price"><b>{price > 0 ? price.toLocaleString("en-IN", { minimumFractionDigits: 2 }) : "—"}</b><small className={`market-move-line ${price > 0 ? change >= 0 ? "positive" : "negative" : ""}`}>{price > 0 ? formatSignedMarketMove(netChange, change) : <CandleLoader compact label="Loading quote" />}</small></span>
                  {activeCustomList?.symbols.includes(item.symbol) ? (
                    <button className="watchlist-star remove" onClick={(event) => { event.stopPropagation(); removeStockFromCustomWatchlist(activeCustomList.id, item.symbol); }} aria-label={`Remove ${item.symbol} from ${activeCustomList.name}`}><X size={15} /></button>
                  ) : (
                    <button className={`watchlist-star ${saved ? "saved" : ""}`} onClick={(event) => { event.stopPropagation(); openWatchlistPicker(item); }} aria-label={`Add ${item.symbol} to a custom watchlist`}><Star size={15} fill={saved ? "currentColor" : "none"} /></button>
                  )}
                </div>
              );
            })}
            {watchlistLoading && <CandleLoader label="Loading NSE stocks" />}
            {!watchlistLoading && !filtered.length && <div className="empty-list">No matching NSE stocks.</div>}
            {visibleInstruments.length < filtered.length && <button className="load-more-stocks" onClick={() => setWatchlistLimit((value) => value + 60)}>Load 60 more <small>{visibleInstruments.length} of {filtered.length}</small></button>}
          </div>
        </aside>

        <section className="chart-area">
          <section className="trade-cockpit" aria-label="Trade workspace controls">
          <div className="instrument-header">
            <div className="trade-identity-cluster">
              <div className="trade-context-line">
                <span className={`trade-feed-chip ${selectedQuoteIsFresh && selectedMarketOrdersAllowed ? "live" : "waiting"}`} title={selectedDeltaChartSymbol ? "Delta Exchange India market data" : marketStatus.message}><i />{selectedIsWatchOnly ? "WATCH" : !selectedMarketOrdersAllowed && !selectedDeltaChartSymbol ? "CLOSED" : selectedQuoteIsFresh ? "LIVE" : "SYNCING"}</span>
                <span>{selectedVenueLabel === "NSE" ? "Paper practice" : "Global practice"}</span>
              </div>
              <div ref={tradeSymbolPickerRef} className="instrument-title trade-symbol-picker">
                <button className="trade-symbol-trigger" onClick={() => setShowTradeSymbols((value) => !value)} aria-expanded={showTradeSymbols}>
                  <div className="title-line"><StockLogo {...selected} size={28} /><h1>{selected.symbol}</h1><span>{selectedVenueLabel}</span><ChevronDown size={16} /></div>
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
                <button type="button" className={`chart-compare-link ${comparedSymbols.length ? "active" : ""}`} onClick={() => { setShowTimeframeMenu(false); setShowChartFunctions(false); setShowChartStyleMenu(false); setShowComparePicker(true); }} aria-label="Compare symbols" title="Compare symbols"><Plus size={18} /></button>
                {selectedFnoUnderlying && <button
                  className="chart-derivatives-link"
                  disabled={openingUnderlyingKey === selectedFnoUnderlying.instrumentKey}
                  onClick={() => void openFnoUnderlying(selectedFnoUnderlying)}
                  aria-label={`Open ${selected.symbol} option charts`}
                  title="Open option charts"
                >
                  <Link2 size={19} />
                </button>}
                <button type="button" className={`chart-style-link ${chartStyle !== "candles" ? "active" : ""}`} onClick={() => { setShowTimeframeMenu(false); setShowChartFunctions(false); setShowComparePicker(false); setShowChartStyleMenu(true); }} aria-label="Chart type" title="Chart type"><CandlestickChart size={18} /></button>
                {showTradeSymbols && (
                  <div className="trade-symbol-menu">
                    <label><Search size={16} /><input value={tradeSymbolSearch} onChange={(event) => setTradeSymbolSearch(event.target.value)} placeholder="Search stocks, BTC, gold or Brent" /></label>
                    <div>
                      {tradeSymbolMatches.map((item) => (
                        <button key={item.symbol} onClick={() => chooseTradeInstrument(item)}>
                          <span className="stock-identity"><StockLogo {...item} size={32} /><span><b>{item.symbol}</b><small>{item.name}</small></span></span><em>{instrumentVenueLabel(item)}</em>
                        </button>
                      ))}
                      {!tradeSymbolMatches.length && <p>No matching symbol.</p>}
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div className="quote-block"><strong>{verifiedLivePrice ? verifiedLivePrice.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—"}</strong><span className={selectedChange >= 0 ? "positive" : "negative"}>{selectedQuoteIsFresh ? `${selectedNetChange >= 0 ? "+" : ""}${selectedNetChange.toFixed(2)} (${selectedChange >= 0 ? "+" : ""}${selectedChange.toFixed(2)}%)` : `Waiting for ${selectedVenueLabel === "NSE" ? "Upstox" : selectedVenueLabel}`}</span></div>
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
            <div className="header-order-buttons"><button disabled={!selectedOrderTicketAvailable} className="compact-sell" onClick={() => openOrderSheet("SELL")}>Sell <b>{orderButtonPriceLabel}</b></button><button disabled={!selectedOrderTicketAvailable} className="compact-buy" onClick={() => openOrderSheet("BUY")}>Buy <b>{orderButtonPriceLabel}</b></button></div>
          </div>

          <div className="chart-controls">
            <div ref={desktopTradeSymbolPickerRef} className="desktop-chart-symbol trade-symbol-picker">
              <button className="desktop-symbol-trigger" onClick={() => setShowTradeSymbols((value) => !value)} aria-expanded={showTradeSymbols}>
                <StockLogo {...selected} size={24} /><span>{selected.symbol}</span><small>{selectedVenueLabel}</small><ChevronDown size={15} />
              </button>
              {selected.assetType !== "OPTION" && <button className={`chart-watchlist-star ${customWatchlists.some((list) => list.symbols.includes(selected.symbol)) ? "saved" : ""}`} onClick={() => openWatchlistPicker(selected)} aria-label={`Add ${selected.symbol} to a custom watchlist`}><Star size={15} fill={customWatchlists.some((list) => list.symbols.includes(selected.symbol)) ? "currentColor" : "none"} /></button>}
              <button type="button" className={`chart-compare-link ${comparedSymbols.length ? "active" : ""}`} onClick={() => { setShowTimeframeMenu(false); setShowChartFunctions(false); setShowChartStyleMenu(false); setShowComparePicker(true); }} aria-label="Compare symbols" title="Compare symbols"><Plus size={17} /></button>
              {selectedFnoUnderlying && <button className="chart-derivatives-link" disabled={openingUnderlyingKey === selectedFnoUnderlying.instrumentKey} onClick={() => void openFnoUnderlying(selectedFnoUnderlying)} aria-label={`Open ${selected.symbol} option charts`}><Link2 size={16} /></button>}
              <button type="button" className={`chart-style-link ${chartStyle !== "candles" ? "active" : ""}`} onClick={() => { setShowTimeframeMenu(false); setShowChartFunctions(false); setShowComparePicker(false); setShowChartStyleMenu(true); }} aria-label="Chart type" title="Candles"><CandlestickChart size={17} /></button>
              {showTradeSymbols && <div className="trade-symbol-menu desktop-symbol-menu">
                <label><Search size={16} /><input value={tradeSymbolSearch} onChange={(event) => setTradeSymbolSearch(event.target.value)} placeholder="Search stocks, BTC, gold or Brent" /></label>
                <div>{tradeSymbolMatches.map((item) => <button key={item.symbol} onClick={() => chooseTradeInstrument(item)}><span className="stock-identity"><StockLogo {...item} size={32} /><span><b>{item.symbol}</b><small>{item.name}</small></span></span><em>{instrumentVenueLabel(item)}</em></button>)}{!tradeSymbolMatches.length && <p>No matching symbol.</p>}</div>
              </div>}
            </div>
            <button className="chart-tools-trigger" aria-label="Open drawing tools" title="Drawing tools" onClick={() => setShowDrawingLibrary(true)}><Pencil size={18} /></button>
            <button type="button" className={`compact-selector-trigger chart-functions-trigger ${showChartFunctions ? "active" : ""}`} onClick={() => { setShowTimeframeMenu(false); setShowChartFunctions(true); }} aria-label="Functions" title="Indicators" aria-haspopup="dialog"><span><small>fx</small></span></button>
            <CompactSelectorButton label="Timeframe" value={timeframe} className={showTimeframeMenu ? "active" : ""} onClick={() => { setShowChartFunctions(false); setShowTimeframeMenu(true); }} />
            <button type="button" className={`desktop-live-pnl ${chartPnlVisible ? "visible" : ""}`} onClick={openChartPositions}>
              <span>Live P&amp;L</span><b className={chartPnl >= 0 ? "positive" : "negative"}>{chartPnlText}</b>
            </button>
            <div className="chart-control-orders"><button disabled={!selectedOrderTicketAvailable} className="compact-sell" onClick={() => openOrderSheet("SELL")}>Sell <b>{orderButtonPriceLabel}</b></button><button disabled={!selectedOrderTicketAvailable} className="compact-buy" onClick={() => openOrderSheet("BUY")}>Buy <b>{orderButtonPriceLabel}</b></button></div>
          </div>
          </section>

          <div className="chart-body">
            <ChartDrawingToolbar
              libraryInHeader
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
            {showChartFunctions && <ChartFunctionMenu indicators={indicators} onToggleIndicator={toggleIndicator} onDrawing={tool=>{setActiveTool(tool);setToolSignal(value=>value+1);}} onAction={(type: ChartAction) => setChartAction((current) => ({ type, token: (current?.token ?? 0) + 1 }))} onClose={() => setShowChartFunctions(false)} />}
            {showTimeframeMenu && <ChartTimeframeMenu current={timeframe} onSelect={(period) => { chooseTimeframe(period); setShowTimeframeMenu(false); }} onClose={() => setShowTimeframeMenu(false)} />}
            {showChartStyleMenu && <ChartStyleMenu onClose={() => setShowChartStyleMenu(false)} />}
            {showComparePicker && <CompareSymbolPicker instruments={tradingUniverse} currentKey={selected.instrumentKey} onClose={() => setShowComparePicker(false)} />}
            {selected.assetType === "OPTION" && spotInstrument ? (
              <div className="fno-chart-underlay" />
            ) : (
              <MarketChart
                key={`${selected.symbol}-${timeframe}`}
                instrument={selected}
                timeframe={timeframe}
                historyRequest={chartHistory}
                activeTool={activeTool}
                toolSignal={toolSignal}
                magnet={magnet}
                hiddenDrawings={hiddenDrawings}
                candlesOnly={hiddenDrawings}
                lockedDrawings={drawingsLocked}
                clearSignal={clearSignal}
                undoSignal={undoSignal}
                redoSignal={redoSignal}
                indicators={indicators}
                indicatorHost={chartIndicatorHost}
                chartAction={chartAction}
                chartTheme={theme}
                externalCandles={selectedDeltaChartSymbol ? (globalCandleScopeRef.current === `${selectedDeltaChartSymbol}:${timeframe}` ? globalCandles : []) : undefined}
                priceIncrement={selectedDeltaSymbol ? globalTrading.snapshots[selectedDeltaSymbol]?.spec.tick : selectedDeltaOption ? globalTrading.optionSnapshots[selectedDeltaOption]?.spec.tick : undefined}
                exchangeLabel={selectedVenueLabel}
                tradeMarkers={selectedTradeMarkers}
                orderTool={selectedGlobalPosition ? { enabled: true, side: selectedGlobalPosition.side, entryPrice: selectedGlobalPosition.entry, ...globalChartLevels(selectedGlobalPosition), quantity: Number((selectedGlobalPosition.contracts * selectedGlobalPosition.spec.lot).toFixed(8)), currency: "USD", tickSize: selectedGlobalPosition.spec.tick, referencePrice: selectedGlobalQuote ? triggerValue(selectedGlobalQuote, selectedGlobalPosition.protection?.source) : undefined, positionKey: String(selectedGlobalPosition.openedAt) }
                  : selectedOptionPosition ? { enabled: true, side: selectedOptionPosition.side, entryPrice: selectedOptionPosition.entry, targetPrice: selectedOptionPosition.target ?? 0, stopLossPrice: selectedOptionPosition.stopLoss ?? 0, quantity: Number((selectedOptionPosition.contracts * selectedOptionPosition.spec.lot).toFixed(8)), currency: "USD", tickSize: selectedOptionPosition.spec.tick, referencePrice: selectedOptionQuote?.mark, positionKey: String(selectedOptionPosition.openedAt) }
                  : { enabled: !selectedDeltaChartSymbol && activeRiskToolEnabled, side: riskToolSide, entryPrice: riskEntryPrice, targetPrice: selectedProtection?.targetPrice ?? 0, stopLossPrice: selectedProtection?.stopLossPrice ?? 0, quantity: riskDisplayQuantity }}
                onOrderToolChange={updateChartRiskLevel}
                onOrderToolExit={selectedGlobalPosition || selectedOptionPosition ? closeGlobalChartPosition : selectedPosition.quantity > 0 ? () => exitPosition(selectedPosition.quantity) : undefined}
                onPrice={handleChartPrice}
                liveTick={selectedGlobalQuote ? { instrumentKey: selected.instrumentKey, price: selectedGlobalQuote.last, timestampMs: selectedGlobalQuote.at }
                  : selectedQuote ? { instrumentKey: selected.instrumentKey, price: selectedQuote.lastPrice, timestampMs: Date.parse(selectedQuote.lastTradeAt) } : undefined}
                onPriceAction={(price, mode) => { if (selectedDeltaChartSymbol && mode === "order") openOrderSheet(side); else setPriceRequest({ instrument: selected, price, mode }); }}
                priceTasks={priceTasks}
                onDrawingComplete={() => setActiveTool("cursor")}
                onRemoveIndicator={id=>setIndicators(current=>({...current,[id]:false}))}
                onFeedStatus={handleFeedStatus}
              />
            )}
          </div>
          <div className={`chart-statusbar feed-${feedStatus.mode}`} title={feedStatus.mode === "error" ? feedStatus.message : undefined}>
            <ChartHistoryControls request={chartHistory} onChange={request => { if (request?.years) chooseTimeframe("1D"); setChartHistory(request); }} afterDate={<button type="button" className="chart-statusbar-replay" onClick={() => setReplayInstrument(selected)} aria-label={`Bar replay for ${selected.symbol}`} title="Bar replay"><StepBack size={15} /></button>} />
            <div ref={setChartIndicatorHost} className="chart-indicator-slot" role="group" aria-label="Active chart functions" tabIndex={0}/>
            <div className={`chart-status-live-pnl ${chartPnlVisible ? "visible" : ""}`}>
              {chartPnlVisible ? <><Radio size={12} /><span>Live P&amp;L</span><b className={chartPnl >= 0 ? "positive" : "negative"}>{chartPnlText}</b></> : null}
            </div>
            {feedStatus.mode === "error" && <div className="chart-feed-warning" role="status">{feedStatus.message}</div>}
            <div className="chart-status-clock">{clock ? `India · ${clock.toLocaleDateString("en-IN")} · ${clock.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })} IST` : "India · IST"}</div>
          </div>
          {activeNavigationSection === "trade" && <div className="chart-trade-footer permanent-trade-footer">
            <div className="chart-trade-buttons">
              <button disabled={!selectedOrderTicketAvailable} className="sell" onClick={() => openOrderSheet("SELL")}><span>Sell</span><b>{orderButtonPriceLabel}</b></button>
              <button disabled={!selectedOrderTicketAvailable} className="buy" onClick={() => openOrderSheet("BUY")}><span>Buy</span><b>{orderButtonPriceLabel}</b></button>
            </div>
            <div className="chart-trade-meta">
            <button className={`chart-footer-pnl ${(selectedDeltaChartSymbol ? globalOpenPnl : totalOpenPnl) >= 0 ? "positive" : "negative"}`} aria-label="Open positions profit and loss" onClick={openChartPositions}>{selectedDeltaChartSymbol ? formatUsd(globalOpenPnl) : `${totalOpenPnl >= 0 ? "+" : ""}${formatInr(totalOpenPnl)}`}</button>
            <button className="chart-positions-trigger" onClick={openChartPositions}>
              <span>{selectedDeltaChartSymbol ? "Global · USD" : selected.assetType === "OPTION" ? "F&O" : "Stocks"} <ChevronDown size={14} /></span>
            </button>
            <div className="chart-price-actions-slot" ref={setPriceActionsHost} />
            </div>
          </div>}
        </section>

        {orderSheetOpen && <button className="order-sheet-backdrop" aria-label="Close paper order" onClick={() => setOrderSheetOpen(false)} />}
        <button type="button" className="desktop-order-panel-toggle" onClick={() => setDesktopOrderPanelOpen((value) => !value)} aria-label={desktopOrderPanelOpen ? "Hide paper order panel" : "Show paper order panel"} title={desktopOrderPanelOpen ? "Hide paper order panel" : "Show paper order panel"}><ChevronRight size={16} /></button>
        <aside className={`order-ticket ${orderSheetOpen ? "mobile-open" : ""}`}>
          <button className="mobile-order-close icon-button" onClick={() => setOrderSheetOpen(false)} aria-label="Close paper order"><X size={20} /></button>
          {selectedDeltaSymbol ? <GlobalOrderTicket key={`${user?.id ?? "guest"}:${selectedDeltaSymbol}`} owner={user?.id ?? "guest"} symbol={selectedDeltaSymbol} side={side} onSide={setSide} trading={globalTrading} tab={globalTicketTab} onTab={setGlobalTicketTab} /> : selectedDeltaOption ? <GlobalOptionTicket key={`${user?.id ?? "guest"}:${selectedDeltaOption}`} symbol={selectedDeltaOption} side={side} onSide={setSide} trading={globalTrading} tab={globalTicketTab} onTab={setGlobalTicketTab} /> : <>
          <div className="ticket-heading"><div><span className="eyebrow">{selected.assetType === "OPTION" ? `Paper option · ${selected.optionType}` : "Paper order"}</span><h2 className="stock-identity"><StockLogo {...selected} size={26} />{selected.symbol}</h2>{selected.assetType === "OPTION" && <small className="contract-summary">Expiry {selected.expiry} · lot size {selected.lotSize}</small>}</div><span className="paper-badge">No real money</span></div>
          <div className="side-switch"><button className={side === "BUY" ? "buy-active" : ""} onClick={() => activateRiskTool("BUY")}>Buy</button><button className={side === "SELL" ? "sell-active" : ""} disabled={isCashDeliveryOrder && deliveryHoldingQuantity <= 0} title={isCashDeliveryOrder && deliveryHoldingQuantity <= 0 ? "Buy delivery shares before selling" : undefined} onClick={() => activateRiskTool("SELL")}>Sell</button></div>
          <div className="order-type-tabs">{["Market", "Limit", "SL"].map((type) => <button key={type} className={orderType === type ? "active" : ""} onClick={() => { if (type === "Market") setOrderType(type); else { setOrderSheetOpen(false); setPriceRequest({ instrument: selected, price: orderEstimatePrice, mode: "order", side, orderType: type === "SL" ? "SL" : "Limit", quantity, product }); } }}>{type}</button>)}</div>
          <div className="input-grid">
            <label><span className="quantity-heading"><span>{selected.assetType === "OPTION" || selected.assetType === "FUTURE" ? "Quantity (lot multiples)" : "Quantity"}</span><span className="quantity-margin"><small>{isCashDeliveryOrder ? "Est. funds" : "Est. margin"}</small><b>{verifiedLivePrice ? formatInr(estimatedFundsRequired) : "—"}</b></span></span><div className="stepper"><button onClick={() => setQuantityInput(String(Math.max(quantityStep, quantity - quantityStep)))}><Minus size={15} /></button><input type="text" inputMode="numeric" value={quantityInput} onFocus={(event) => event.currentTarget.select()} onChange={(event) => setQuantityInput(event.target.value.replace(/\D/g, ""))} onBlur={() => setQuantityInput(String(selected.assetType === "OPTION" || selected.assetType === "FUTURE" ? Math.max(quantityStep, Math.round(quantity / quantityStep) * quantityStep) : quantity))} aria-label="Order quantity" /><button onClick={() => setQuantityInput(String(quantity + quantityStep))}><Plus size={15} /></button></div>{(selected.assetType === "OPTION" || selected.assetType === "FUTURE") && <small className="lot-helper">{Number.isInteger(orderLots) ? orderLots : orderLots.toFixed(2)} lot{orderLots === 1 ? "" : "s"} · {quantityStep} units per lot{selected.assetType === "FUTURE" ? " · margin is a 20% paper estimate" : ""}</small>}</label>
            {orderType !== "Market" && <label>Price (₹)<input className="text-input" type="number" value={verifiedLivePrice?.toFixed(2) ?? ""} readOnly /></label>}
          </div>
          <div className="protection-grid">
            <label>Target (₹)<input type="number" min="0.01" step="0.05" value={targetPrice} onChange={(event) => { setTargetPrice(event.target.value); }} placeholder={verifiedLivePrice ? (side === "BUY" ? `Above ${verifiedLivePrice.toFixed(2)}` : `Below ${verifiedLivePrice.toFixed(2)}`) : "Waiting for live price"} /></label>
            <label>Stop loss (₹)<input type="number" min="0.01" step="0.05" value={stopLossPrice} onChange={(event) => { setStopLossPrice(event.target.value); }} placeholder={verifiedLivePrice ? (side === "BUY" ? `Below ${verifiedLivePrice.toFixed(2)}` : `Above ${verifiedLivePrice.toFixed(2)}`) : "Waiting for live price"} /></label>
            {selectedPosition.quantity > 0 && <button type="button" onClick={applyProtectionToOpenPosition}>Apply to open position</button>}
          </div>
          <RiskSizingPlan open={riskSizingOpen} onToggle={() => setRiskSizingOpen((value) => !value)} maxRisk={maxRiskInput} onMaxRiskChange={setMaxRiskInput} suggestedQuantity={suggestedRiskQuantity} onApply={() => setQuantityInput(String(suggestedRiskQuantity))} risk={plannedRisk} reward={plannedReward} ratio={rewardRiskRatio} strategy={tradeStrategy} onStrategyChange={setTradeStrategy} confidence={tradeConfidence} onConfidenceChange={setTradeConfidence} thesis={tradeThesis} onThesisChange={setTradeThesis} />
          {selected.assetType === "OPTION" && singleOptionPayoff && <button type="button" className="ticket-payoff-preview" onClick={() => { setCoachTab("payoff"); setCoachOpen(true); }}><span><Target size={16} /><b>Expiry payoff preview</b><small>{singleOptionPayoff.breakevens.length ? `Breakeven ${singleOptionPayoff.breakevens.map((value) => formatInr(value)).join(" · ")}` : "Open full payoff chart"}</small></span><ChevronRight size={16} /></button>}
          <div className="product-select"><label className={!intradayOrdersAllowed ? "disabled-product" : ""}><input type="radio" name="product" checked={product === "INTRADAY"} disabled={!intradayOrdersAllowed} onChange={() => setProduct("INTRADAY")} /><span><b>Intraday</b><small>{intradayOrdersAllowed ? "MIS · auto square-off" : "Closed for this session"}</small></span></label><label><input type="radio" name="product" checked={product === "DELIVERY"} onChange={() => { setProduct("DELIVERY"); if (selected.assetType !== "OPTION" && selected.assetType !== "FUTURE" && deliveryHoldingQuantity <= 0 && side === "SELL") activateRiskTool("BUY"); }} /><span><b>{selected.assetType === "OPTION" || selected.assetType === "FUTURE" ? "Carry forward" : "Delivery"}</b><small>{selected.assetType === "FUTURE" ? "Paper cash settlement · no share delivery" : selected.assetType === "OPTION" ? "NRML · until expiry" : "CNC · buy or sell holdings"}</small></span></label></div>
          {afterHoursDeliveryCanQueue && <p className="after-hours-order-note">NSE is closed. Delivery can be queued now and will use a fresh quote when the app is open during the next trading session. The displayed price is only an estimate.</p>}
          <div className="margin-card"><div><span>Order value</span><b>{formatInr(orderValue)}</b></div><div><span>{isCashDeliveryOrder ? "Funds required" : "Est. margin"}</span><b>{formatInr(isCashDeliveryOrder ? estimatedFundsRequired : margin)}</b></div><div><span>{isCashDeliveryOrder ? "Est. delivery charges" : "Est. taxes & charges"}</span><b>{formatInr(estimatedOrderCharges.total)}</b></div><div><span>Available cash</span><b>{formatInr(balance)}</b></div></div>
          {tradingLimitStatus.blocked && !orderReducesOpenPosition && <div className="ticket-limit-block"><ShieldCheck size={17} /><span><b>New trades paused by your limits</b><small>{tradingLimitStatus.reasons.join(" · ")}</small></span><button type="button" onClick={() => { setCoachTab("limits"); setCoachOpen(true); }}>Review</button></div>}
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
          <button disabled={(!verifiedLivePrice && !afterHoursDeliveryCanQueue) || (!selectedMarketOrdersAllowed && !afterHoursDeliveryCanQueue) || (!selectedDeltaSymbol && product === "INTRADAY" && !intradayOrdersAllowed) || Boolean(deliverySellError) || (tradingLimitStatus.blocked && !orderReducesOpenPosition)} className={`place-order ${side.toLowerCase()}`} onClick={placeOrder}>{tradingLimitStatus.blocked && !orderReducesOpenPosition ? "TRADING LIMIT ACTIVE" : deliverySellError ? deliveryHoldingQuantity > 0 ? `ONLY ${deliveryHoldingQuantity} HELD` : "BUY BEFORE DELIVERY SELL" : afterHoursDeliveryCanQueue ? `QUEUE ${side} ${quantity} ${selected.symbol}` : !verifiedLivePrice ? `WAITING FOR ${selectedVenueLabel === "NSE" ? "UPSTOX" : selectedVenueLabel}` : !selectedMarketOrdersAllowed ? selectedIsWatchOnly ? "WATCH ONLY" : "MARKET CLOSED" : !selectedDeltaSymbol && product === "INTRADAY" && !intradayOrdersAllowed ? "INTRADAY CLOSED" : `${side} ${quantity} ${selected.symbol}`}<ChevronRight size={18} /></button>
          <p className="disclaimer"><Bot size={15} /> Simulation only. Orders are saved on this device and never reach an exchange.</p>
          <div className="recent-orders-mini">
            <div className="section-line"><b>Recent orders</b><button onClick={() => setOrdersOpen(true)}>View all</button></div>
            {todayOrders.slice(0, 3).map((order) => <div className="mini-order" key={order.id}><span className={order.side === "BUY" ? "buy-tag" : "sell-tag"}>{order.side}</span><button className="mini-order-symbol stock-identity" onClick={() => openPositionChart(order.symbol)}><StockLogo {...order} size={28} /><span><b>{order.symbol}</b><small>{order.quantity} × {order.price.toFixed(2)}</small></span></button><small>{order.time}</small></div>)}
            {!todayOrders.length && <div className="no-orders">Today&apos;s simulated trades will appear here.</div>}
          </div>
          </>}
        </aside>
      </div>}

      {activeNavigationSection === "fno" && selected.assetType === "OPTION" && spotInstrument && fnoTopInstrument && (
        <FnoChartWorkspace
          priceActionsHostRef={setFnoPriceActionsHost}
          priceTasks={priceTasks}
          onPriceAction={(instrument, price, mode) => setPriceRequest({ instrument, price, mode })}
          onReplay={setReplayInstrument}
          compareInstruments={tradingUniverse}
          topInstrument={fnoTopInstrument}
          topMode={fnoTopMode}
          canToggleFuture={Boolean(fnoFutureInstrument)}
          option={selected}
          timeframe={timeframe}
          topPrice={verifiedTopPrice}
          topTick={topQuote && fnoTopInstrument ? { instrumentKey: fnoTopInstrument.instrumentKey, price: topQuote.lastPrice, timestampMs: Date.parse(topQuote.lastTradeAt) } : undefined}
          optionTick={selectedQuote ? { instrumentKey: selected.instrumentKey, price: selectedQuote.lastPrice, timestampMs: Date.parse(selectedQuote.lastTradeAt) } : undefined}
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
          onTimeframeChange={chooseTimeframe}
          onToggleTopMode={() => setFnoTopMode((current) => current === "SPOT" && fnoFutureInstrument ? "FUTURE" : "SPOT")}
          onToggleOptionType={() => void toggleFnoOptionType()}
          onQuantityChange={(nextQuantity) => setQuantityInput(String(nextQuantity))}
          onOpenOrder={(nextSide, mode) => { if (mode === "Market") { setOrderType(mode); openOrderSheet(nextSide); } else setPriceRequest({ instrument: selected, price: verifiedLivePrice ?? selected.price, mode: "order", side: nextSide, orderType: "Limit" }); }}
          ordersEnabled={marketOrdersAllowed}
          orderTool={{ enabled: activeRiskToolEnabled, side: riskToolSide, entryPrice: riskEntryPrice, targetPrice: selectedProtection?.targetPrice ?? 0, stopLossPrice: selectedProtection?.stopLossPrice ?? 0, quantity: riskDisplayQuantity }}
          onOrderToolChange={updateChartRiskLevel}
          onOrderToolExit={selectedPosition.quantity > 0 ? () => exitPosition(selectedPosition.quantity) : undefined}
          tradeMarkers={selectedTradeMarkers}
          onFeedStatus={handleFeedStatus}
          chartTheme={theme}
        />
      )}

      {activeNavigationSection === "fno" && fnoListOpen && <FnoListsWorkspace quotes={marketQuotes} starredSymbols={customWatchlistSymbols} onQuoteKeysChange={setFnoListQuoteKeys} onSelect={openFnoNormalChart} onFutureSelect={(underlying) => { const nearest = underlying.futures?.find((contract) => contract.expiry >= futureTradingDate); if (!nearest) { setToast("No active stock future is available for this symbol."); return; } openNavigationSection("trade"); chooseTradeInstrument(futureToInstrument(nearest, underlying)); }} onStar={openFnoWatchlistPicker} onClose={() => {
        if (selected.assetType === "OPTION" && spotInstrument) setFnoListOpen(false);
        else closeFnoWorkspace();
      }} />}

      {homeOpen && <HomeWorkspace
        key={user?.id ?? 'guest'}
        preferenceOwner={user?.id ?? 'guest'}
        favouriteSymbols={[...new Set(customWatchlists.flatMap(list => list.symbols))]}
        firstName={typeof user?.user_metadata?.full_name === "string" ? user.user_metadata.full_name : undefined}
        indices={LIVE_INDEX_TICKERS.map((item) => {
          const quote = marketQuotes[item.instrumentKey];
          const asOf=quote?.lastTradeAt||quote?.updatedAt,at=Date.parse(asOf??'');
          const available=quote&&Number.isFinite(quote.lastPrice)&&quote.lastPrice>0;
          const isFresh=Boolean(available&&clock&&Number.isFinite(at)&&at<=clock.getTime()+5000&&clock.getTime()-at<=90_000);
          const hasChange=available&&Number.isFinite(quote.previousClose)&&quote.previousClose>0;
          return { symbol: item.symbol, label: item.label, price: available?quote.lastPrice:null, points: hasChange&&Number.isFinite(quote.netChange)?quote.netChange:null, changePercent: hasChange&&Number.isFinite(quote.changePercent)?quote.changePercent:null, live: isFresh && marketStatus.isOpen && feedStatus.mode === "live", asOf };
        })}
        feedLive={feedStatus.mode === "live"}
        balance={balance}
        globalWallet={globalTrading.account?.wallet ?? null}
        globalWalletError={globalTrading.error}
        globalAvailable={globalTrading.account ? availablePerpCash(globalTrading.account) : null}
        globalPositions={[...(globalTrading.account?.positions.map(position => ({ symbol: position.symbol, side: position.side === 'BUY' ? 'Long' : 'Short' })) ?? []), ...(globalTrading.account?.optionPositions?.map(position => ({ symbol: position.symbol, side: position.side === 'BUY' ? 'Long' : 'Short' })) ?? [])]}
        globalOpenOrders={(globalTrading.account?.orders.length ?? 0) + (globalTrading.account?.optionOrders?.length ?? 0)}
        globalOpenPnl={globalOpenPnl}
        globalPnlComplete={!!globalTrading.account && globalTrading.account.positions.every(position => freshPerpQuote(globalTrading.snapshots[position.symbol]?.quote, globalTrading.clock)) && (globalTrading.account.optionPositions ?? []).every(position => freshOptionQuote(globalTrading.optionSnapshots[position.symbol]?.quote, globalTrading.clock))}
        onAddCash={openFunds}
        todayPnl={todayClosedPnl+(homeOpenDayChange??0)}
        realisedToday={todayClosedPnl}
        openChangeToday={homeOpenDayChange}
        sessionLabel={marketStatus.isOpen?'Market open':/holiday/i.test(marketStatus.message)?'Market holiday':/checking|unavailable/i.test(marketStatus.message)?'Session unconfirmed':'Market closed'}
        sessionMessage={marketStatus.message}
        attention={[...positionAttention(openPositions,protections,orders),...(homeAlerts.ownerId===(user?.id??'local')?homeAlerts.items:[])].slice(0,3)}
        onAttention={(item:HomeAttention)=>{if(item.target.kind==='alerts'){setHomeAlertRequest({key:Date.now(),tab:item.target.tab,id:item.target.id});}else{setHomeOpen(false);setWorkspaceMode('trade');openPositionChart(item.target.symbol);setProduct(item.target.product);}}}
        resumeChart={chartPreferencesReady?{symbol:selected.symbol,timeframe}:undefined}
        onResumeChart={()=>openNavigationSection(workspaceMode==='fno'?'fno':'trade')}
        onOpenRealised={()=>{setPnlScope({...DEFAULT_PNL_SCOPE,period:'custom',start:pnlToday,end:pnlToday});setSelectedPnlDateKey(null);setPnlDrill(null);setPnlHistoryFilter('all');openNavigationSection('pnl');setPnlTab('trades');}}
        holdingsCount={holdings.length}
        openPositionsCount={openPositions.length}
        closedTradesCount={closedTrades.length}
        stockOptions={homeStockOptions}
        cards={homeCards}
        riskSummary={homeRiskSummary}
        onOpenWatchlist={() => openNavigationSection("watchlist")}
        onOpenHoldings={() => openNavigationSection("holdings")}
        onOpenPositions={() => { setHomeOpen(false); setPositionsOpen(true); }}
        onOpenTradeHistory={() => {
          setSelectedPnlDateKey(null);
          setPnlHistoryFilter("all");
          openNavigationSection("pnl");
          setPnlHistoryOnly(true);
          setPnlTradeMenuId(null);
          setTradeSelection(null);
        }}
        onOpenPnl={() => openNavigationSection("pnl")}
        onOpenStock={(symbol) => {
          const globalInstrument = globalInstruments.find((item) => item.symbol === symbol);
          if (globalInstrument) {
            openNavigationSection("trade");
            chooseTradeInstrument(globalInstrument);
            return;
          }
          const stock = stockUniverse.find((item) => item.symbol === symbol);
          const index = SEARCHABLE_INDEX_TICKERS.find((item) => item.symbol === symbol);
          openNavigationSection("trade");
          if (stock) chooseTradeInstrument(stock);
          else if (index) {
            const quote = marketQuotes[index.instrumentKey] ?? marketQuotes[index.symbol];
            chooseTradeInstrument({ symbol: index.symbol, name: index.name, exchange: "NSE", price: quote?.lastPrice ?? 0, change: quote?.changePercent ?? 0, instrumentKey: index.instrumentKey, categories: [], assetType: "INDEX" });
          }
        }}
      />}

      <nav className="mobile-bottom-nav" aria-label="Quick navigation" data-has-active={true} style={{ "--nav-index": activeNavigationSection === "home" ? 0 : activeNavigationSection === "trade" ? 1 : activeNavigationSection === "fno" ? 2 : marketNavigationActive ? 3 : activeNavigationSection === "ipo" ? 4 : 5 } as CSSProperties}>
        <button className={activeNavigationSection === "home" ? "active" : ""} onClick={() => openNavigationSection("home")}><Home size={19} /><span>Home</span></button>
        <button className={activeNavigationSection === "trade" ? "active" : ""} onClick={() => openNavigationSection("trade")}><LineChart size={19} /><span>Charts</span></button>
        <button className={activeNavigationSection === "fno" ? "active" : ""} onClick={() => openNavigationSection("fno")}><CandlestickChart size={19} /><span>F&amp;O</span></button>
        <button className={marketNavigationActive ? "active" : ""} onClick={() => { if (!marketNavigationActive) openNavigationSection("markets"); }}><Bookmark size={19} /><span>Watchlist</span></button>
        <button className={activeNavigationSection === "ipo" ? "active" : ""} onClick={() => openNavigationSection("ipo")}><Rocket size={19} /><span>IPO</span></button>
        <button className={["holdings", "orders", "pnl"].includes(activeNavigationSection) ? "active" : ""} onClick={() => openNavigationSection("pnl")}><ChartNoAxesCombined size={19} /><span>P&amp;L</span></button>
      </nav>

      {replayInstrument && <BarReplayDialog key={replayInstrument.instrumentKey} instrument={replayInstrument} timeframe={replayReviewTimeframe ?? timeframe} theme={theme} onClose={() => { setReplayInstrument(null); setReplayReviewTimeframe(null); }} />}
      {coachOpen && <TradingCoach initialTab={coachTab} timeframe={timeframe} theme={theme} selected={selected} orders={orders} trades={closedTrades} limits={tradingLimits} proposedOptionLeg={proposedOptionLeg} spotPrice={optionSpotPrice} onLimitsChange={setTradingLimits} onReviewTrade={(tradeId) => { setCoachOpen(false); openNavigationSection("pnl"); setPnlHistoryOnly(true); setPnlHistoryFilter("all"); setPnlTradeMenuId(tradeId); }} onOpenInsights={() => { setCoachOpen(false); openNavigationSection("pnl"); setPnlTab("insights"); }} onClose={() => setCoachOpen(false)} />}
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
                const purchase = holdingPerformance(orders, holding.symbol, holding.livePrice, null, clock?.getTime() ?? Date.now());
                return <div className="holding-row" key={holding.symbol}>
                  <button className="holding-symbol" onClick={() => openPositionChart(holding.symbol)}><StockLogo symbol={holding.symbol} /><span><b>{holding.symbol}</b><small>{holding.name}</small></span></button>
                  <span className="holding-quantity"><b>{holding.quantity} shares</b><small>Avg. {formatInr(holding.averagePrice)}</small><small>{purchase.purchasedAt ? `Bought ${new Date(purchase.purchasedAt).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric" })}` : "Purchase date unavailable"}</small>{purchase.latestPurchaseAt !== purchase.purchasedAt && purchase.latestPurchaseAt && <small>Last added {new Date(purchase.latestPurchaseAt).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short" })}</small>}</span>
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
              {todayOrders.map((order) => <div className="order-row" key={order.id}><span>{order.time}</span><button className="order-symbol-link" onClick={() => openPositionChart(order.symbol)}><StockLogo {...order} size={22} />{order.symbol}</button><span className={order.side === "BUY" ? "positive" : "negative"}>{order.side}</span><span>{order.quantity}</span><span>{formatInr(order.price)}</span><span>{formatInr(getOrderCharges(order).total)}</span><span className="complete-tag">{paperOrderStatusLabel(order)}</span></div>)}
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
            {!!openPositions.length && <p className="positions-help">Tap a position to view its chart. Use Exit to close it at the current live price.</p>}
            <div className="positions-list">
              {openPositions.map((position) => {
                const exitUnavailableReason = !Number.isFinite(position.livePrice) || position.livePrice <= 0
                  ? "Waiting for a live price"
                  : !marketOrdersAllowed ? marketStatus.message
                    : position.product === "INTRADAY" && !intradayOrdersAllowed ? intradayStatusMessage
                      : "";
                return <div key={`${position.symbol}-${position.product}`} className="position-row">
                  <button type="button" className="position-chart-link" onClick={() => openPositionChart(position.symbol)} aria-label={`Open ${position.symbol} chart`}>
                    <span className={position.side === "LONG" ? "buy-tag" : "sell-tag"}>{position.side}</span>
                    <span className="stock-identity"><StockLogo symbol={position.symbol} size={32} /><span><b>{position.symbol}</b><small>{position.name} · {position.product} · {position.quantity} units</small></span></span>
                    <span className="position-live-result"><b className={position.unrealizedPnl >= 0 ? "positive" : "negative"}>{position.unrealizedPnl >= 0 ? "+" : ""}{formatInr(position.unrealizedPnl)}</b><small>{Number.isFinite(position.livePrice) ? formatInr(position.livePrice) : "Live price unavailable"} · {position.returnPercent >= 0 ? "+" : ""}{position.returnPercent.toFixed(2)}%</small></span>
                    <ChevronRight size={17} />
                  </button>
                  <button type="button" className="position-exit-button" disabled={Boolean(exitUnavailableReason)} title={exitUnavailableReason || `Exit all ${position.quantity} units`} onClick={() => exitPosition(position.quantity, { symbol: position.symbol, product: position.product, side: position.side as "LONG" | "SHORT", quantity: position.quantity, livePrice: position.livePrice })}>Exit</button>
                </div>;
              })}
              {!openPositions.length && <div className="positions-empty"><BriefcaseBusiness size={30} /><b>No open positions</b><span>Open a paper buy or sell order to track it here.</span></div>}
            </div>
          </section>
        </div>
      )}
      {marketsOpen && marketsInitialGroup === "IPO" && (
        <section className="market-discovery-panel ipo-discovery-panel" aria-label="IPO opportunities">

          <IpoWorkspace ownerId={user?.id ?? "local"} key={user?.id ?? "local"} />
        </section>
      )}
      {marketsOpen && marketsInitialGroup !== "IPO" && (
        <MarketsWorkspace
          key={marketsInitialGroup}
          stockUniverse={stockUniverse}
          quotes={marketQuotes}
          onQuoteKeysChange={setMarketScannerQuoteKeys}
          onSelectCash={(item, price) => { chooseTradeInstrument({ ...item, price }); setMarketsOpen(false); }}
          onOpenWatchlist={() => openNavigationSection("watchlist")}
          group={marketsInitialGroup}
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
          <section className={`modal pnl-modal navigation-page ${pnlHistoryOnly ? "history-only" : ""}`} role="dialog" aria-modal="true" aria-label="Paper trading profit and loss" onMouseDown={(event) => event.stopPropagation()}>
            <PnlAnalytics trades={pnlScopedTrades} calendarTrades={pnlCalendarTrades} orders={orders} scope={{ ...pnlScope, day: selectedPnlDateKey }} now={clock?.getTime() ?? Date.now()} tab={pnlHistoryOnly ? "trades" : pnlTab} onTab={tab => { setPnlHistoryOnly(false); setPnlTab(tab); setTradeSelection(null); setPnlTradeMenuId(null); }} onScope={scope => { writePreference(PNL_SCOPE_KEY, scope); setPnlScope({ ...scope, day: null }); setSelectedPnlDateKey(scope.day ?? null); setPnlDrill(null); setPnlHistoryFilter("all"); setTradeSelection(null); setPnlTradeMenuId(null); }} onSelect={(ids, label) => { setPnlDrill({ ids, label }); setPnlHistoryOnly(false); setPnlTab("trades"); setPnlHistoryFilter("all"); setTradeSelection(null); setPnlTradeMenuId(null); }} />
            <div className="pnl-trade-list" ref={pnlTradeListRef} hidden={!pnlHistoryOnly && pnlTab !== "trades"}>
              {pnlDrill && <div className="pnl-drill-filter"><span>{pnlDrill.label} · {pnlDrilledTrades.length} exits</span><button onClick={() => { setPnlDrill(null); setTradeSelection(null); }}>Clear chart selection</button></div>}
              {!!visiblePnlTrades.length && selectingTrades && <div className={`pnl-selection-toolbar ${selectingTrades ? "is-selecting" : ""}`}>
                <div><b>{selectedTradeIds.length} selected</b><small>Choose the records to remove</small></div>
                <button type="button" onClick={() => { setTradeSelection(null); setPnlTradeMenuId(null); }}>Done</button>
                {selectingTrades && <div className="pnl-selection-actions"><button type="button" onClick={() => setTradeSelection({ scope: tradeSelectionScope, ids: selectedTradeIds.length === visiblePnlTrades.length ? [] : visiblePnlTrades.map((trade) => trade.id) })}>{selectedTradeIds.length === visiblePnlTrades.length ? "Deselect all" : `Select all shown (${visiblePnlTrades.length})`}</button><button type="button" className="pnl-selection-delete" disabled={!selectedTradeIds.length} onClick={() => setPendingDeleteIds(selectedTradeIds)}><Trash2 size={15} /> Delete ({selectedTradeIds.length})</button></div>}
              </div>}
              <div className="pnl-history-toolbar">
                <div className="pnl-history-tabs" role="group" aria-label="Filter completed trades">
                  {(["all", "profit", "loss"] as const).map((filter) => <button type="button" key={filter} className={pnlHistoryFilter === filter ? "active" : ""} aria-pressed={pnlHistoryFilter === filter} onClick={() => { setTradeSelection(null); setPnlHistoryFilter(filter); }}><span>{filter === "all" ? "All" : filter === "profit" ? "Profit" : "Loss"}</span><small>{filter === "all" ? pnlDrilledTrades.length : filter === "profit" ? pnlVisuals.wins : pnlVisuals.losses}</small></button>)}
                </div>
                {selectedPnlDateKey && <div className="pnl-history-filter"><b>{new Date(`${selectedPnlDateKey}T12:00:00+05:30`).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}</b><button type="button" onClick={() => { setSelectedPnlDateKey(null); setPnlDrill(null); }}>Clear selected day</button></div>}
              </div>
              {visiblePnlTrades.map((trade) => {
                const menuOpen = !selectingTrades && pnlTradeMenuId === trade.id;
                const sourceOrders = trade.sourceOrderIds
                  .map((orderId) => paperOrdersById.get(orderId))
                  .filter((order): order is PaperOrder => Boolean(order))
                  .sort((first, second) => getPaperOrderTimestamp(first) - getPaperOrderTimestamp(second));
                const reviewInstrument = sourceOrders[0] ? instrumentFromPaperOrder(sourceOrders[0], tradingUniverse) : null;
                const reviewMarkers = sourceOrders
                  .map((order, index) => orderTradeMarker(order, index === sourceOrders.length - 1 ? "EXIT" : "ENTRY"))
                  .filter((marker) => marker.time > 0);
                return (
                  <LongPressTradeRow onLongPress={() => { setTradeSelection({ scope: tradeSelectionScope, ids: selectedTradeIds.includes(trade.id) ? selectedTradeIds : [...selectedTradeIds, trade.id] }); setPnlTradeMenuId(null); }} key={`${trade.id}-${trade.symbol}`} className={`pnl-trade-row ${menuOpen ? "selected" : ""} ${selectingTrades && selectedTradeIds.includes(trade.id) ? "batch-selected" : ""}`} role={selectingTrades ? "checkbox" : "button"} tabIndex={0} aria-checked={selectingTrades ? selectedTradeIds.includes(trade.id) : undefined} aria-label={selectingTrades ? `Select ${trade.symbol} trade, ${trade.quantity} units, ${trade.closedAt ? new Date(trade.closedAt).toLocaleString("en-IN") : "legacy"}, ${formatInr(trade.netPnl)}` : `Open ${trade.symbol} entry and exit trade chart`} aria-expanded={selectingTrades ? undefined : menuOpen} onClick={() => selectingTrades ? toggleTradeSelection(trade.id) : setPnlTradeMenuId(menuOpen ? null : trade.id)} onKeyDown={(event) => { if (event.target !== event.currentTarget) return; if (event.key === "Enter" || event.key === " ") { event.preventDefault(); if (selectingTrades) toggleTradeSelection(trade.id); else setPnlTradeMenuId(menuOpen ? null : trade.id); } }}>
                    {selectingTrades ? <span className={`trade-selection-check ${selectedTradeIds.includes(trade.id) ? "checked" : ""}`} aria-hidden="true">{selectedTradeIds.includes(trade.id) && <Check size={17} strokeWidth={3} />}</span> : <span className={pnlOutcome(trade.netPnl) === "profit" ? "win" : pnlOutcome(trade.netPnl) === "loss" ? "loss" : "flat"}>{pnlOutcome(trade.netPnl) === "profit" ? "WIN" : pnlOutcome(trade.netPnl) === "loss" ? "LOSS" : "FLAT"}</span>}
                    <button type="button" className="stock-identity pnl-stock-chart-link" aria-label={selectingTrades ? `Select ${trade.symbol} trade` : `Open ${trade.symbol} price chart`} title={selectingTrades ? undefined : `Open ${trade.symbol} price chart`} onClick={event => { event.stopPropagation(); if (selectingTrades) toggleTradeSelection(trade.id); else if (sourceOrders[0]) openPaperOrderChart(sourceOrders[0]); else openPositionChart(trade.symbol); }}><StockLogo symbol={trade.symbol} size={36} /><span><b>{trade.symbol}<ChevronRight size={16} aria-hidden="true" /></b><small>{trade.product} · {trade.closedAt ? new Date(trade.closedAt).toLocaleDateString("en-IN") : "Legacy trade"}</small><em>Open price chart</em></span></button>
                    <TradeExecutionSummary trade={trade} exitOrder={paperOrdersById.get(trade.id)} status={paperOrdersById.get(trade.id) ? paperOrderStatusLabel(paperOrdersById.get(trade.id)!) : "Complete"} />
                    {menuOpen && <TradeReviewDialog symbol={trade.symbol} theme={theme} onClose={() => setPnlTradeMenuId(null)}>
                    <div className="pnl-review-executions"><span>Entry: {trade.openedAt ? new Date(trade.openedAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) : "Time unavailable"}</span><span>Exit: {trade.closedAt ? new Date(trade.closedAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) : "Time unavailable"}</span><span>Fees: {formatInr(trade.charges)} · included in net P&amp;L</span></div>
                    {reviewInstrument && reviewMarkers.length > 0 ? (
                      <div className="pnl-trade-review-chart" onClick={(event) => event.stopPropagation()}>
                        <div className="pnl-trade-review-head">
                          <span><b>Trade review</b><small>Entry and exit candles</small></span>
                          <button type="button" className="chart-replay-link" onClick={() => { setPnlTradeMenuId(null); setReplayReviewTimeframe(pnlReviewTimeframe); setReplayInstrument(reviewInstrument); }} aria-label={`Bar replay for ${reviewInstrument.symbol}`} title="Bar replay"><StepBack size={17} /></button>
                          <label className="pnl-review-period">Timeframe<select value={pnlReviewTimeframe} onChange={event => chooseTimeframe(event.target.value)}>{CHART_TIMEFRAMES.map(period => <option key={period} value={period}>{period}</option>)}</select></label>
                        </div>
                        <div className="pnl-trade-review-body">
                          <MarketChart
                            key={`review-${trade.id}-${reviewInstrument.instrumentKey}-${pnlReviewTimeframe}`}
                            instrument={reviewInstrument}
                            timeframe={pnlReviewTimeframe}
                            activeTool="cursor"
                            magnet={magnet}
                            hiddenDrawings
                            candlesOnly={hiddenDrawings}
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
                    ) : <div className="positions-empty">Historical entry and exit candles are unavailable for this record.</div>}
                    <div className="pnl-trade-actions"><small>Remove only an incorrect record.</small><button type="button" onClick={(event) => { event.stopPropagation(); setPnlTradeMenuId(null); setPendingDeleteIds([trade.id]); }}><Trash2 size={14} /> Delete trade</button></div>
                    </TradeReviewDialog>}
                  </LongPressTradeRow>
                );
              })}
              {!visiblePnlTrades.length && <div className="positions-empty"><Activity size={30} /><b>{selectedPnlDateKey ? "No completed trades on this date" : pnlHistoryFilter === "profit" ? "No profitable trades yet" : pnlHistoryFilter === "loss" ? "No losing trades" : "No completed trades yet"}</b><span>{selectedPnlDateKey ? "Choose another calendar date or show all dates." : "Completed paper trades will appear here."}</span></div>}
            </div>
            {pendingDeletion && <TradeDeleteDialog trades={pendingDeletion.trades} error={pendingDeletion.error} onCancel={() => setPendingDeleteIds(null)} onConfirm={confirmClosedTradeDeletion} />}
          </section>
        </div>
      )}
      {fundsOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setFundsOpen(false)}>
          <section className="modal funds-modal" role="dialog" aria-modal="true" aria-label="Add virtual money" onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-head"><div><span className="eyebrow">{fundsCurrency === 'USD' ? 'Global markets · USD' : 'Indian markets · INR'}</span><h2>Add practice cash</h2></div><button className="icon-button" onClick={() => setFundsOpen(false)} aria-label="Close virtual funds"><X size={20} /></button></div>
            <div className="funds-wallet-switch" role="group" aria-label="Choose practice wallet"><button className={fundsCurrency === 'INR' ? 'active' : ''} aria-pressed={fundsCurrency === 'INR'} onClick={() => { setFundsCurrency('INR'); setFundsInput(''); }}>🇮🇳 India · ₹</button><button className={fundsCurrency === 'USD' ? 'active' : ''} aria-pressed={fundsCurrency === 'USD'} onClick={() => { setFundsCurrency('USD'); setFundsInput(''); }}>🌐 Global · $</button></div>
            <div className="virtual-balance-card"><span>{fundsCurrency === 'USD' ? 'Global dollar wallet' : 'Indian rupee wallet'}</span><b>{fundsCurrency === 'USD' ? globalTrading.account ? formatUsd(globalTrading.account.wallet) : 'Loading…' : formatInr(balance)}</b><small>Balances stay separate. Adding cash here never changes the other wallet.</small></div>
            <label className="funds-input-label">Amount to add ({fundsCurrency === 'USD' ? '$' : '₹'})<input type="number" min="0.01" step="0.01" inputMode="decimal" placeholder="Enter any positive amount" value={fundsInput} onChange={(event) => setFundsInput(event.target.value)} /></label>
            <div className="funds-shortcuts">{(fundsCurrency === 'USD' ? [[100, '$100'], [1000, '$1,000'], [10000, '$10,000']] : [[1000, '₹1,000'], [10000, '₹10,000'], [100000, '₹1 lakh']]).map(([amount, label]) => <button key={label} onClick={() => setFundsInput(String(amount))}>{label}</button>)}</div>
            <button className="primary-button" disabled={globalTrading.busy || (fundsCurrency === 'USD' && !globalTrading.account)} onClick={() => void addVirtualFunds()}>{globalTrading.busy ? 'SAVING…' : `ADD ${fundsCurrency === 'USD' ? 'DOLLARS' : 'RUPEES'}`}</button>
            <p className="field-help">Practice cash only. No real deposit, currency conversion or broker transfer takes place.</p>
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
                <a className="download-primary" href="/downloads/PaperTrade-IN-v1.23-beta.apk" download><Download size={18} /> Download Android APK</a>
              </article>
              <article>
                <b>iPhone / iPad app</b>
                <small>Open <strong>papertrade.site</strong> in Safari, tap Share, then choose <strong>Add to Home Screen</strong>. It opens like an iOS app and stays synced with your account.</small>
                <Link className="download-primary ios-install-link" href="/" onClick={() => setDownloadOpen(false)}><Smartphone size={18} /> Open iOS web app</Link>
              </article>
            </div>
            <div className="download-facts"><span><ShieldCheck size={15} /><b>Private sign-in</b><small>Google and Supabase handle authentication. The app never sees your Google password.</small></span><span><LockKeyhole size={15} /><b>Verifiable Android file</b><small>SHA-256 integrity fingerprint</small></span></div>
            <code className="download-hash">AFA1D398275C8444934B3CB6AEF85E81556C63B4E0A291C1FEE9A193E5B68967</code>
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
            <div className={`account-sync sync-${syncStatus}`}>{syncStatus === "synced" ? <CheckCircle2 size={17} /> : syncStatus === "saving" || syncStatus === "loading" ? <CandleLoader compact label="Syncing portfolio" /> : <Cloud size={17} />}<span><b>{syncStatus === "synced" ? "Portfolio synced" : syncStatus === "saving" ? "Saving portfolio…" : syncStatus === "error" ? "Cloud setup required" : "Loading portfolio…"}</b><small>Virtual balance, orders, watchlists and preferences</small></span></div>
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
      {toast && <div className="toast" role="status" aria-live="polite"><Target size={18} /> {toast}</div>}
    </main>
    </StockLogoProvider>
  );
}
