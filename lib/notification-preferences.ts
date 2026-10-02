"use client";
import { notificationPreferences, DEFAULT_NOTIFICATION_PREFERENCES, type NotificationPreferences } from "./notification-policy";
export const NOTIFICATION_SETTINGS_EVENT = "papertrade:notification-settings";
export const NOTIFICATION_PREFERENCES_KEY = "papertrade-notification-preferences-v4";
const LEGACY = "papertrade-notification-preferences-v3";
export function readNotificationPreferences() {
  if (typeof window === "undefined") return { ...DEFAULT_NOTIFICATION_PREFERENCES };
  try {
    const saved = localStorage.getItem(NOTIFICATION_PREFERENCES_KEY);
    if (saved) return notificationPreferences(JSON.parse(saved));
    const legacy = localStorage.getItem(LEGACY);
    const pausedUntil = legacy ? notificationPreferences(JSON.parse(legacy)).pausedUntil : 0;
    return { ...DEFAULT_NOTIFICATION_PREFERENCES, pausedUntil };
  } catch { return { ...DEFAULT_NOTIFICATION_PREFERENCES }; }
}
export function saveNotificationPreferences(preferences: NotificationPreferences) {
  localStorage.setItem(NOTIFICATION_PREFERENCES_KEY, JSON.stringify(notificationPreferences(preferences)));
  window.dispatchEvent(new Event(NOTIFICATION_SETTINGS_EVENT));
}
