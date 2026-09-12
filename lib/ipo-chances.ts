import { issuerKey } from "./ipo-directory";

export type IpoChances = { bnii: number | null; snii: number | null; retail: number | null; sourceUrl: string; checkedAt: string };
const text = (html: string) => html.replace(/<[^>]*>/g, " ").replace(/&nbsp;|&#160;/g, " ").replace(/\s+/g, " ").trim();

/** Parse application-based demand ONLY, not share subscription multiples. */
export function parseIpoChances(html: string, name: string): Pick<IpoChances, "bnii" | "snii" | "retail"> | null {
  const card = html.match(/<section\b[^>]*\bdata-testid=["']ipo-summary-card["'][^>]*>/i)?.[0];
  const issuer = card?.match(/\bdata-ipo-name=["']([^"']+)["']/i)?.[1];
  if (!issuer || issuerKey(issuer) !== issuerKey(name)) return null;
  const tables = [...html.matchAll(/<table\b[^>]*class=["'][^"']*\bsubscription-apps-extras-table\b[^"']*["'][^>]*>([\s\S]*?)<\/table>/gi)];
  if (tables.length !== 1) return null;
  const rows = [...tables[0][1].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map(row => [...row[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(cell => text(cell[1])));
  if (rows.length !== 2 || !/Total No\. of Applications/i.test(rows[0][0] ?? "")) return null;
  const read = (label: RegExp) => {
    const index = rows[0].findIndex(value => label.test(value));
    const value = rows[1][index]?.match(/^([\d,]+(?:\.\d+)?)\s*[x×]$/i)?.[1];
    const number = value ? Number(value.replace(/,/g, "")) : NaN;
    return Number.isFinite(number) && number > 0 && number < 1_000_000 ? number : null;
  };
  const result = { bnii: read(/^(bHNI|bNII)$/i), snii: read(/^(sHNI|sNII)$/i), retail: read(/^Retail$/i) };
  return Object.values(result).some(value => value !== null) ? result : null;
}

export function chanceLabel(ratio: number | null) {
  if (ratio === null || !Number.isFinite(ratio) || ratio <= 0) return "Not published yet";
  if (ratio < 1) return "Below 1× demand";
  return `Approx. 1 in ${Math.max(1, Math.round(ratio)).toLocaleString("en-IN")}`;
}
