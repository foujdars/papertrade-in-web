import type { IpoSummary } from "./ipo";

const PUBLIC_GMP_URL = "https://ipogram.in/ipo-gmp/";
const PUBLIC_GMP_TTL_MS = 15 * 60 * 1000;

export type PublicGmpEntry = {
  name: string;
  amount: number;
};

let cachedFeed: { expiresAt: number; entries: PublicGmpEntry[] } | null = null;

function decodeHtml(value: string) {
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/&#(\d+);/g, (_match, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&nbsp;|\u00a0/gi, " ")
    .replace(/&amp;/gi, "&")
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
  const entries = parsePublicGmpHtml(await response.text());
  if (!entries.length) throw new Error("Public GMP source returned no records");
  cachedFeed = { expiresAt: Date.now() + PUBLIC_GMP_TTL_MS, entries };
  return entries;
}
