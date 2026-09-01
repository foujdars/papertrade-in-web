import { calculateGmpPercent, dedupeIpos, normalizeGmp, normalizeSubscription, type IpoStatus, type IpoSummary } from "@/lib/ipo";
import { upstoxErrorResponse, upstoxFetch } from "@/lib/upstox-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type UpstoxIpo = {
  id?: string;
  symbol?: string;
  name?: string;
  status?: string;
  isin?: string;
  issue_type?: string;
  issue_size?: number;
  industry?: string;
  minimum_price?: number;
  maximum_price?: number;
  bidding_start_date?: string;
  bidding_end_date?: string;
  total_subscription?: string | number;
};

type UpstoxIpoPayload = { status?: string; data?: UpstoxIpo[] };
type GmpTrendPayload = {
  series?: Array<{ timestamp?: string; price?: number | null }>;
};
const allowedStatuses = new Set<IpoStatus>(["open", "upcoming", "closed", "listed"]);
const GMP_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const gmpCache = new Map<string, { expiresAt: number; amount: number | null; updatedAt: string }>();

async function loadLatestGmp(ipo: IpoSummary, apiKey: string) {
  const identifier = ipo.symbol || ipo.id;
  const cached = gmpCache.get(identifier);
  if (cached && cached.expiresAt > Date.now()) return cached;
  try {
    const response = await fetch(
      `https://api.ipoalerts.in/ipos/${encodeURIComponent(identifier)}/gmp?interval=daily&field=median`,
      {
        headers: { "x-api-key": apiKey, Accept: "application/json" },
        cache: "no-store",
        signal: AbortSignal.timeout(10_000),
      },
    );
    if (!response.ok) throw new Error(`GMP provider returned ${response.status}`);
    const payload = await response.json() as GmpTrendPayload;
    const latest = [...(payload.series ?? [])]
      .filter((point) => normalizeGmp(point.price) !== null)
      .sort((left, right) => new Date(left.timestamp ?? 0).getTime() - new Date(right.timestamp ?? 0).getTime())
      .at(-1);
    const result = {
      expiresAt: Date.now() + GMP_CACHE_TTL_MS,
      amount: normalizeGmp(latest?.price),
      updatedAt: latest?.timestamp?.trim() ?? "",
    };
    gmpCache.set(identifier, result);
    return result;
  } catch {
    return { expiresAt: Date.now() + 15 * 60 * 1000, amount: null, updatedAt: "" };
  }
}

function normalizeIpo(ipo: UpstoxIpo): IpoSummary | null {
  const id = ipo.id?.trim() ?? "";
  const status = ipo.status?.trim().toLowerCase() as IpoStatus;
  if (!id || !allowedStatuses.has(status)) return null;
  return {
    id,
    symbol: ipo.symbol?.trim().toUpperCase() ?? "",
    name: ipo.name?.trim() || ipo.symbol?.trim().toUpperCase() || "IPO",
    status,
    isin: ipo.isin?.trim().toUpperCase() ?? "",
    issueType: ipo.issue_type === "sme" ? "sme" : "regular",
    issueSizeCrore: Number.isFinite(Number(ipo.issue_size)) ? Number(ipo.issue_size) : 0,
    industry: ipo.industry?.trim() ?? "",
    minimumPrice: Number.isFinite(Number(ipo.minimum_price)) ? Number(ipo.minimum_price) : 0,
    maximumPrice: Number.isFinite(Number(ipo.maximum_price)) ? Number(ipo.maximum_price) : 0,
    biddingStartDate: ipo.bidding_start_date?.trim() ?? "",
    biddingEndDate: ipo.bidding_end_date?.trim() ?? "",
    totalSubscription: normalizeSubscription(ipo.total_subscription),
    gmpAmount: null,
    gmpPercent: null,
    gmpUpdatedAt: "",
  };
}

export async function GET(request: Request) {
  try {
    const requestedStatuses = (new URL(request.url).searchParams.get("status") ?? "open,upcoming")
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean) as IpoStatus[];
    const statuses = [...new Set(requestedStatuses)];
    if (!statuses.length || statuses.length > 4 || statuses.some((status) => !allowedStatuses.has(status))) {
      return Response.json(
        { ok: false, error: { code: "INVALID_IPO_STATUS", message: "Use open, upcoming, closed, or listed IPO status." } },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }

    const payloads = await Promise.all(statuses.map((status) => {
      const params = new URLSearchParams({ status, page_number: "1", records: "30" });
      return upstoxFetch<UpstoxIpoPayload>(`/v2/ipos?${params}`);
    }));
    const normalizedIpos = dedupeIpos(payloads.flatMap((payload) => payload.data ?? [])
      .map(normalizeIpo)
      .filter((ipo): ipo is IpoSummary => Boolean(ipo)));
    const gmpApiKey = process.env.IPOALERTS_API_KEY?.trim() ?? "";
    const ipos = gmpApiKey
      ? await Promise.all(normalizedIpos.map(async (ipo) => {
        if (ipo.status !== "open") return ipo;
        const gmp = await loadLatestGmp(ipo, gmpApiKey);
        return {
          ...ipo,
          gmpAmount: gmp.amount,
          gmpPercent: calculateGmpPercent(gmp.amount, ipo.maximumPrice),
          gmpUpdatedAt: gmp.updatedAt,
        };
      }))
      : normalizedIpos;

    return Response.json(
      {
        ok: true,
        source: gmpApiKey ? "upstox+ipoalerts" : "upstox",
        gmpFeedConfigured: Boolean(gmpApiKey),
        ipos,
        fetchedAt: new Date().toISOString(),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return upstoxErrorResponse(error);
  }
}
