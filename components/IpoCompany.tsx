"use client";

import { useEffect, useState } from "react";
import { ExternalLink } from "lucide-react";
import { CHITTORGARH_DIRECTORY_URL, matchIpoDirectory, safeIpoLogo, type IpoDirectoryEntry } from "@/lib/ipo-directory";

export function useIpoDirectory() {
  const [entries, setEntries] = useState<IpoDirectoryEntry[]>([]);
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
  return entries;
}

export function IpoCompanyLogo({ name, entries }: { name: string; entries: IpoDirectoryEntry[] }) {
  const entry = matchIpoDirectory(name, entries);
  const source = entry?.logoUrl ? safeIpoLogo(entry.logoUrl) : undefined;
  const [failedSource, setFailedSource] = useState("");
  const initials = name.replace(/\b(?:ipo|limited|ltd)\b/gi, "").trim().split(/\s+/).slice(0, 2).map((word) => word[0]).join("").toUpperCase();
  return <span className="ipo-company-mark" title={source && source !== failedSource ? name : `${name} · Company logo unavailable`}>
    {source && source !== failedSource
      ? <img src={source} alt={`${name} logo`} width={48} height={48} loading="lazy" decoding="async" referrerPolicy="no-referrer" crossOrigin="anonymous" onError={() => setFailedSource(source)} />
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
