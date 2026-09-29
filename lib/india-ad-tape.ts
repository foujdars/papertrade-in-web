import type { Firestore } from "firebase-admin/firestore";
import { appendAdTape, inNseCashSession, istDay, nseBreadth, type AdPoint, type NseBreadth } from "./india-pulse.ts";
import { firebaseProjectId, pushServices } from "./push-admin.ts";

const DOC = "marketPulse/nseAdTape";
const HOME = "https://www.moneycontrol.com/";
const UA = "Mozilla/5.0 (compatible; PaperTrade/1.0)";

let memory: { day: string; points: AdPoint[] } = { day: "", points: [] };
let syncedAt = 0;
let homeCache: { until: number; breadth: NseBreadth | null } | null = null;

function clean(value: unknown): AdPoint[] {
  if (!Array.isArray(value)) return [];
  const points: AdPoint[] = [];
  for (const row of value) {
    const t = Number((row as { t?: unknown })?.t);
    const advance = Number((row as { a?: unknown })?.a);
    const decline = Number((row as { d?: unknown })?.d);
    if (!Number.isFinite(t) || !Number.isFinite(advance) || !Number.isFinite(decline)) continue;
    if (advance < 0 || decline < 0 || advance + decline < 50 || advance > 20000 || decline > 20000) continue;
    points.push({ t, advance, decline });
  }
  return points.slice(-420);
}

function merge(left: AdPoint[], right: AdPoint[]) {
  const byMinute = new Map<number, AdPoint>();
  for (const point of [...left, ...right]) byMinute.set(point.t, point);
  return [...byMinute.values()].sort((a, b) => a.t - b.t).slice(-420);
}

async function storeOf(db?: Firestore) {
  if (db) return db;
  if (!firebaseProjectId()) return null;
  return (await pushServices()).db;
}

export async function liveNseBreadth() {
  if (homeCache && homeCache.until > Date.now()) return homeCache.breadth;
  try {
    const response = await fetch(HOME, { headers: { "user-agent": UA, accept: "text/html" }, signal: AbortSignal.timeout(8000) });
    const breadth = response.ok ? nseBreadth(await response.text()) : null;
    homeCache = { until: Date.now() + 20_000, breadth };
    return breadth;
  } catch {
    return homeCache?.breadth ?? null;
  }
}

export async function recordNseAdTape(breadth: NseBreadth | null, db?: Firestore, now = Date.now()) {
  const day = istDay(now);
  const store = await storeOf(db).catch(() => null);
  if (store && now - syncedAt > 15_000) {
    try {
      const saved = await store.doc(DOC).get();
      const data = saved.data();
      if (data?.day === day) memory = { day, points: merge(memory.day === day ? memory.points : [], clean(data.points)) };
      syncedAt = now;
    } catch { /* The live count still draws from this instance. */ }
  }
  if (memory.day !== day) memory = { day, points: [] };
  const next = appendAdTape(memory.points, breadth, now);
  const changed = next !== memory.points;
  memory = { day, points: next };
  if (changed && store) {
    try {
      await store.doc(DOC).set({ day, points: next.map(point => ({ t: point.t, a: point.advance, d: point.decline })), updatedAt: now });
    } catch { /* Keep the tape in memory until the next write. */ }
  }
  return next;
}

export async function sampleNseAdTape(db?: Firestore, now = Date.now()) {
  if ((globalThis as { __technicalTest?: unknown }).__technicalTest) return [];
  if (!inNseCashSession(now)) return [];
  return recordNseAdTape(await liveNseBreadth(), db, now);
}
