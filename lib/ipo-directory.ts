export type IpoBoard = "regular" | "sme";
export type IpoDirectoryEntry = { name: string; url: string; logoUrl?: string };
export const CHITTORGARH_DIRECTORY_URL = "https://www.chittorgarh.com/report/ipo-in-india-list-main-board-sme/82/all/";

function decodeText(value: string) {
  return value.replace(/<[^>]*>/g, "").replace(/&amp;/gi, "&").replace(/&#0*39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"').replace(/&nbsp;/gi, " ").trim();
}

export function issuerKey(value: string) {
  const key = decodeText(value).toLowerCase().replace(/\b(?:limited|ltd|ipo)\b/g, "").replace(/[^a-z0-9]/g, "");
  // The two sources use these verified names for the same issuer. No fuzzy matching.
  return key === "flyhimaritimetravels" ? "flyhimaritime" : key;
}

export function safeIpoPage(value: string): string | undefined {
  try {
    const url = new URL(value, "https://www.chittorgarh.com");
    if (url.protocol !== "https:" || url.hostname !== "www.chittorgarh.com" || url.port || url.username || url.password
      || !/^\/ipo\/[a-z0-9-]+\/\d+\/$/.test(url.pathname) || url.search || url.hash) return;
    return url.href;
  } catch { return; }
}

export function safeIpoLogo(value: string): string | undefined {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.hostname !== "www.chittorgarh.net" || url.port || url.username || url.password
      || !/^\/images\/ipo\/[a-z0-9_.-]+\.(?:png|jpg|jpeg|webp|gif)$/i.test(url.pathname) || url.search || url.hash) return;
    return url.href;
  } catch { return; }
}

export function parseIpoDirectory(html: string): IpoDirectoryEntry[] {
  const entries = new Map<string, IpoDirectoryEntry>();
  for (const match of html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const url = safeIpoPage(decodeText(match[1]));
    const name = decodeText(match[2]);
    if (url && name && name.length < 180) entries.set(url, { name, url });
  }
  return [...entries.values()];
}

export function parseIssuerLogo(html: string, name: string): string | undefined {
  for (const match of html.matchAll(/<img\b[^>]*>/gi)) {
    const tag = match[0];
    const alt = tag.match(/\balt=["']([^"']+)["']/i)?.[1] ?? "";
    if (!/\blogo\b/i.test(alt) || issuerKey(alt.replace(/\blogo\b/gi, "")) !== issuerKey(name)) continue;
    const src = tag.match(/\bsrc=["']([^"']+)["']/i)?.[1];
    if (src) return safeIpoLogo(decodeText(src));
  }
}

export function matchIpoDirectory(name: string, entries: IpoDirectoryEntry[]) {
  const matches = entries.filter((entry) => issuerKey(entry.name) === issuerKey(name) && safeIpoPage(entry.url));
  // Ambiguous matches must not send the user to an unrelated issue.
  return matches.length === 1 ? matches[0] : undefined;
}

export function filterIpoBoard<T extends { issueType?: string }>(items: T[], board: IpoBoard): T[] {
  return items.filter((item) => item.issueType === board);
}
