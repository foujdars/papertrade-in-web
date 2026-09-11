import "server-only";
import { upstoxFetch } from "./upstox-server";
import { allotmentLink, identifyRegistrar, validIpoDate } from "./ipo-allotment";
import type { IpoDetails } from "./ipo-lifecycle";
import { verifyPublishedAllotment } from "./ipo-allotment-server";

type DetailsPayload = { data?: { id?: string; name?: string; status?: string; listing_price?: number | null; cut_off_price?: number | null;
  daily_end_time?: string; timeline?: { listing_date?: string; allotment_date?: string; refund_initiation_date?: string; demat_transfer_date?: string };
  registrar_info?: { name?: string; registrar?: string } } };
const cache = new Map<string, { expires: number; data: IpoDetails }>();
const pending = new Map<string, Promise<IpoDetails>>();
const positive = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
export async function loadIpoDetails(id: string): Promise<IpoDetails> {
  const hit = cache.get(id);
  if (hit && hit.expires > Date.now()) return hit.data;
  if (pending.has(id)) return pending.get(id)!;
  const task = (async () => {
    const { data } = await upstoxFetch<DetailsPayload>(`/v2/ipos/${encodeURIComponent(id)}`);
    if (!data || data.id !== id) throw new Error("IPO details could not be verified");
    const registrarName = data.registrar_info?.name || data.registrar_info?.registrar || "Registrar not announced";
    const registrar = identifyRegistrar(`${registrarName} ${data.registrar_info?.registrar ?? ""}`);
    const result: IpoDetails = {
      listingDate: validIpoDate(data.timeline?.listing_date), allotmentDate: validIpoDate(data.timeline?.allotment_date),
      refundDate: validIpoDate(data.timeline?.refund_initiation_date), dematDate: validIpoDate(data.timeline?.demat_transfer_date),
      listingPrice: positive(data.listing_price), issuePrice: positive(data.cut_off_price),
      dailyEndTime: /^\d{2}:\d{2}(:\d{2})?$/.test(data.daily_end_time ?? "") ? data.daily_end_time!.padEnd(8, ":00") : "",
      registrarName, registrarUrl: registrar === "bse" ? "" : allotmentLink(registrar) ?? "",
      allotmentPublished: data.status === "closed" && registrar === "mufg" ? Boolean(await verifyPublishedAllotment(data.name ?? "")) : false,
    };
    if (cache.size >= 1000) cache.delete(cache.keys().next().value!);
    cache.set(id, { expires: Date.now() + 300_000, data: result });
    return result;
  })();
  pending.set(id, task);
  try { return await task; } finally { pending.delete(id); }
}
