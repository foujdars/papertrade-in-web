"use client";

import { useCallback, useSyncExternalStore, type SetStateAction } from "react";
import { DEFAULT_DESKTOP_CHART_SETTINGS, DESKTOP_CHART_SETTINGS_KEY, DESKTOP_CHART_TEMPLATES_KEY, normalizeChartTemplates, normalizeDesktopChartSettings, type ChartAppearanceTemplate, type DesktopChartSettings } from "./desktop-chart-settings";

const EVENT = "papertrade:desktop-chart-settings";
export type DesktopChartPersistence = "saved" | "session-only";
type PreferenceSetter<T> = (update: SetStateAction<T>) => boolean;
type Snapshot = { settings: DesktopChartSettings; templates: ChartAppearanceTemplate[]; settingsPersistence: DesktopChartPersistence; templatesPersistence: DesktopChartPersistence };
const SERVER_SNAPSHOT: Snapshot = { settings: { ...DEFAULT_DESKTOP_CHART_SETTINGS }, templates: [], settingsPersistence: "saved", templatesPersistence: "saved" };
let snapshot = SERVER_SNAPSHOT;
let cachedSettings: string | null | undefined;
let cachedTemplates: string | null | undefined;
function parse(raw: string | null) { try { return JSON.parse(raw ?? "null"); } catch { return null; } }
function read() {
  if (typeof window === "undefined") return SERVER_SNAPSHOT;
  try {
    const settings = localStorage.getItem(DESKTOP_CHART_SETTINGS_KEY);
    if (settings !== cachedSettings) {
      // A change to the other key (or another tab) must not discard unsaved session choices.
      if (snapshot.settingsPersistence === "saved") snapshot = { ...snapshot, settings: normalizeDesktopChartSettings(parse(settings)) };
      cachedSettings = settings;
    }
  } catch { /* Keep settings in memory when reads are blocked. */ }
  try {
    const templates = localStorage.getItem(DESKTOP_CHART_TEMPLATES_KEY);
    if (templates !== cachedTemplates) {
      if (snapshot.templatesPersistence === "saved") snapshot = { ...snapshot, templates: normalizeChartTemplates(parse(templates)) };
      cachedTemplates = templates;
    }
  } catch { /* A template read failure does not block reading chart settings. */ }
  return snapshot;
}
function subscribe(notify: () => void) {
  const storage = (event: StorageEvent) => { if (event.key === null || event.key === DESKTOP_CHART_SETTINGS_KEY || event.key === DESKTOP_CHART_TEMPLATES_KEY) notify(); };
  window.addEventListener(EVENT, notify); window.addEventListener("storage", storage);
  return () => { window.removeEventListener(EVENT, notify); window.removeEventListener("storage", storage); };
}
function persist(target: "settings" | "templates") {
  const key = target === "settings" ? DESKTOP_CHART_SETTINGS_KEY : DESKTOP_CHART_TEMPLATES_KEY;
  const raw = JSON.stringify(snapshot[target]);
  let saved = false;
  try {
    localStorage.setItem(key, raw);
    saved = localStorage.getItem(key) === raw;
    if (saved) { if (target === "settings") cachedSettings = raw; else cachedTemplates = raw; }
  } catch { /* The caller reports the failure; current choices remain available for this session. */ }
  snapshot = target === "settings"
    ? { ...snapshot, settingsPersistence: saved ? "saved" : "session-only" }
    : { ...snapshot, templatesPersistence: saved ? "saved" : "session-only" };
  window.dispatchEvent(new Event(EVENT));
  return saved;
}
/** Existing two-value consumers remain compatible; the setter reports durable-save success. */
export function useDesktopChartSettings(): [DesktopChartSettings, PreferenceSetter<DesktopChartSettings>, DesktopChartPersistence] {
  const value = useSyncExternalStore(subscribe, read, () => SERVER_SNAPSHOT);
  const set = useCallback<PreferenceSetter<DesktopChartSettings>>((update) => {
    const current = read();
    snapshot = { ...current, settings: normalizeDesktopChartSettings(typeof update === "function" ? update(current.settings) : update) };
    return persist("settings");
  }, []);
  return [value.settings, set, value.settingsPersistence];
}
export function useChartAppearanceTemplates(): [ChartAppearanceTemplate[], PreferenceSetter<ChartAppearanceTemplate[]>, DesktopChartPersistence] {
  const value = useSyncExternalStore(subscribe, read, () => SERVER_SNAPSHOT);
  const set = useCallback<PreferenceSetter<ChartAppearanceTemplate[]>>((update) => {
    const current = read();
    snapshot = { ...current, templates: normalizeChartTemplates(typeof update === "function" ? update(current.templates) : update) };
    return persist("templates");
  }, []);
  return [value.templates, set, value.templatesPersistence];
}
