import "server-only";
import { CHITTORGARH_DIRECTORY_URL, parseIpoDirectory, parseIssuerLogo, type IpoDirectoryEntry } from "./ipo-directory";

const TTL = 60 * 60_000;
type Directory = { entries: IpoDirectoryEntry[]; fetchedAt: string; partial: boolean };
let cached: { expires: number; value: Directory } | undefined;
let pending: Promise<Directory> | undefined;

async function publicPage(url: string, timeout: number) {
  // Only fixed catalogue URLs or validated catalogue links reach this function.
  // No access tokens, user identifiers or arbitrary user-supplied URLs.
  const response = await fetch(url, { signal: AbortSignal.timeout(timeout), redirect: "error", cache: "no-store" });
  if (!response.ok || !response.headers.get("content-type")?.includes("text/html")) throw new Error("Directory unavailable");
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Directory unavailable");
  const decoder = new TextDecoder();
  let size = 0, html = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 2_000_000) throw new Error("Directory too large");
      html += decoder.decode(value, { stream: true });
    }
    return html + decoder.decode();
  } finally { await reader.cancel(); }
}

export async function loadIpoDirectory(): Promise<Directory> {
  if (cached && cached.expires > Date.now()) return cached.value;
  if (pending) return pending;
  pending = (async () => {
    try {
      const entries = parseIpoDirectory(await publicPage(CHITTORGARH_DIRECTORY_URL, 8_000)).slice(0, 60);
      if (!entries.length) throw new Error("No verified IPO links");
      let partial = false, next = 0;
      const deadline = Date.now() + 16_000;
      await Promise.all(Array.from({ length: 4 }, async () => {
        while (next < entries.length) {
          const entry = entries[next++];
          if (Date.now() >= deadline) { partial = true; continue; }
          try {
            entry.logoUrl = parseIssuerLogo(await publicPage(entry.url, 4_000), entry.name);
            if (!entry.logoUrl) partial = true;
          } catch { partial = true; }
        }
      }));
      const value = { entries, fetchedAt: new Date().toISOString(), partial };
      cached = { value, expires: Date.now() + (partial ? 5 * 60_000 : TTL) };
      return value;
    } catch {
      // The independently loaded directory must never break prices or IPO status.
      const value = { entries: cached?.value.entries ?? [], fetchedAt: cached?.value.fetchedAt ?? "", partial: true };
      cached = { value, expires: Date.now() + 60_000 };
      return value;
    }
  })();
  try { return await pending; } finally { pending = undefined; }
}
