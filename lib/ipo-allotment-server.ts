import "server-only";
import { classifyAllotment, identifyRegistrar, normalizeIssuerName, parseMufgCompanies, validIpoDate, type IpoAllotment } from "./ipo-allotment";
import { indiaDateKey } from "./ipo";
import { upstoxFetch } from "./upstox-server";

type Issue = { id?: string; name?: string; symbol?: string; status?: string; bidding_end_date?: string };
type Details = Issue & { timeline?: { allotment_date?: string; listing_date?: string }; registrar_info?: { name?: string; registrar?: string } };
type Payload<T> = { data?: T };
const TTL = 5 * 60_000;
let cached: { expires: number; value: { allotments: IpoAllotment[]; fetchedAt: string; partial: boolean } } | undefined;
let pending: Promise<NonNullable<typeof cached>["value"]> | undefined;
let mufgCompanies: { expires: number; value: ReturnType<typeof parseMufgCompanies> } | undefined;

async function deadline<T>(promise: Promise<T>, milliseconds = 8_000): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  try {
    return await Promise.race([promise, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("IPO details timed out")), milliseconds); })]);
  } finally { clearTimeout(timer!); }
}

async function publishedBasis(name: string, companies: ReturnType<typeof parseMufgCompanies>): Promise<string | undefined> {
  const normalized = normalizeIssuerName(name);
  const matches = companies.filter((company) => company.name === normalized);
  if (matches.length !== 1) return undefined;
  const url = `https://in.mpms.mufg.com/Initial_Offer/PDF/${matches[0].id}/BasisOfAllotment.pdf`;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(4_000), redirect: "error", cache: "no-store" });
    if (!response.ok || !response.headers.get("content-type")?.includes("application/pdf")) { await response.body?.cancel(); return undefined; }
    // Confirm real PDF bytes; some registrar servers return a 200 HTML error page.
    const reader = response.body?.getReader();
    if (!reader) return undefined;
    try {
      const { value } = await reader.read();
      return new TextDecoder().decode(value?.slice(0, 5)) === "%PDF-" ? url : undefined;
    } finally { await reader.cancel(); }
  } catch { return undefined; }
}

async function loadMufgCompanies() {
  if (mufgCompanies && mufgCompanies.expires > Date.now()) return mufgCompanies.value;
  try {
    // This public catalogue contains no investor data. Never call PAN/captcha endpoints.
    const response = await fetch("https://in.mpms.mufg.com/Initial_Offer/IPO.aspx/GetDetails", {
      method: "POST", headers: { "Content-Type": "application/json;charset=utf-8" }, body: "{}",
      signal: AbortSignal.timeout(4_000), redirect: "error", cache: "no-store",
    });
    if (!response.ok) throw new Error("Registrar catalogue unavailable");
    const data = await response.json() as { d?: string };
    const value = typeof data.d === "string" ? parseMufgCompanies(data.d) : [];
    mufgCompanies = { value, expires: Date.now() + TTL };
    return value;
  } catch { return []; }
}

export async function loadAllotments() {
  if (cached && cached.expires > Date.now()) return cached.value;
  if (pending) return pending;
  pending = (async () => {
    const requestDeadline = Date.now() + 25_000;
    const results = await Promise.allSettled(["closed", "listed"].map((status) => deadline(upstoxFetch<Payload<Issue[]>>(`/v2/ipos?status=${status}&page_number=1&records=30`))));
    if (results.every((result) => result.status === "rejected")) throw new Error("IPO allotment information is temporarily unavailable. Please refresh shortly.");
    let partial = results.some((result) => result.status === "rejected");
    const cutoff = indiaDateKey(Date.now() - 30 * 86_400_000);
    const issues = [...new Map(results.flatMap((result) => result.status === "fulfilled" && Array.isArray(result.value.data) ? result.value.data : [])
      .filter((issue) => issue.id && ["closed", "listed"].includes(issue.status ?? "") && validIpoDate(issue.bidding_end_date) >= cutoff)
      .map((issue) => [issue.id!, issue])).values()].sort((a, b) => (b.bidding_end_date ?? "").localeCompare(a.bidding_end_date ?? ""));
    const fetchedAt = new Date().toISOString();
    const today = indiaDateKey();
    const allotments: IpoAllotment[] = [];
    const companies = await loadMufgCompanies();
    // Concurrency is bounded, and a warm result is shared by all visitors/monitors.
    let next = 0;
    await Promise.all(Array.from({ length: 6 }, async () => {
      while (next < issues.length) {
        const issue = issues[next++];
        const base: IpoAllotment = {
          id: issue.id!, name: issue.name || issue.symbol || "IPO", symbol: issue.symbol || "",
          closeDate: validIpoDate(issue.bidding_end_date), allotmentDate: "", listingDate: "",
          registrarName: "Registrar details unavailable", registrar: "bse", state: "unavailable", checkedAt: fetchedAt,
        };
        if (Date.now() > requestDeadline) { partial = true; allotments.push(base); continue; }
        try {
          const { data } = await deadline(upstoxFetch<Payload<Details>>(`/v2/ipos/${encodeURIComponent(issue.id!)}`));
          if (!data || data.id !== issue.id) throw new Error("Mismatched IPO details");
          const registrarName = data.registrar_info?.name || data.registrar_info?.registrar || "Registrar not announced";
          const registrar = identifyRegistrar(`${registrarName} ${data.registrar_info?.registrar ?? ""}`);
          const allotmentDate = validIpoDate(data.timeline?.allotment_date);
          const evidenceUrl = registrar === "mufg" ? await publishedBasis(base.name, companies) : undefined;
          allotments.push({ ...base, registrarName, registrar, allotmentDate, listingDate: validIpoDate(data.timeline?.listing_date),
            state: classifyAllotment(data.status ?? issue.status!, allotmentDate, today, Boolean(evidenceUrl)), evidenceUrl });
        } catch { partial = true; allotments.push(base); }
      }
    }));
    const value = { allotments: allotments.sort((a, b) => b.closeDate.localeCompare(a.closeDate)), fetchedAt, partial };
    cached = { value, expires: Date.now() + (partial ? 30_000 : TTL) };
    return value;
  })();
  try { return await pending; } finally { pending = undefined; }
}
