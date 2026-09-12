/** Parse data, never execute a registrar's JavaScript. */
export function parseKfinIssuers(script: string): string[] {
  const result: string[] = [];
  for (const match of script.matchAll(/JSON\.parse\('(\[\{"clientId"[\s\S]*?)'\)/g)) {
    try {
      const rows: unknown = JSON.parse(match[1]);
      if (!Array.isArray(rows)) continue;
      for (const row of rows) if (typeof row?.name === "string" && /^\d+$/.test(row?.clientId ?? "")) result.push(row.name);
    } catch { /* A changed catalogue format is unavailable, not a release. */ }
  }
  return result;
}
export function publicationIdentity(name: string) {
  return name.toUpperCase().replace(/&AMP;/g, "&").replace(/\b(LIMITED|LTD|PRIVATE|PVT|IPO|SME)\b/g, "").replace(/[^A-Z0-9]/g, "");
}
export function reportedAllotmentOut(html: string, name: string): boolean {
  // Only the page's primary issue record counts. Ignore FAQs, generic instructions and related issues.
  const card = html.match(/<section\b[^>]*\bdata-testid=["']ipo-summary-card["'][^>]*>/i)?.[0];
  if (!card) return false;
  const status = card.match(/\bdata-ipo-status=["']([^"']*)["']/i)?.[1];
  const issuer = card.match(/\bdata-ipo-name=["']([^"']*)["']/i)?.[1];
  return status === "Allotment Out" && Boolean(issuer) && publicationIdentity(issuer!) === publicationIdentity(name);
}
export function ipoPublicationSlug(name: string) {
  return name.toLowerCase().replace(/\b(ipo|limited|ltd|private|pvt|sme)\b/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") + "-ipo";
}
