import "server-only";
import { issuerKey, parseSupplementalIpoLogo } from "./ipo-directory";
import { ipoPublicationSlug } from "./ipo-publication";

const cache = new Map<string, { expires: number; logoUrl?: string }>();
const pending = new Map<string, Promise<string | undefined>>();

/** Public issuer artwork only. No credentials, arbitrary URLs or redirects. */
export async function loadSupplementalIpoLogo(name: string): Promise<string | undefined> {
  if (!name || name.length > 160 || !/^[\w\s&().,'-]+$/.test(name)) return;
  const key = issuerKey(name);
  const saved = cache.get(key);
  if (saved && saved.expires > Date.now()) return saved.logoUrl;
  if (pending.has(key)) return pending.get(key);
  if (pending.size >= 12) return;
  const task = (async () => {
    let logoUrl: string | undefined;
    try {
      const slug = key === "assetreconstructioncompanyindia" ? "asset-reconstruction-ipo" : ipoPublicationSlug(name);
      const response = await fetch(`https://www.ipoji.com/ipo/${slug}`, { redirect: "error", cache: "no-store", signal: AbortSignal.timeout(5000) });
      if (!response.ok || !response.headers.get("content-type")?.includes("text/html")) throw new Error("Logo unavailable");
      const reader = response.body?.getReader();
      if (!reader) throw new Error("Logo unavailable");
      let html = "", bytes = 0;
      const decoder = new TextDecoder();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          bytes += value.length;
          if (bytes > 2_000_000) throw new Error("Page too large");
          html += decoder.decode(value, { stream: true });
        }
        logoUrl = parseSupplementalIpoLogo(html + decoder.decode(), name);
      } finally { await reader.cancel(); }
    } catch { /* Missing artwork must never break the IPO list. */ }
    if (cache.size >= 300) cache.delete(cache.keys().next().value!);
    cache.set(key, { expires: Date.now() + (logoUrl ? 86_400_000 : 300_000), logoUrl });
    return logoUrl;
  })();
  pending.set(key, task);
  try { return await task; } finally { pending.delete(key); }
}
