import "server-only";
import { issuerKey } from "./ipo-directory";
import { ipoPublicationSlug } from "./ipo-publication";
import { parseIpoChances, type IpoChances } from "./ipo-chances";

const cache = new Map<string, { expires: number; result: IpoChances | null }>();
const pending = new Map<string, Promise<IpoChances | null>>();
export async function loadIpoChances(name: string): Promise<IpoChances | null> {
  if (!name || name.length > 160 || !/^[\w\s&().,'-]+$/.test(name)) return null;
  const key = issuerKey(name), saved = cache.get(key);
  if (saved && saved.expires > Date.now()) return saved.result;
  if (pending.has(key)) return pending.get(key)!;
  if (pending.size >= 12) throw new Error("Research is busy. Please retry shortly.");
  const task = (async () => {
    const slug = key === "assetreconstructioncompanyindia" ? "asset-reconstruction-ipo" : ipoPublicationSlug(name);
    const sourceUrl = `https://www.ipoji.com/ipo/${slug}`;
    const response = await fetch(sourceUrl, { cache: "no-store", redirect: "error", signal: AbortSignal.timeout(8000) });
    if (!response.ok || !response.headers.get("content-type")?.includes("text/html")) throw new Error("Research source is temporarily unavailable.");
    const reader = response.body?.getReader();
    if (!reader) throw new Error("Research source returned an empty response.");
    const decoder = new TextDecoder(); let html = "", bytes = 0;
    try {
      while (true) { const { done, value } = await reader.read(); if (done) break; bytes += value.length; if (bytes > 2_000_000) throw new Error("Research response too large."); html += decoder.decode(value, { stream: true }); }
    } finally { await reader.cancel(); }
    const ratios = parseIpoChances(html + decoder.decode(), name);
    const result = ratios ? { ...ratios, sourceUrl, checkedAt: new Date().toISOString() } : null;
    if (cache.size >= 200) cache.delete(cache.keys().next().value!);
    cache.set(key, { expires: Date.now() + 300_000, result });
    return result;
  })();
  pending.set(key, task);
  try { return await task; } finally { pending.delete(key); }
}
