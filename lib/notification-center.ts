import { allotmentLink, type AllotmentRegistrar } from "./ipo-allotment";

export type PaperTradeNotificationKind = "trade" | "portfolio" | "ipo" | "market";

export type PaperTradeNotification = {
  id: string;
  kind: PaperTradeNotificationKind;
  title: string;
  body: string;
  createdAt: number;
  read: boolean;
  symbol?: string;
  instrumentKey?: string;
  allotmentRegistrar?: AllotmentRegistrar;
};

export const NOTIFICATION_CENTER_EVENT = "papertrade:notification-center-change";
const NOTIFICATION_CENTER_KEY = "papertrade-notification-center-v1";

export function readPaperTradeNotifications(): PaperTradeNotification[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(NOTIFICATION_CENTER_KEY) ?? "[]") as PaperTradeNotification[];
    return Array.isArray(parsed)
      ? parsed.filter((item) => item?.id && item?.title && Number.isFinite(item?.createdAt)).slice(0, 100)
      : [];
  } catch {
    return [];
  }
}

function savePaperTradeNotifications(items: PaperTradeNotification[]) {
  window.localStorage.setItem(NOTIFICATION_CENTER_KEY, JSON.stringify(items.slice(0, 100)));
  window.dispatchEvent(new CustomEvent(NOTIFICATION_CENTER_EVENT));
}

export function addPaperTradeNotification(input: Omit<PaperTradeNotification, "id" | "createdAt" | "read"> & { id?: string; createdAt?: number }) {
  if (typeof window === "undefined") return;
  const createdAt = input.createdAt ?? Date.now();
  const id = input.id ?? `${input.kind}-${createdAt}-${Math.random().toString(36).slice(2, 7)}`;
  const current = readPaperTradeNotifications().filter((item) => item.id !== id);
  savePaperTradeNotifications([{ id, kind: input.kind, title: input.title, body: input.body, createdAt, read: false,
    ...(input.kind === "trade" && input.symbol ? { symbol: input.symbol, instrumentKey: input.instrumentKey } : {}),
    ...(input.kind === "ipo" && allotmentLink(input.allotmentRegistrar) ? { allotmentRegistrar: input.allotmentRegistrar } : {}),
  }, ...current]);
}

export function markPaperTradeNotificationsRead() {
  if (typeof window === "undefined") return;
  const items = readPaperTradeNotifications();
  if (!items.some((item) => !item.read)) return;
  savePaperTradeNotifications(items.map((item) => ({ ...item, read: true })));
}

export function clearPaperTradeNotifications() {
  if (typeof window === "undefined") return;
  savePaperTradeNotifications([]);
}
