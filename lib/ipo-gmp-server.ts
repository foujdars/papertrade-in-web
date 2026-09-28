import type { IpoSummary } from "./ipo";

const PUBLIC_GMP_URL = "https://ipogram.in/ipo-gmp/";
const LIVE_GMP_URL = "https://webnodejs.investorgain.com/cloud/v2/report/data-read/331";
const PUBLIC_GMP_TTL_MS = 15 * 60 * 1000;
const LIVE_GMP_TTL_MS = 2 * 60 * 1000;
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

export type PublicGmpEntry = {
  name: string;
  amount: number | null;
  checkedAt?: string;
  updatedAt?: string;
  subscription?: number | null;
};

let cachedFeed: { expiresAt: number; entries: PublicGmpEntry[] } | null = null;
let liveFeed: { expiresAt: number; entries: PublicGmpEntry[] } | null = null;

function decodeHtml(value: string) {
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/&#(\d+);/g, (_match, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&nbsp;|\u00a0/gi, " ")
    .replace(/&/gi, "&")
    .replace(/&ndash;|&mdash;/gi, "-")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeIpoMatchName(value: string) {
  return decodeHtml(value)
    .toLowerCase()
    .replace(/\b(initial public offering|ipo|gmp|limited|ltd|private|pvt)\b/g, " ")
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

export function parseBoardUpdatedAt(value: string, year: number) {
  const match = decodeHtml(value).match(/(\d{1,2})-([A-Za-z]{3})\s+(\d{1,2}):(\d{2})/);
  if (!match) return "";
  const month = MONTHS.indexOf(match[2].slice(0, 3).toLowerCase());
  const day = Number(match[1]), hour = Number(match[3]), minute = Number(match[4]);
  if (month < 0 || day < 1 || day > 31 || hour > 23 || minute > 59) return "";
  return new Date(Date.UTC(year, month, day, hour, minute) - 330 * 60 * 1000).toISOString();
}

export function parseLiveGmpRows(rows: unknown, year: number): PublicGmpEntry[] {
  if (!Array.isArray(rows)) return [];
  const entries: PublicGmpEntry[] = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const record = row as Record<string, unknown>;
    const name = decodeHtml(String(record["~ipo_name"] || record.Name || "")).replace(/\s+(?:IPO\s+GMP|GMP)$/i, "").trim();
    if (!name) continue;
    const quote = decodeHtml(String(record.GMP ?? "")).split("(")[0];
    const numeric = quote.match(/-?\d+(?:\.\d+)?/);
    const amount = numeric && !/--/.test(quote) ? Number(numeric[0]) : null;
    const subscriptionText = decodeHtml(String(record.Sub ?? ""));
    const subscriptionMatch = subscriptionText.match(/(\d+(?:\.\d+)?)\s*x/i);
    const subscription = subscriptionMatch ? Number(subscriptionMatch[1]) : null;
    entries.push({ name, amount: amount !== null && Number.isFinite(amount) ? amount : null, updatedAt: parseBoardUpdatedAt(String(record["Updated-On"] ?? ""), year), subscription: subscription !== null && Number.isFinite(subscription) ? subscription : null });
  }
  return entries;
}

export function parsePublicGmpHtml(html: string): PublicGmpEntry[] {
  const entries: PublicGmpEntry[] = [];
  const cardPattern = /<div class="ipg-gp-card-top">([\s\S]*?)<div class="ipg-gp-card-gmp">([\s\S]*?)<\/div>/gi;
  for (const card of html.matchAll(cardPattern)) {
    const nameMarkup = card[1].match(/class="ipg-gp-card-name"[^>]*>([\s\S]*?)<\/a>/i)?.[1] ?? "";
    const valueMarkup = card[2].match(/class="ipg-gp-card-val"[^>]*>([\s\S]*?)<\/span>/i)?.[1] ?? "";
    const name = decodeHtml(nameMarkup).replace(/\s+(?:IPO\s+GMP|GMP)$/i, "").trim();
    const numericValue = decodeHtml(valueMarkup).replace(/[^0-9.-]+/g, "");
    const parsedAmount = Number(numericValue);
    if (name && /\d/.test(numericValue) && Number.isFinite(parsedAmount)) entries.push({ name, amount: parsedAmount });
  }
  return entries;
}

export function findPublicGmp(ipo: Pick<IpoSummary, "name" | "symbol">, entries: PublicGmpEntry[]) {
  const targetName = normalizeIpoMatchName(ipo.name);
  const targetSymbol = normalizeIpoMatchName(ipo.symbol);
  return entries.find((entry) => {
    const candidate = normalizeIpoMatchName(entry.name);
    if (!candidate) return false;
    if (candidate === targetName || (targetSymbol && candidate === targetSymbol)) return true;
    return Math.min(candidate.length, targetName.length) >= 8
      && (candidate.includes(targetName) || targetName.includes(candidate));
  }) ?? null;
}

function boardPeriod(now: number) {
  const shifted = new Date(now + 330 * 60 * 1000);
  const year = shifted.getUTCFullYear();
  const month = shifted.getUTCMonth() + 1;
  const start = month >= 4 ? year : year - 1;
  return { year, month, fy: `${start}-${String((start + 1) % 100).padStart(2, "0")}` };
}

export async function loadLiveGmpFeed(now = Date.now()) {
  if (liveFeed && liveFeed.expiresAt > now) return liveFeed.entries;
  const { year, month, fy } = boardPeriod(now);
  const response = await fetch(`${LIVE_GMP_URL}/1/${month}/${year}/${fy}/0/all?search=`, {
    headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0" },
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Live GMP source returned ${response.status}`);
  const payload = await response.json() as { msg?: number; reportTableData?: unknown };
  const entries = parseLiveGmpRows(payload.reportTableData, year);
  if (payload.msg !== 1 || !entries.length) throw new Error("Live GMP source returned no records");
  liveFeed = { expiresAt: now + LIVE_GMP_TTL_MS, entries };
  return entries;
}

export async function loadPublicGmpFeed() {
  if (cachedFeed && cachedFeed.expiresAt > Date.now()) return cachedFeed.entries;
  const response = await fetch(PUBLIC_GMP_URL, {
    headers: {
      Accept: "text/html,application/xhtml+xml",
      "User-Agent": "PaperTradeIN/1.0 (+https://www.papertrade.site)",
    },
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Public GMP source returned ${response.status}`);
  const checkedAt = new Date().toISOString();
  const entries = parsePublicGmpHtml(await response.text()).map(entry => ({ ...entry, checkedAt }));
  if (!entries.length) throw new Error("Public GMP source returned no records");
  cachedFeed = { expiresAt: Date.now() + PUBLIC_GMP_TTL_MS, entries };
  return entries;
}
