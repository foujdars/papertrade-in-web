"use client";
import { notificationPreferences, DEFAULT_NOTIFICATION_PREFERENCES, type NotificationPreferences } from "./notification-policy";
export const NOTIFICATION_SETTINGS_EVENT = "papertrade:notification-settings";
const KEY = "papertrade-notification-preferences-v3";
export function readNotificationPreferences() {
  if (typeof window === "undefined") return { ...DEFAULT_NOTIFICATION_PREFERENCES };
  try {
    const saved = localStorage.getItem(KEY);
    if (saved) return notificationPreferences(JSON.parse(saved));
    return { ...DEFAULT_NOTIFICATION_PREFERENCES, ipo: localStorage.getItem("papertrade-ipo-alerts-enabled-v1") !== "false", allotment: localStorage.getItem("papertrade-ipo-allotment-alerts-v1") !== "0" };
  } catch { return { ...DEFAULT_NOTIFICATION_PREFERENCES }; }
}
export function saveNotificationPreferences(preferences: NotificationPreferences) {
  localStorage.setItem(KEY, JSON.stringify(notificationPreferences(preferences)));
  window.dispatchEvent(new Event(NOTIFICATION_SETTINGS_EVENT));
}
