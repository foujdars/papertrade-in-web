"use client";
import { useEffect, useState } from "react";
import { DEFAULT_NOTIFICATION_PREFERENCES } from "@/lib/notification-policy";
import { NOTIFICATION_SETTINGS_EVENT, readNotificationPreferences, saveNotificationPreferences } from "@/lib/notification-preferences";
import { NOTIFICATION_SYNC_EVENT } from "@/lib/push-client";

export function NotificationSettings() {
  const [preferences, setPreferences] = useState(DEFAULT_NOTIFICATION_PREFERENCES);
  const [denied, setDenied] = useState(false);
  const [status, setStatus] = useState("");
  const [retry, setRetry] = useState(false);
  useEffect(() => {
    const read = () => setPreferences(readNotificationPreferences());
    const synced = (event: Event) => {
      const { ok, connected } = (event as CustomEvent<{ ok: boolean; connected: boolean }>).detail;
      setStatus(!ok ? "Saved on this device. Background delivery could not sync; retry when online." : connected ? "Saved for this device and its background alerts." : "Saved on this device. Background alerts will use these settings when connected.");
      setRetry(!ok);
    };
    let disposed = false;
    queueMicrotask(() => { if (!disposed) { read(); setDenied(typeof Notification !== "undefined" && Notification.permission === "denied"); } });
    window.addEventListener(NOTIFICATION_SETTINGS_EVENT, read);
    window.addEventListener("storage", read);
    window.addEventListener(NOTIFICATION_SYNC_EVENT, synced);
    return () => { disposed = true; window.removeEventListener(NOTIFICATION_SETTINGS_EVENT, read); window.removeEventListener("storage", read); window.removeEventListener(NOTIFICATION_SYNC_EVENT, synced); };
  }, []);
  const change = (key: "ema21" | "ema5", enabled: boolean) => {
    try {
      saveNotificationPreferences({ ...readNotificationPreferences(), [key]: enabled });
      setStatus("Saved on this device. Syncing background alerts…");
      setRetry(false);
    } catch { setStatus("Could not save settings. Allow browser storage and try again."); }
  };
  return <section className="notification-settings" aria-label="Automatic alert settings">
    <b>Automatic alerts</b>
    <label><span><b>EMA 21 alerts</b><small>BTC, ETH and Gold · 5m / 15m breakout signals</small></span>
      <input type="checkbox" role="switch" aria-label="EMA 21 alerts" checked={preferences.ema21} onChange={event => change("ema21", event.target.checked)} /></label>
    <label><span><b>EMA 5 alerts</b><small>BTC · 5m / 15m reversal signals</small></span>
      <input type="checkbox" role="switch" aria-label="EMA 5 alerts" checked={preferences.ema5} onChange={event => change("ema5", event.target.checked)} /></label>
    <p>These switches control the automatic EMA alerts on this device. Your custom chart alerts keep their own settings.</p>
    {denied && <p>Notifications are blocked. Allow them in your browser or phone settings to receive system alerts.</p>}
    {status && <p role="status">{status}</p>}
    {retry && <button type="button" onClick={() => { setStatus("Retrying background sync…"); window.dispatchEvent(new Event(NOTIFICATION_SETTINGS_EVENT)); }}>Retry sync</button>}
  </section>;
}
