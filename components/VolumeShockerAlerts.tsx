"use client";
import { useEffect, useRef } from "react";
import { Capacitor } from "@capacitor/core";
import { addPaperTradeNotification } from "@/lib/notification-center";
import { readNotificationPreferences } from "@/lib/notification-preferences";
import { indiaClock } from "@/lib/notification-policy";
import { getNativeTradeAlert } from "@/lib/native-alert";
import { pushConnected, setShockerWatch, syncPushDevice } from "@/lib/push-client";
import { normalizeShockerWatch, nseCashSessionOpen, planShockerNotices, type ShockerInstrument, type ShockerNotice } from "@/lib/volume-shocker-alerts";

const SEEN_KEY = "papertrade-volume-shocker-alerts-v1";

function readSeen(day: string) {
  try {
    const parsed = JSON.parse(localStorage.getItem(SEEN_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string" && item.startsWith(`vshock-${day}-`)) : [];
  } catch {
    return [];
  }
}

function remember(day: string, ids: string[]) {
  const next = [...new Set([...readSeen(day), ...ids])].slice(-200);
  localStorage.setItem(SEEN_KEY, JSON.stringify(next));
  return next;
}

async function showSystem(notice: ShockerNotice) {
  if (pushConnected() && document.visibilityState === "hidden") return;
  if (Capacitor.getPlatform() === "android") {
    await getNativeTradeAlert().show({ title: notice.title, body: "", notificationId: notice.id, kind: "trade", url: notice.url });
    return;
  }
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  const registration = "serviceWorker" in navigator ? await navigator.serviceWorker.getRegistration("/notifications/") : undefined;
  if (registration) await registration.showNotification(notice.title, { icon: "/papertrade-icon-192.png?v=1.22", tag: notice.id, data: { url: notice.url } });
  else new Notification(notice.title, { icon: "/papertrade-icon-192.png?v=1.22", tag: notice.id });
}

export function VolumeShockerAlerts({ instruments }: { instruments: readonly ShockerInstrument[] }) {
  const watch = normalizeShockerWatch(instruments);
  const watchKey = watch.map((item) => item.instrumentKey).join(",");
  const watchRef = useRef(watch);
  watchRef.current = watch;

  useEffect(() => {
    setShockerWatch(watchRef.current);
    void syncPushDevice().catch(() => undefined);
  }, [watchKey]);

  useEffect(() => {
    let disposed = false;
    let running = false;
    const tick = async () => {
      const current = watchRef.current;
      const now = Date.now();
      if (disposed || running || !current.length || !nseCashSessionOpen(now) || readNotificationPreferences().pausedUntil > now) return;
      running = true;
      try {
        const response = await fetch("/api/market/volume-breakouts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ scope: "watchlist", mode: "VOLUME", instruments: current }),
          cache: "no-store",
          signal: AbortSignal.timeout(45_000),
        });
        const payload = await response.json() as { ok?: boolean; rows?: Array<{ symbol?: string; instrumentKey?: string; changePercent?: number; volumeMultiple?: number }> };
        if (!response.ok || !payload.ok || !Array.isArray(payload.rows)) return;
        const day = indiaClock(Date.now()).day;
        const plan = planShockerNotices(payload.rows.flatMap((row) => {
          if (!row || typeof row.symbol !== "string" || typeof row.instrumentKey !== "string" || typeof row.changePercent !== "number" || typeof row.volumeMultiple !== "number") return [];
          return [{ symbol: row.symbol, instrumentKey: row.instrumentKey, changePercent: row.changePercent, volumeMultiple: row.volumeMultiple }];
        }), day, new Set(readSeen(day)));
        if (!plan.notices.length) return;
        remember(day, plan.sentIds);
        for (const notice of plan.notices) {
          addPaperTradeNotification({ id: notice.id, kind: "trade", title: notice.title, body: "", symbol: notice.symbol, instrumentKey: notice.instrumentKey, url: notice.url });
          void showSystem(notice).catch(() => undefined);
        }
      } catch { /* The next poll retries. A failed scan must not disturb trading. */ }
      finally { running = false; }
    };
    const first = window.setTimeout(() => void tick(), 15_000);
    const timer = window.setInterval(() => void tick(), 120_000);
    return () => {
      disposed = true;
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, [watchKey]);
  return null;
}
