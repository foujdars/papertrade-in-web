export const ALLOTMENT_ALERT_ENABLED_KEY = "papertrade-ipo-allotment-alerts-v1";
export const ALLOTMENT_ALERT_STATE_KEY = "papertrade-ipo-allotment-seen-v1";
export const ALLOTMENT_ALERT_EVENT = "papertrade:ipo-allotment-settings";

// Fixed destinations only: never forward PANs, arbitrary feed URLs or redirect parameters.
export const ALLOTMENT_LINKS = {
  mufg: "https://in.mpms.mufg.com/Initial_Offer/public-issues.html",
  kfin: "https://ipostatus.kfintech.com/",
  bigshare: "https://ipo.bigshareonline.com/",
  bse: "https://www.bseindia.com/investors/appli_check.aspx",
} as const;
export type AllotmentRegistrar = keyof typeof ALLOTMENT_LINKS;
export type AllotmentState = "published" | "listed" | "scheduled" | "unconfirmed" | "unavailable";
export type IpoAllotment = {
  id: string;
  name: string;
  symbol: string;
  closeDate: string;
  allotmentDate: string;
  listingDate: string;
  registrarName: string;
  registrar: AllotmentRegistrar;
  state: AllotmentState;
  checkedAt: string;
  evidenceUrl?: string;
};
export type AllotmentResponse = {
  ok: boolean;
  allotments?: IpoAllotment[];
  fetchedAt?: string;
  partial?: boolean;
  error?: { message?: string };
};

export function allotmentLink(registrar: unknown): string | null {
  return typeof registrar === "string" && Object.hasOwn(ALLOTMENT_LINKS, registrar)
    ? ALLOTMENT_LINKS[registrar as AllotmentRegistrar] : null;
}

export function identifyRegistrar(name: string): AllotmentRegistrar {
  if (/\b(mufg|link\s*intime|intime)\b/i.test(name)) return "mufg";
  if (/\b(kfintech|kfin|karvy|kfin\s*technologies)\b/i.test(name)) return "kfin";
  if (/\bbig\s*share\b/i.test(name)) return "bigshare";
  return "bse";
}

export function validIpoDate(value: unknown) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return "";
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? value : "";
}

export function classifyAllotment(status: string, date: string, today: string, published: boolean): AllotmentState {
  if (published && (status === "closed" || status === "listed")) return "published";
  // Listing confirms completion, not the exact time a registrar released results.
  if (status === "listed") return "listed";
  if (validIpoDate(date) && date > today) return "scheduled";
  return "unconfirmed";
}

export function allotmentAlertKey(ipo: Pick<IpoAllotment, "id">) {
  return `ipo-allotment-${ipo.id}`;
}

export function shouldSendAllotmentAlert(ipo: IpoAllotment, seen: Record<string, number>, enabledAt: number, now = Date.now()) {
  if (!Number.isFinite(enabledAt) || enabledAt <= 0 || enabledAt > now) return false;
  if (!allotmentLink(ipo.registrar) || seen[allotmentAlertKey(ipo)]) return false;
  if (ipo.state !== "published" && ipo.state !== "listed") return false;
  // Do not flood a newly enabled device with old listings. Recent results remain useful.
  const eventDate = validIpoDate(ipo.allotmentDate) || validIpoDate(ipo.listingDate) || validIpoDate(ipo.closeDate);
  const eventTime = eventDate ? Date.parse(`${eventDate}T00:00:00+05:30`) : NaN;
  return Number.isFinite(eventTime) && eventTime <= now && now - eventTime <= 7 * 86_400_000;
}

export function normalizeIssuerName(value: string) {
  return value.toUpperCase().replace(/&AMP;/g, "&").replace(/\b(LIMITED|LTD|PRIVATE|PVT|IPO|INITIAL PUBLIC OFFER)\b/g, "").replace(/[^A-Z0-9]/g, "");
}

export function parseMufgCompanies(xml: string) {
  return [...xml.matchAll(/<Table>\s*([\s\S]*?)<\/Table>/g)].flatMap((match) => {
    const id = match[1].match(/<company_id>(\d+)<\/company_id>/)?.[1];
    const name = match[1].match(/<companyname>([^<]+)<\/companyname>/)?.[1];
    return id && name ? [{ id, name: normalizeIssuerName(name) }] : [];
  });
}
