import "server-only";
import { sendPush } from "@/lib/push-admin";
import { indiaClock, type PushNotice } from "@/lib/notification-policy";
import { scanWatchlistShockers } from "@/lib/volume-shocker-scan";
import {
  VOLUME_SHOCKER_DEVICE_LIMIT,
  VOLUME_SHOCKER_HISTORY_BUDGET,
  VOLUME_SHOCKER_UNION_LIMIT,
  normalizeShockerWatch,
  nseCashSessionOpen,
  planShockerNotices,
  type ShockerInstrument,
  type ShockerMove,
} from "@/lib/volume-shocker-alerts";

type Qualified = Record<string, { symbol: string; multiple: number }>;
type StateDoc = {
  get: () => Promise<{ exists: boolean; data: () => Record<string, unknown> | undefined }>;
  set: (value: Record<string, unknown>) => Promise<unknown>;
};
export type VolumeShockerDevice = {
  token: string;
  sent: unknown;
  watch: unknown;
  ref: { update: (value: Record<string, unknown>) => Promise<unknown>; delete: () => Promise<unknown> };
};

function qualifiedMap(value: unknown, sameDay: boolean): Qualified {
  if (!sameDay || !value || typeof value !== "object") return {};
  const entries = Object.entries(value as Record<string, unknown>).flatMap(([key, item]) => {
    if (!item || typeof item !== "object") return [];
    const row = item as { symbol?: unknown; multiple?: unknown };
    return typeof row.symbol === "string" && typeof row.multiple === "number" && row.multiple > 5 ? [[key, { symbol: row.symbol, multiple: row.multiple }] as const] : [];
  });
  return Object.fromEntries(entries.slice(-400));
}

export async function deliverVolumeShockerAlerts(db: { doc: (path: string) => StateDoc }, devices: readonly VolumeShockerDevice[], now = Date.now()) {
  if (!nseCashSessionOpen(now) || !devices.length) return 0;
  const day = indiaClock(now).day;
  const queued = devices.filter((device) => device.token && Array.isArray(device.watch) && device.watch.length);
  if (!queued.length) return 0;
  const stateRef = db.doc("notificationSystem/volumeShockers");
  const saved = await stateRef.get();
  const stored = saved.exists ? saved.data() ?? {} : {};
  const start = queued.length ? Math.abs(Math.trunc(Number(stored.offset) || 0)) % queued.length : 0;
  const chosen = queued.length <= VOLUME_SHOCKER_DEVICE_LIMIT ? queued : [...queued.slice(start), ...queued.slice(0, start)].slice(0, VOLUME_SHOCKER_DEVICE_LIMIT);
  const nextOffset = queued.length <= VOLUME_SHOCKER_DEVICE_LIMIT ? 0 : (start + chosen.length) % queued.length;
  const union: ShockerInstrument[] = [];
  const seen = new Set<string>();
  for (const device of chosen) {
    for (const instrument of normalizeShockerWatch(device.watch)) {
      if (seen.has(instrument.instrumentKey) || union.length >= VOLUME_SHOCKER_UNION_LIMIT) continue;
      seen.add(instrument.instrumentKey);
      union.push(instrument);
    }
  }
  const sameDay = stored.day === day;
  const qualified = qualifiedMap(stored.qualified, sameDay);
  if (union.length) {
    const scan = await scanWatchlistShockers(union, { maxHistories: VOLUME_SHOCKER_HISTORY_BUDGET, skipHistoryKeys: new Set(Object.keys(qualified)) });
    for (const row of scan.rows) qualified[row.instrumentKey] = { symbol: row.symbol, multiple: row.volumeMultiple };
    const moves = new Map<string, ShockerMove>();
    for (const quote of scan.quotes) {
      const fresh = scan.rows.find((row) => row.instrumentKey === quote.instrumentKey);
      const known = qualified[quote.instrumentKey];
      const volumeMultiple = fresh?.volumeMultiple ?? known?.multiple;
      if (volumeMultiple === undefined) continue;
      moves.set(quote.instrumentKey, { symbol: quote.symbol, instrumentKey: quote.instrumentKey, changePercent: fresh?.changePercent ?? quote.changePercent, volumeMultiple });
    }
    let sent = 0;
    for (const device of chosen) {
      const room = 20 - sent;
      if (room <= 0) break;
      const keys = new Set(normalizeShockerWatch(device.watch).map((item) => item.instrumentKey));
      const already = new Set((Array.isArray(device.sent) ? device.sent : []).filter((item): item is string => typeof item === "string" && item.startsWith(`vshock-${day}-`)));
      const plan = planShockerNotices([...moves.values()].filter((move) => keys.has(move.instrumentKey)), day, already);
      const notices = plan.notices.slice(0, room);
      if (!notices.length) continue;
      const claimed = plan.sentIds.filter((id) => notices.some((notice) => id.startsWith(`vshock-${day}-${notice.symbol}-${notice.side}-`)));
      await device.ref.update({ shockerSent: [...already, ...claimed].slice(-120) });
      for (const notice of notices) {
        const push: PushNotice = { id: notice.id, title: notice.title, body: "", url: notice.url, kind: "trade", expiresAt: now + 2 * 3600000, silent: false };
        try {
          await sendPush(push, { token: device.token });
          sent += 1;
        } catch (error) {
          if ((error as { code?: string }).code === "messaging/registration-token-not-registered") await device.ref.delete().catch(() => undefined);
        }
      }
    }
    await stateRef.set({ day, qualified, offset: nextOffset, updatedAt: now });
    return sent;
  }
  await stateRef.set({ day, qualified, offset: nextOffset, updatedAt: now });
  return 0;
}
