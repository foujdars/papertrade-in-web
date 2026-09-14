export const JOURNAL_STORAGE_KEY = "papertrade-journal-v1";
export const CLOUD_CHANGE_EVENT = "papertrade-cloud-change";

/** Keep independent entries and prefer the latest edit of the same trade. */
export function mergeJournalCopies(local: string | null, cloud: string | null): string {
  const parse = (text: string | null): Record<string, Record<string, unknown>> => {
    try {
      const value = JSON.parse(text ?? "{}");
      if (!value || typeof value !== "object" || Array.isArray(value)) return {};
      return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry && typeof entry === "object" && !Array.isArray(entry))) as Record<string, Record<string, unknown>>;
    } catch { return {}; }
  };
  const merged = parse(cloud);
  for (const [id, entry] of Object.entries(parse(local))) {
    if (!merged[id] || Number(entry.updatedAt ?? 0) > Number(merged[id].updatedAt ?? 0)) merged[id] = entry;
  }
  return JSON.stringify(merged);
}
