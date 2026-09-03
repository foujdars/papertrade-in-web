export const IPO_GMP_ALERT_THRESHOLD_PERCENT = 15;
export const IPO_ALERT_ENABLED_STORAGE_KEY = "papertrade-ipo-alerts-enabled-v1";
export const IPO_ALERT_STATE_STORAGE_KEY = "papertrade-ipo-gmp-alert-state-v2";
export const IPO_ALERT_SETTINGS_EVENT = "papertrade-ipo-alert-settings";

export type IpoStatus = "open" | "upcoming" | "closed" | "listed";

export type IpoSummary = {
  id: string;
  symbol: string;
  name: string;
  status: IpoStatus;
  isin: string;
  issueType: "regular" | "sme";
  issueSizeCrore: number;
  industry: string;
  minimumPrice: number;
  maximumPrice: number;
  biddingStartDate: string;
  biddingEndDate: string;
  totalSubscription: number;
  gmpAmount: number | null;
  gmpPercent: number | null;
  gmpUpdatedAt: string;
};

export type IpoListResponse = {
  ok: boolean;
  source?: "upstox" | "upstox+ipoalerts";
  gmpFeedConfigured?: boolean;
  ipos?: IpoSummary[];
  fetchedAt?: string;
  error?: { code?: string; message?: string };
};

export function normalizeSubscription(value: unknown) {
  const normalized = Number(value);
  return Number.isFinite(normalized) && normalized >= 0 ? normalized : 0;
}

export function normalizeGmp(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const normalized = Number(value);
  return Number.isFinite(normalized) ? normalized : null;
}

/** Missing GMP is distinct from a reported zero; callers render a small status. */
export function formatIpoGmp(ipo: Pick<IpoSummary, "gmpAmount" | "gmpPercent">) {
  const amount = normalizeGmp(ipo.gmpAmount);
  const percent = normalizeGmp(ipo.gmpPercent);
  if (amount === null || percent === null) return null;
  return `${amount > 0 ? "+" : ""}₹${amount.toLocaleString("en-IN", { maximumFractionDigits: 2 })} (${percent > 0 ? "+" : ""}${percent.toFixed(2)}%)`;
}

export function calculateGmpPercent(gmpAmount: unknown, upperIssuePrice: unknown) {
  const amount = normalizeGmp(gmpAmount);
  const issuePrice = Number(upperIssuePrice);
  if (amount === null || !Number.isFinite(issuePrice) || issuePrice <= 0) return null;
  return Number(((amount / issuePrice) * 100).toFixed(2));
}

export function indiaDateKey(value: Date | string | number = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Asia/Kolkata",
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function shouldSendDailyGmpAlert(
  status: IpoStatus,
  gmpPercent: unknown,
  lastAlertDate: string | undefined,
  today = indiaDateKey(),
) {
  const percentage = normalizeGmp(gmpPercent);
  return status === "open"
    && percentage !== null
    && percentage > IPO_GMP_ALERT_THRESHOLD_PERCENT
    && Boolean(today)
    && lastAlertDate !== today;
}

export function dedupeIpos(ipos: IpoSummary[]) {
  const unique = new Map<string, IpoSummary>();
  for (const ipo of ipos) {
    const key = ipo.id.trim().toLowerCase();
    if (!key) continue;
    const existing = unique.get(key);
    if (!existing || ipo.totalSubscription > existing.totalSubscription) unique.set(key, ipo);
  }
  return [...unique.values()];
}
