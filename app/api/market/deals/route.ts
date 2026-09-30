import { latestSession, presentDeals, type Deal } from "@/lib/bulk-deals";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const URL = "https://ow-static-scanx.dhan.co/staticscanx/deal";
const UA = "Mozilla/5.0 (compatible; PaperTrade/1.0)";

let cache: { until: number; value: { date: string; rows: Deal[] } } | null = null;
let pending: Promise<{ date: string; rows: Deal[] }> | null = null;

function istDay(offset: number) {
  const ist = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
  ist.setUTCDate(ist.getUTCDate() + offset);
  const day = String(ist.getUTCDate()).padStart(2, "0");
  const month = String(ist.getUTCMonth() + 1).padStart(2, "0");
  return `${day}-${month}-${ist.getUTCFullYear()}`;
}

async function page(pageno: number) {
  const response = await fetch(URL, {
    method: "POST",
    headers: { "content-type": "application/json", "user-agent": UA, accept: "application/json" },
    body: JSON.stringify({ data: { startdate: istDay(-1), enddate: istDay(0), defaultpage: "N", pageno, pagecount: 200 } }),
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) return { rows: [] as unknown[], pages: 1 };
  const body = await response.json();
  return { rows: Array.isArray(body?.data) ? body.data as unknown[] : [], pages: Math.max(1, Number(body?.totalpage) || 1) };
}

async function load() {
  const first = await page(1);
  const extra = Math.max(0, Math.min(first.pages, 6) - 1);
  const rest = await Promise.all(Array.from({ length: extra }, (_, index) => page(index + 2).catch(() => ({ rows: [] as unknown[], pages: 1 }))));
  return latestSession(presentDeals([first.rows, ...rest.map(item => item.rows)].flat()));
}

export async function GET() {
  if (cache && cache.until > Date.now()) return Response.json({ ok: true, ...cache.value }, { headers: { "Cache-Control": "public, max-age=120" } });
  pending ??= load().finally(() => { pending = null; });
  const value = await pending;
  cache = { until: Date.now() + 15 * 60 * 1000, value };
  return Response.json({ ok: true, ...value }, { headers: { "Cache-Control": "public, max-age=120" } });
}
