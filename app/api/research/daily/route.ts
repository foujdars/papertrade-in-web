import type { DailyResearch } from "@/lib/research";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    // Read persisted results independently of deployment, so a scan does not need a rebuild.
    const response = await fetch("https://raw.githubusercontent.com/foujdars/papertrade-in-web/main/public/research/daily.json", { cache: "no-store", signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error("No scan available");
    const data = await response.json() as DailyResearch;
    if (data.version !== 1 || !Number.isFinite(data.generatedAt) || data.generatedAt > Date.now() + 300000 || !Array.isArray(data.rows) || data.rows.length > 100) throw new Error("Invalid saved scan");
    return Response.json({ ok: true, data, stale: Date.now() - data.generatedAt > 4 * 86400000, schedule: "Weekdays at 16:15 IST · GitHub Actions" }, { headers: { "Cache-Control": "public, max-age=60" } });
  } catch {
    return Response.json({ ok: false, error: "The daily scan is not available yet. Run Daily NSE research scan in GitHub Actions, or wait for the next weekday scan after this update is merged.", schedule: "Weekdays at 16:15 IST · GitHub Actions" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
