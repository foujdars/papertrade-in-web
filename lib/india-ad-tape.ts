import type { Firestore } from "firebase-admin/firestore";
import { appendAdTape, inNseCashSession, istDay, nseBreadth, selectAdTape, type AdPoint, type NseBreadth } from "./india-pulse.ts";
import { firebaseProjectId, pushServices } from "./push-admin.ts";

const DOC = "marketPulse/nseAdTape";
const HOME = "https://www.moneycontrol.com/";
const UA = "Mozilla/5.0 (compatible; PaperTrade/1.0)";

let memory: { day: string; points: AdPoint[]; closedDay: string; closed: AdPoint[] } = { day: "", points: [], closedDay: "", closed: [] };
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
      const savedDay = typeof data?.day === "string" ? data.day : "";
      const savedPoints = clean(data?.points);
      const savedClosed = clean(data?.closed);
      if (savedClosed.length) {
        memory.closedDay = typeof data?.closedDay === "string" ? data.closedDay : memory.closedDay;
        memory.closed = merge(memory.closed, savedClosed);
      }
      if (savedDay === day) memory = { ...memory, day, points: merge(memory.day === day ? memory.points : [], savedPoints) };
      else if (savedPoints.length && savedDay && savedDay >= memory.closedDay) {
        memory.closedDay = savedDay;
        memory.closed = merge(memory.closed, savedPoints);
      }
      syncedAt = now;
    } catch { /* The live count still draws from this instance. */ }
  }
  let rolled = false;
  if (memory.day !== day) {
    if (memory.points.length && memory.day >= memory.closedDay) {
      memory.closedDay = memory.day;
      memory.closed = memory.points;
    }
    memory = { ...memory, day, points: [] };
    rolled = true;
  }
  const next = appendAdTape(memory.points, breadth, now);
  const changed = next !== memory.points || rolled;
  memory = { ...memory, day, points: next };
  if (changed && store) {
    try {
      const pack = (points: AdPoint[]) => points.map(point => ({ t: point.t, a: point.advance, d: point.decline }));
      await store.doc(DOC).set({ day, points: pack(next), closedDay: memory.closedDay, closed: pack(memory.closed), updatedAt: now });
    } catch { /* Keep the tape in memory until the next write. */ }
  }
  return selectAdTape(next, memory.closed, now);
}

export async function sampleNseAdTape(db?: Firestore, now = Date.now()) {
  if ((globalThis as { __technicalTest?: unknown }).__technicalTest) return [];
  if (!inNseCashSession(now)) return [];
  return recordNseAdTape(await liveNseBreadth(), db, now);
}
