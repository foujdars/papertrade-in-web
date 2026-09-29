import { NSE_HOLIDAYS } from "./nse-holidays.ts";

export type NseBreadth = { advance: number; decline: number };
export type IndexBreadth = { name: string; advance: number; decline: number };
export type IndiaVix = { price: number; change: number; changePercent: number; low: number | null; high: number | null };
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
