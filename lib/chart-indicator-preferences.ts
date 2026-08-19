"use client";

import { useCallback, useSyncExternalStore, type Dispatch, type SetStateAction } from "react";
import type { ChartIndicators } from "@/components/MarketChart";

const STORAGE_KEY = "papertrade-chart-indicators-v1";
const CHANGE_EVENT = "papertrade:chart-indicators-change";
const EMPTY_INDICATORS: ChartIndicators = {
  ema5: false, ema21: false, ema50: false, ema200: false,
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

let cachedSerialized = "";
let cachedIndicators = EMPTY_INDICATORS;

function readIndicators(): ChartIndicators {
  if (typeof window === "undefined") return EMPTY_INDICATORS;
  try {
    const serialized = window.localStorage.getItem(STORAGE_KEY) ?? "{}";
    if (serialized === cachedSerialized) return cachedIndicators;
    cachedSerialized = serialized;
    cachedIndicators = normalizeIndicators(JSON.parse(serialized));
    return cachedIndicators;
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

export function usePersistentChartIndicators(): [ChartIndicators, Dispatch<SetStateAction<ChartIndicators>>] {
  const indicators = useSyncExternalStore(subscribeIndicators, readIndicators, () => EMPTY_INDICATORS);

  const setIndicators = useCallback<Dispatch<SetStateAction<ChartIndicators>>>((update) => {
    const current = readIndicators();
    const next = normalizeIndicators(typeof update === "function" ? update(current) : update);
    const serialized = JSON.stringify(next);
    cachedSerialized = serialized;
    cachedIndicators = next;
    window.localStorage.setItem(STORAGE_KEY, serialized);
    window.dispatchEvent(new CustomEvent<ChartIndicators>(CHANGE_EVENT, { detail: next }));
  }, []);

  return [indicators, setIndicators];
}
