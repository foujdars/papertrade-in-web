"use client";

import { useCallback, useSyncExternalStore, type Dispatch, type SetStateAction } from "react";
import { SMC_LESSONS, type SmcKind } from "./smc-learner";
import { DEFAULT_CHART_STYLE, isChartStyle, type ChartStyleId } from "./chart-style";
import { isCompareColor, isCompareMode, sanitizeComparedSymbols, type ComparedSymbol, type CompareMode } from "./chart-compare";

// Device preferences intentionally apply to every symbol, timeframe and workspace.
const KEY = "papertrade-chart-view-v1";
const EVENT = "papertrade:chart-view-change";
const GROUPS = ["Structure", "FVG", "Order blocks", "Breakers", "Liquidity"];
type Preferences = {
  magnet: boolean;
  hidden: boolean;
  smcFilters: string[];
  smcRange: boolean;
  smcLesson: SmcKind;
  drawingFavorites: string[];
  showDrawingFavorites: boolean;
  chartStyle: ChartStyleId;
  comparedSymbols: ComparedSymbol[];
  compareMode: CompareMode;
  primaryLineColor: string;
};
const DEFAULTS: Preferences = { magnet: false, hidden: false, smcFilters: GROUPS, smcRange: false, smcLesson: "FVG", drawingFavorites: ["trend-line", "parallel-channel", "horizontal-ray", "rectangle", "vertical-line", "horizontal-line", "volume-profile", "anchored-volume-profile", "session-volume-profile", "price-range", "fib-retracement"], showDrawingFavorites: true, chartStyle: DEFAULT_CHART_STYLE, comparedSymbols: [], compareMode: "percent", primaryLineColor: "#2962FF" };
let snapshot = DEFAULTS;
let cachedRaw: string | null | undefined;

function normalize(value: unknown): Preferences {
  const v = value && typeof value === "object" ? value as Partial<Preferences> : {};
  return {
    magnet: v.magnet === true,
    hidden: v.hidden === true,
    drawingFavorites: Array.isArray(v.drawingFavorites) ? Array.from(new Set(v.drawingFavorites.filter(x => typeof x === "string" && /^[a-z0-9-]{1,60}$/.test(x)))).slice(0, 120) : DEFAULTS.drawingFavorites,
    showDrawingFavorites: v.showDrawingFavorites !== false,
    // An empty selection is deliberate, not a request to restore every filter.
    smcFilters: Array.isArray(v.smcFilters) ? GROUPS.filter(g => v.smcFilters!.includes(g)) : GROUPS,
    smcRange: v.smcRange === true,
    smcLesson: typeof v.smcLesson === "string" && Object.hasOwn(SMC_LESSONS, v.smcLesson) ? v.smcLesson : "FVG",
    chartStyle: isChartStyle(v.chartStyle) ? v.chartStyle : DEFAULT_CHART_STYLE,
    comparedSymbols: sanitizeComparedSymbols(v.comparedSymbols),
    compareMode: isCompareMode(v.compareMode) ? v.compareMode : "percent",
    primaryLineColor: isCompareColor(v.primaryLineColor) ? v.primaryLineColor : "#2962FF",
  };
}

function read(): Preferences {
  if (typeof window === "undefined") return DEFAULTS;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw !== cachedRaw) {
      let value: unknown;
      try { value = JSON.parse(raw ?? "{}"); } catch { value = {}; }
      snapshot = normalize(value);
      cachedRaw = raw;
    }
  } catch { /* Keep settings usable in memory when device storage is blocked. */ }
  return snapshot;
}

function subscribe(notify: () => void) {
  const storage = (event: StorageEvent) => { if (event.key === KEY || event.key === null) notify(); };
  window.addEventListener(EVENT, notify);
  window.addEventListener("storage", storage);
  return () => { window.removeEventListener(EVENT, notify); window.removeEventListener("storage", storage); };
}

export function useChartPreference<K extends keyof Preferences>(key: K): [Preferences[K], Dispatch<SetStateAction<Preferences[K]>>] {
  const preferences = useSyncExternalStore(subscribe, read, () => DEFAULTS);
  const setValue = useCallback<Dispatch<SetStateAction<Preferences[K]>>>((update) => {
    const current = read();
    const value = typeof update === "function" ? (update as (v: Preferences[K]) => Preferences[K])(current[key]) : update;
    snapshot = normalize({ ...current, [key]: value });
    const raw = JSON.stringify(snapshot);
    try { localStorage.setItem(KEY, raw); cachedRaw = raw; } catch { /* Retain the in-memory snapshot. */ }
    window.dispatchEvent(new Event(EVENT));
  }, [key]);
  return [preferences[key], setValue];
}
