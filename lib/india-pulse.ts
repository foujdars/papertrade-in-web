export type NseBreadth = { advance: number; decline: number };
export type IndexBreadth = { name: string; advance: number; decline: number };
export type IndiaVix = { price: number; change: number; changePercent: number; low: number | null; high: number | null };
export type CashFlow = { date: string; label: string; fii: number; dii: number };

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
