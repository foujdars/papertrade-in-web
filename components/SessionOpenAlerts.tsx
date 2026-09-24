"use client";
import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { sessionOpenNotice } from "@/lib/market-sessions";
import { addPaperTradeNotification } from "@/lib/notification-center";
import { NOTIFICATION_SETTINGS_EVENT, readNotificationPreferences } from "@/lib/notification-preferences";
import { getNativeTradeAlert } from "@/lib/native-alert";

const SEEN_KEY = "papertrade-session-alerts-seen-v1";

function remember(id: string) {
  let seen: string[] = [];
  try {
    const parsed = JSON.parse(localStorage.getItem(SEEN_KEY) ?? "[]");
    if (Array.isArray(parsed)) seen = parsed.filter((item) => typeof item === "string");
  } catch { /* A bad local list must not block the next session. */ }
  if (seen.includes(id)) return false;
  localStorage.setItem(SEEN_KEY, JSON.stringify([...seen.slice(-40), id]));
  return true;
}

async function showSystem(title: string, body: string, id: string) {
  if (Capacitor.getPlatform() === "android") {
    await getNativeTradeAlert().show({ title, body, notificationId: id, kind: "session", url: "/" });
    return;
  }
  if ("Notification" in window && Notification.permission === "granted") {
    const registration = "serviceWorker" in navigator ? await navigator.serviceWorker.getRegistration("/notifications/") : undefined;
    if (registration) await registration.showNotification(title, { body, icon: "/papertrade-icon-192.png?v=1.22", tag: id, data: { url: "/" } });
    else new Notification(title, { body, icon: "/papertrade-icon-192.png?v=1.22", tag: id });
  }
}

export function deliverSessionOpen(now = Date.now()) {
  const preferences = readNotificationPreferences();
  if (preferences.pausedUntil > now || !preferences.sessions) return;
  const notice = sessionOpenNotice(now);
  if (!notice || !remember(notice.id)) return;
  addPaperTradeNotification({ id: notice.id, kind: "market", title: notice.title, body: notice.body });
  void showSystem(notice.title, notice.body, notice.id).catch(() => undefined);
}

export function SessionOpenAlerts() {
  useEffect(() => {
    deliverSessionOpen();
    const timer = window.setInterval(() => deliverSessionOpen(), 20_000);
    const refresh = () => deliverSessionOpen();
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener(NOTIFICATION_SETTINGS_EVENT, refresh);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener(NOTIFICATION_SETTINGS_EVENT, refresh);
    };
  }, []);
  return null;
}
