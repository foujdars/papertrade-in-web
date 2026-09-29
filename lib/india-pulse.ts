import { NSE_HOLIDAYS } from "./nse-holidays.ts";

export type NseBreadth = { advance: number; decline: number };
export type IndexBreadth = { name: string; advance: number; decline: number };
export type IndiaVix = { price: number; change: number; changePercent: number; low: number | null; high: number | null };
// Indicative display bands, not exchange-defined risk classifications.
export function vixBand(price: number) {
  if (price < 15) return { label: "Calm", tone: "calm", position: Math.max(0, price / 15) * 25 };
  if (price < 20) return { label: "Watch", tone: "watch", position: 25 + (price - 15) / 5 * 25 };
  if (price < 30) return { label: "Elevated", tone: "elevated", position: 50 + (price - 20) / 10 * 25 };
  return { label: "High", tone: "high", position: Math.min(100, 75 + (price - 30) / 10 * 25) };
}
export type CashFlow = { date: string; label: string; fii: number; dii: number };
export type AdPoint = { t: number; advance: number; decline: number };

const IST_OFFSET_MS = 330 * 60 * 1000;

export function nextData(html: string): unknown {
  const match = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
  if (!match) return null;
  try { return JSON.parse(match[1]); }
  catch { return null; }
}

export function nseBreadth(html: string): NseBreadth | null {
  const advance = Number(html.match(/class="baradv">(\d[\d,]*)/)?.[1]?.replace(/,/g, ""));
  const decline = Number(html.match(/class="bardecl">(\d[\d,]*)/)?.[1]?.replace(/,/g, ""));
  if (!Number.isFinite(advance) || !Number.isFinite(decline) || advance + decline < 50) return null;
  return { advance, decline };
}

export function indexBreadth(payload: unknown): IndexBreadth[] {
  const list = (payload as { props?: { pageProps?: { adRatioData?: { indexList?: unknown } } } })?.props?.pageProps?.adRatioData?.indexList;
  if (!Array.isArray(list)) return [];
  const rows: IndexBreadth[] = [];
  for (const row of list) {
    const name = typeof (row as { indexName?: unknown })?.indexName === "string" ? (row as { indexName: string }).indexName.trim() : "";
    const advance = Number((row as { advance?: unknown })?.advance);
    const decline = Number((row as { decline?: unknown })?.decline);
    if (!name || !Number.isFinite(advance) || !Number.isFinite(decline) || advance + decline <= 0) continue;
    rows.push({ name, advance, decline });
    if (rows.length >= 8) break;
  }
  return rows;
}

export function indiaVix(payload: unknown): IndiaVix | null {
  const data = (payload as { data?: { pricecurrent?: unknown; pricechange?: unknown; pricepercentchange?: unknown; LOW?: unknown; HIGH?: unknown; "52wklow"?: unknown; "52wkhi"?: unknown } })?.data;
  const price = Number(data?.pricecurrent);
  if (!Number.isFinite(price) || price <= 0) return null;
  const change = Number(data?.pricechange);
  const changePercent = Number(data?.pricepercentchange);
  const weekLow = Number(data?.["52wklow"]);
  const weekHigh = Number(data?.["52wkhi"]);
  const dayLow = Number(data?.LOW);
  const dayHigh = Number(data?.HIGH);
  const low = Number.isFinite(weekLow) ? weekLow : Number.isFinite(dayLow) ? dayLow : null;
  const high = Number.isFinite(weekHigh) ? weekHigh : Number.isFinite(dayHigh) ? dayHigh : null;
  return { price, change: Number.isFinite(change) ? change : 0, changePercent: Number.isFinite(changePercent) ? changePercent : 0, low, high };
}

function crore(value: unknown) {
  const parsed = Number(String(value ?? "").replace(/,/g, "").trim());
  return Number.isFinite(parsed) ? parsed : null;
}

export function fiiDii(payload: unknown): CashFlow[] {
  const list = (payload as { props?: { pageProps?: { FiiDiiData?: { fiiDiiData?: unknown } } } })?.props?.pageProps?.FiiDiiData?.fiiDiiData;
  if (!Array.isArray(list)) return [];
  const rows: CashFlow[] = [];
  for (const row of list) {
    const fii = crore((row as { fiiCM?: unknown })?.fiiCM);
    const dii = crore((row as { diiCM?: unknown })?.diiCM);
    const date = typeof (row as { date?: unknown })?.date === "string" ? (row as { date: string }).date : "";
    const label = typeof (row as { fDate?: unknown })?.fDate === "string" ? (row as { fDate: string }).fDate : date;
    if (fii === null || dii === null || !date) continue;
    rows.push({ date, label, fii, dii });
    if (rows.length >= 8) break;
  }
  return rows;
}

export function istDay(now = Date.now()) {
  return new Date(now + IST_OFFSET_MS).toISOString().slice(0, 10);
}

export function istStamp(day: string, hours: number, minutes: number) {
  const [year, month, date] = day.split("-").map(Number);
  return Date.UTC(year, month - 1, date, hours, minutes) - IST_OFFSET_MS;
}

export function inNseCashSession(now = Date.now()) {
  const ist = new Date(now + IST_OFFSET_MS);
  const weekday = ist.getUTCDay();
  if (weekday === 0 || weekday === 6) return false;
  const day = ist.toISOString().slice(0, 10);
  if (day in NSE_HOLIDAYS) return false;
  const minutes = ist.getUTCHours() * 60 + ist.getUTCMinutes();
  return minutes >= 9 * 60 + 15 && minutes <= 15 * 60 + 35;
}

export function appendAdTape(points: AdPoint[], breadth: NseBreadth | null, now = Date.now()): AdPoint[] {
  if (!breadth || !inNseCashSession(now)) return points;
  const day = istDay(now);
  const kept = points.filter(point => istDay(point.t) === day);
  const t = Math.floor(now / 60000) * 60000;
  const last = kept[kept.length - 1];
  if (last?.t === t && last.advance === breadth.advance && last.decline === breadth.decline) return kept.length === points.length ? points : kept;
  const next = last?.t === t ? kept.slice(0, -1) : kept.length > 419 ? kept.slice(kept.length - 419) : kept.slice();
  next.push({ t, advance: breadth.advance, decline: breadth.decline });
  return next;
}

/** During the session, draw today's line once it exists. Otherwise keep the last full session until 9:15 forms a new one. */
export function selectAdTape(today: AdPoint[], closed: AdPoint[], now = Date.now()): AdPoint[] {
  if (inNseCashSession(now)) return today.length ? today : closed;
  if (today.length) return today;
  return closed;
}

export function sessionBounds(points: AdPoint[]) {
  const day = istDay(points[points.length - 1]?.t ?? Date.now());
  return { start: istStamp(day, 9, 15), end: istStamp(day, 15, 30) };
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function isoDay(raw: string): string | null {
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const named = raw.trim().match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/);
  if (!named) return null;
  const month = MONTHS.findIndex(item => item.toLowerCase() === named[2].slice(0, 3).toLowerCase());
  if (month < 0) return null;
  return `${named[3]}-${String(month + 1).padStart(2, "0")}-${named[1].padStart(2, "0")}`;
}

export type FlowPoint = CashFlow & { nifty: number | null; niftyChange: number | null };

export function historyFlows(payload: unknown): CashFlow[] {
  if (!Array.isArray(payload)) return [];
  const rows: CashFlow[] = [];
  for (const row of payload) {
    const date = isoDay(String((row as { date?: unknown })?.date ?? ""));
    const fii = crore((row as { fii_net?: unknown })?.fii_net);
    const dii = crore((row as { dii_net?: unknown })?.dii_net);
    if (!date || fii === null || dii === null) continue;
    const label = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`));
    rows.push({ date, label, fii, dii });
  }
  const byDate = new Map(rows.map(row => [row.date, row]));
  return [...byDate.values()].sort((a, b) => b.date.localeCompare(a.date));
}

export function mergeFlows(primary: CashFlow[], extra: CashFlow[]): CashFlow[] {
  const byDate = new Map<string, CashFlow>();
  for (const row of extra) {
    const date = isoDay(row.date) ?? row.date;
    byDate.set(date, { ...row, date });
  }
  for (const row of primary) {
    const date = isoDay(row.date) ?? row.date;
    byDate.set(date, { ...row, date, label: row.label || byDate.get(date)?.label || date });
  }
  return [...byDate.values()].sort((a, b) => b.date.localeCompare(a.date));
}

export function niftyCloses(payload: unknown): { date: string; close: number }[] {
  const result = (payload as { chart?: { result?: Array<{ timestamp?: unknown; indicators?: { quote?: Array<{ close?: unknown }> } }> } })?.chart?.result?.[0];
  const stamps = Array.isArray(result?.timestamp) ? result.timestamp : [];
  const closes = result?.indicators?.quote?.[0]?.close;
  if (!Array.isArray(closes)) return [];
  const rows: { date: string; close: number }[] = [];
  stamps.forEach((stamp, index) => {
    const close = Number(closes[index]);
    const seconds = Number(stamp);
    if (!Number.isFinite(close) || close <= 0 || !Number.isFinite(seconds)) return;
    rows.push({ date: istDay(seconds * 1000), close });
  });
  return rows;
}

export function withNifty(flows: CashFlow[], closes: { date: string; close: number }[]): FlowPoint[] {
  const price = new Map(closes.map(row => [row.date, row.close]));
  const ordered = [...closes].sort((a, b) => a.date.localeCompare(b.date));
  return flows.map(flow => {
    const date = isoDay(flow.date) ?? flow.date;
    let nifty = price.get(date) ?? null;
    if (nifty === null) {
      const prior = [...ordered].reverse().find(row => row.date <= date);
      nifty = prior?.close ?? null;
    }
    const previous = [...ordered].reverse().find(row => row.date < date);
    const niftyChange = nifty !== null && previous ? nifty - previous.close : null;
    return { ...flow, date, nifty, niftyChange };
  });
}

export const FLOW_WINDOWS = [
  { id: "1D", label: "1D", days: 1 },
  { id: "1W", label: "1W", days: 7 },
  { id: "1M", label: "1M", days: 31 },
  { id: "3M", label: "3M", days: 93 },
  { id: "6M", label: "6M", days: 186 },
  { id: "1Y", label: "1Y", days: 372 },
] as const;

export function flowsInRange<T extends { date: string }>(rows: T[], days: number): T[] {
  const newest = rows.map(row => isoDay(row.date) ?? row.date).sort().at(-1);
  if (!newest) return [];
  const cut = new Date(`${newest}T00:00:00Z`);
  cut.setUTCDate(cut.getUTCDate() - (days - 1));
  const limit = cut.toISOString().slice(0, 10);
  return rows.filter(row => (isoDay(row.date) ?? row.date) >= limit).sort((a, b) => a.date.localeCompare(b.date));
}
