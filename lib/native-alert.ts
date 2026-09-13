import { registerPlugin } from "@capacitor/core";

type NativeAlertPlugin = {
  configurePush: (options: { preferences: import("./notification-policy").NotificationPreferences; requestPermission: boolean }) => Promise<{ token?: string; error?: string }>;
  consumeNotifications: () => Promise<{ notifications?: Array<{ id:string;title:string;body:string;url:string;createdAt:number;kind:"ipo"|"allotment"|"portfolio"|"practice" }> }>;
  requestPermission: () => Promise<{ granted?: boolean } | void>;
  show: (options: { title: string; body: string; notificationId?: string; kind?: string; url?: string; silent?: boolean }) => Promise<void>;
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
