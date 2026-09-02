import { Capacitor } from "@capacitor/core";
import { ALLOTMENT_ALERT_ENABLED_KEY, ALLOTMENT_ALERT_EVENT, ALLOTMENT_ALERT_STATE_KEY, allotmentAlertKey, shouldSendAllotmentAlert, type IpoAllotment } from "./ipo-allotment";
import { getNativeTradeAlert } from "./native-alert";
import { addPaperTradeNotification } from "./notification-center";

export function readAllotmentAlertEnabled() {
  try { return typeof window !== "undefined" && Number(localStorage.getItem(ALLOTMENT_ALERT_ENABLED_KEY)) > 0; } catch { return false; }
}

export async function setAllotmentAlertEnabled(enabled: boolean) {
  if (enabled) {
    if (Capacitor.getPlatform() === "android") {
      const result = await getNativeTradeAlert().requestPermission();
      if (result && result.granted === false) return false;
    } else {
      if (!("Notification" in window)) return false;
      const permission = Notification.permission === "default" ? await Notification.requestPermission() : Notification.permission;
      if (permission !== "granted") return false;
      if ("serviceWorker" in navigator) await navigator.serviceWorker.register("/notifications-sw.js", { scope: "/notifications/" });
    }
  }
  localStorage.setItem(ALLOTMENT_ALERT_ENABLED_KEY, enabled ? String(Date.now()) : "0");
  window.dispatchEvent(new Event(ALLOTMENT_ALERT_EVENT));
  return true;
}

async function showSystemAlert(ipo: IpoAllotment, title: string, body: string, id: string) {
  if (Capacitor.getPlatform() === "android") {
    await getNativeTradeAlert().show({ title, body, notificationId: id });
  } else if ("Notification" in window && Notification.permission === "granted") {
    if ("serviceWorker" in navigator) {
      const registration = await navigator.serviceWorker.register("/notifications-sw.js", { scope: "/notifications/" });
      if (!registration.active) {
        const worker = registration.installing ?? registration.waiting;
        if (worker) await new Promise<void>((resolve, reject) => {
          const timeout = window.setTimeout(() => { worker.removeEventListener("statechange", changed); reject(new Error("Notification service unavailable")); }, 6_000);
          const changed = () => {
            if (worker.state === "activated") { window.clearTimeout(timeout); worker.removeEventListener("statechange", changed); resolve(); }
          };
          worker.addEventListener("statechange", changed);
          changed();
        });
      }
      await registration.showNotification(title, { body, icon: "/papertrade-icon-192.png", tag: id, data: { registrar: ipo.registrar } });
    } else {
      const notification = new Notification(title, { body, icon: "/papertrade-icon-192.png", tag: id });
      notification.onclick = () => { window.open(`/ipo-allotment/${encodeURIComponent(ipo.registrar)}`, "_blank", "noopener,noreferrer"); notification.close(); };
    }
  }
}

export async function processAllotmentAlerts(ipos: IpoAllotment[]) {
  const process = async () => {
    if (!readAllotmentAlertEnabled()) return;
    let seen: Record<string, number> = {};
    try {
      const stored: unknown = JSON.parse(localStorage.getItem(ALLOTMENT_ALERT_STATE_KEY) ?? "{}");
      if (stored && typeof stored === "object" && !Array.isArray(stored)) seen = stored as Record<string, number>;
    } catch { /* A malformed local preference must never break IPO browsing. */ }
    const enabledAt = Number(localStorage.getItem(ALLOTMENT_ALERT_ENABLED_KEY));
    for (const ipo of ipos) {
      if (!shouldSendAllotmentAlert(ipo, seen, enabledAt)) continue;
      const id = allotmentAlertKey(ipo);
      const title = ipo.state === "published" ? `${ipo.name}: allotment published` : `${ipo.name}: listed — check allotment`;
      const body = ipo.state === "published"
        ? "The registrar has published the basis of allotment. Open the official result website, select this IPO and enter your PAN there."
        : "Listing is confirmed by Upstox. Check your allotment on the official result website; select the IPO and enter your PAN there.";
      addPaperTradeNotification({ id, kind: "ipo", title, body, allotmentRegistrar: ipo.registrar });
      seen[id] = Date.now();
      localStorage.setItem(ALLOTMENT_ALERT_STATE_KEY, JSON.stringify(seen));
      // In-app alerts remain available even if OS notification delivery fails.
      await showSystemAlert(ipo, title, body, id).catch(() => undefined);
    }
  };
  if (typeof navigator !== "undefined" && navigator.locks) await navigator.locks.request("papertrade-allotment-alerts", process);
  else await process();
}
