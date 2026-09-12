import "server-only";
import { parseKfinIssuers, publicationIdentity, reportedAllotmentOut, ipoPublicationSlug } from "./ipo-publication";

const ORIGIN = "https://ipostatus.kfintech.com";
let catalogue: { expires: number; names: string[] } | undefined;
let pending: Promise<string[]> | undefined;
async function kfinIssuers() {
  if (catalogue && catalogue.expires > Date.now()) return catalogue.names;
  if (pending) return pending;
  pending = (async () => {
    const page = await fetch(`${ORIGIN}/`, { cache: "no-store", redirect: "error", signal: AbortSignal.timeout(5000) });
    if (!page.ok) return [];
    const html = await page.text();
    const path = html.match(/\bsrc=["'](\.\/static\/js\/main\.[a-z0-9]+\.js)["']/i)?.[1];
    if (!path) return [];
    const script = await fetch(new URL(path, `${ORIGIN}/`), { cache: "no-store", redirect: "error", signal: AbortSignal.timeout(5000) });
    if (!script.ok) return [];
    const names = parseKfinIssuers(await script.text());
    catalogue = { expires: Date.now() + (names.length ? 300_000 : 30_000), names };
    return names;
  })();
  try { return await pending; } finally { pending = undefined; }
}

/** The registrar catalogue alone includes future issues: require an explicit independent release report too. */
export async function kfinPublicationReport(name: string): Promise<string | undefined> {
  try {
    const names = await kfinIssuers();
    if (names.filter(value => publicationIdentity(value) === publicationIdentity(name)).length !== 1) return undefined;
    const url = `https://www.ipoji.com/ipo-allotment-status/${ipoPublicationSlug(name)}`;
    const response = await fetch(url, { cache: "no-store", redirect: "error", signal: AbortSignal.timeout(5000) });
    if (!response.ok) return undefined;
    return reportedAllotmentOut(await response.text(), name) ? url : undefined;
  } catch { return undefined; }
}
