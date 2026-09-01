"use client";

import { useCallback, useSyncExternalStore, type Dispatch, type SetStateAction } from "react";
import type { ChartIndicators } from "@/components/MarketChart";

const STORAGE_KEY = "papertrade-chart-indicators-v1";
const CHANGE_EVENT = "papertrade:chart-indicators-change";
const EMPTY_INDICATORS: ChartIndicators = {
  ema5: false, ema21: false, ema30: false, ema50: false, ema100: false, ema200: false,
  sma20: false, sma50: false, sma200: false,
  bollinger: false, vwap: false, supertrend: false,
  rsi: false, macd: false, pivots: false,
};

function normalizeIndicators(value: unknown): ChartIndicators {
  const candidate = value && typeof value === "object" ? value as Partial<ChartIndicators> : {};
  return Object.fromEntries(
    Object.keys(EMPTY_INDICATORS).map((key) => [key, candidate[key as keyof ChartIndicators] === true]),
  ) as unknown as ChartIndicators;
}

const indicatorCache = new Map<string, { serialized: string; indicators: ChartIndicators }>();

function readIndicators(storageKey = STORAGE_KEY): ChartIndicators {
  if (typeof window === "undefined") return EMPTY_INDICATORS;
  try {
    const serialized = window.localStorage.getItem(storageKey) ?? window.localStorage.getItem(STORAGE_KEY) ?? "{}";
    const cached = indicatorCache.get(storageKey);
    if (cached?.serialized === serialized) return cached.indicators;
    const indicators = normalizeIndicators(JSON.parse(serialized));
    indicatorCache.set(storageKey, { serialized, indicators });
    return indicators;
  } catch {
    return EMPTY_INDICATORS;
  }
}

function subscribeIndicators(onStoreChange: () => void) {
  if (typeof window === "undefined") return () => undefined;
  const notify = () => onStoreChange();
  window.addEventListener(CHANGE_EVENT, notify);
  window.addEventListener("storage", notify);
  return () => {
    window.removeEventListener(CHANGE_EVENT, notify);
    window.removeEventListener("storage", notify);
  };
}

export function usePersistentChartIndicators(userKey?: string): [ChartIndicators, Dispatch<SetStateAction<ChartIndicators>>] {
  const storageKey = userKey ? `${STORAGE_KEY}:${userKey}` : STORAGE_KEY;
  const indicators = useSyncExternalStore(subscribeIndicators, () => readIndicators(storageKey), () => EMPTY_INDICATORS);

  const setIndicators = useCallback<Dispatch<SetStateAction<ChartIndicators>>>((update) => {
    const current = readIndicators(storageKey);
    const next = normalizeIndicators(typeof update === "function" ? update(current) : update);
    const serialized = JSON.stringify(next);
    indicatorCache.set(storageKey, { serialized, indicators: next });
    window.localStorage.setItem(storageKey, serialized);
    window.dispatchEvent(new CustomEvent<ChartIndicators>(CHANGE_EVENT, { detail: next }));
  }, [storageKey]);

  return [indicators, setIndicators];
}
