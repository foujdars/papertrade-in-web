import { registerPlugin } from "@capacitor/core";

type NativeAlertPlugin = {
  requestPermission: () => Promise<{ granted?: boolean } | void>;
  show: (options: { title: string; body: string; notificationId?: string }) => Promise<void>;
  setIpoAlerts: (options: { enabled: boolean }) => Promise<void>;
};

type AlertGlobal = typeof globalThis & { __paperTradeNativeAlert?: NativeAlertPlugin };

export function getNativeTradeAlert() {
  const alertGlobal = globalThis as AlertGlobal;
  alertGlobal.__paperTradeNativeAlert ??= registerPlugin<NativeAlertPlugin>("TradeAlert");
  return alertGlobal.__paperTradeNativeAlert;
}
