import { registerPlugin } from "@capacitor/core";

type NativeAlertPlugin = {
  requestPermission: () => Promise<{ granted?: boolean } | void>;
  show: (options: { title: string; body: string; notificationId?: string }) => Promise<void>;
  setIpoAlerts: (options: { enabled: boolean }) => Promise<void>;
  setPriceAlerts: (options: { alerts: NativePriceAlert[] }) => Promise<void>;
  consumeTriggeredPriceAlerts: () => Promise<{ alerts?: NativeTriggeredPriceAlert[] }>;
};

export type NativePriceAlert = {
  id: string;
  symbol: string;
  instrumentKey: string;
  product: "INTRADAY" | "DELIVERY";
  side: "LONG" | "SHORT";
  targetPrice?: number;
  stopLossPrice?: number;
};

export type NativeTriggeredPriceAlert = {
  id: string;
  symbol: string;
  trigger: "TARGET" | "STOP_LOSS";
  triggeredPrice: number;
  triggeredAt: number;
};

type AlertGlobal = typeof globalThis & { __paperTradeNativeAlert?: NativeAlertPlugin };

export function getNativeTradeAlert() {
  const alertGlobal = globalThis as AlertGlobal;
  alertGlobal.__paperTradeNativeAlert ??= registerPlugin<NativeAlertPlugin>("TradeAlert");
  return alertGlobal.__paperTradeNativeAlert;
}
