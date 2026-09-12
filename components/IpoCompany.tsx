"use client";

import { useEffect, useState } from "react";
import { ExternalLink } from "lucide-react";
import { CHITTORGARH_DIRECTORY_URL, issuerKey, matchIpoDirectory, safeIpoLogo, type IpoDirectoryEntry } from "@/lib/ipo-directory";

export function useIpoDirectory(names: string[] = []) {
  const [entries, setEntries] = useState<IpoDirectoryEntry[]>([]);
  const [logos, setLogos] = useState<IpoDirectoryEntry[]>([]);
  const nameKey = JSON.stringify([...new Set(names)].sort());
  useEffect(() => {
    const issuers = JSON.parse(nameKey) as string[];
    const controller = new AbortController();
    let next = 0;
    void Promise.all(Array.from({ length: 4 }, async () => {
      while (next < issuers.length && !controller.signal.aborted) {
        const name = issuers[next++];
        try {
          const response = await fetch(`/api/ipo-logos?name=${encodeURIComponent(name)}`, { signal: controller.signal });
          if (!response.ok) continue;
          const result = await response.json() as { name?: string; logoUrl?: string };
          if (!controller.signal.aborted && result.name === name && result.logoUrl && safeIpoLogo(result.logoUrl)) {
            setLogos(previous => [...previous.filter(entry => entry.name !== name), { name, url: "", logoUrl: result.logoUrl }]);
          }
        } catch { /* Initials remain available if the public artwork is offline. */ }
      }
    }));
    return () => controller.abort();
  }, [nameKey]);
  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 35_000);
    void fetch("/api/ipo-directory", { signal: controller.signal }).then(async (response) => {
      if (!response.ok) return;
      const data = await response.json() as { entries?: IpoDirectoryEntry[] };
      if (!controller.signal.aborted && Array.isArray(data.entries)) setEntries(data.entries);
    }).catch(() => undefined).finally(() => window.clearTimeout(timer));
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, []);
  return [...entries, ...logos];
}

export function IpoCompanyLogo({ name, entries }: { name: string; entries: IpoDirectoryEntry[] }) {
  const [failedSources, setFailedSources] = useState<string[]>([]);
  const source = entries.filter(entry => issuerKey(entry.name) === issuerKey(name))
    .map(entry => entry.logoUrl ? safeIpoLogo(entry.logoUrl) : undefined).find(url => url && !failedSources.includes(url));
  const initials = name.replace(/\b(?:ipo|limited|ltd)\b/gi, "").trim().split(/\s+/).slice(0, 2).map((word) => word[0]).join("").toUpperCase();
  return <span className="ipo-company-mark" title={source ? name : `${name} · Company logo unavailable`}>
    {source
      ? <img src={source} alt={`${name} logo`} width={48} height={48} loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailedSources(previous => [...previous, source])} />
      : <span aria-label={`${name} initials`}>{initials}</span>}
  </span>;
}

export function IpoResearchLink({ name, entries }: { name: string; entries: IpoDirectoryEntry[] }) {
  const entry = matchIpoDirectory(name, entries);
  return <a className="ipo-research-link" href={entry?.url ?? CHITTORGARH_DIRECTORY_URL} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer"
    aria-label={entry ? `View ${name} on Chittorgarh (new tab)` : `Browse Chittorgarh for ${name} (new tab)`}>
    <span>{entry ? "View on Chittorgarh" : "Browse Chittorgarh"}<small>{entry ? "Company details & IPO review" : "Exact IPO page not yet verified"}</small></span><ExternalLink size={16} />
  </a>;
}
