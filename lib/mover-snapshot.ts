import { inNseCashSession, istDay, istStamp } from "./india-pulse.ts";
import { MOVER_TABS, presentMovers, type MoverSnapshot, type MoverTab, type Quote } from "./market-movers.ts";

export type MoverVerification = { quotes: Map<string, Quote>; warning: string | null };
type Dependencies = {
  scan: (tab: MoverTab) => Promise<Quote[]>;
  verify: (rows: Quote[]) => Promise<MoverVerification>;
  now?: () => number;
  verificationTimeoutMs?: number;
};
type Entry = { rows: Quote[]; fetchedAt: number; warning: string | null };

/** Quote timestamps, rather than the HTTP retrieval time, determine data age. */
export function moverQuoteDelayed(quoteAt: string | null | undefined, now = Date.now()) {
  if (!quoteAt) return true;
  const stamp = Date.parse(quoteAt);
  if (!Number.isFinite(stamp) || stamp > now + 60_000) return true;
  if (inNseCashSession(now)) return now - stamp > 60_000;
  // A Friday closing quote is a valid closed-market snapshot on the weekend.
  for (let days = 0; days < 10; days += 1) {
    const day = istDay(now - days * 86_400_000);
    const close = istStamp(day, 15, 30);
    if (close > now || !inNseCashSession(close)) continue;
    return stamp < close - 5 * 60_000;
  }
  return true;
}

/** Shared by Home, expanded movers and search so they use the same NSE snapshot. */
export function createMoverService(dependencies: Dependencies) {
  const entries = new Map<MoverTab, Entry>();
  const failures = new Map<MoverTab, number>();
  const pending = new Map<string, Promise<MoverSnapshot>>();
  const generations = new Map<MoverTab, number>();
  let nextGeneration = 0;
  const clock = dependencies.now ?? Date.now;

  async function load(summary: boolean, refresh: boolean): Promise<MoverSnapshot> {
    const now = clock();
    const tabs = MOVER_TABS.map(tab => tab.id).filter(tab => !summary || tab === "gainers" || tab === "losers" || tab === "high52");
    const marketOpen = inNseCashSession(now);
    const ttl = marketOpen ? 10_000 : 60_000;
    const needed = tabs.filter(tab => {
      const entry = entries.get(tab);
      return !entry || failures.has(tab) || now - entry.fetchedAt >= (refresh ? 2_000 : ttl);
    });
    if (needed.length) {
      // Summary and expanded requests can overlap. Only the latest request for
      // each category may replace its data, checked time or failure status.
      const requested = new Map(needed.map(tab => {
        const generation = ++nextGeneration;
        generations.set(tab, generation);
        return [tab, generation] as const;
      }));
      const scanned = await Promise.allSettled(needed.map(tab => dependencies.scan(tab)));
      const unique = new Map<string, Quote>();
      scanned.forEach((result, index) => {
        const tab = needed[index];
        if (generations.get(tab) !== requested.get(tab) || result.status !== "fulfilled") return;
        for (const row of result.value) unique.set(row.symbol, row);
      });
      let verification: MoverVerification = { quotes: new Map(), warning: null };
      if (unique.size) {
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
          verification = await Promise.race([
            dependencies.verify([...unique.values()]),
            new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("Quote verification timed out.")), dependencies.verificationTimeoutMs ?? 5_500); }),
          ]);
        } catch { verification.warning = "Broker quote verification failed or timed out. Scanner prices may be delayed."; }
        finally { if (timer !== undefined) clearTimeout(timer); }
      }
      scanned.forEach((result, index) => {
        const tab = needed[index];
        if (generations.get(tab) !== requested.get(tab)) return;
        if (result.status === "rejected") { failures.set(tab, clock()); return; }
        failures.delete(tab);
        entries.set(tab, {
          rows: result.value.map(row => verification.quotes.get(row.symbol) ?? row),
          fetchedAt: clock(), warning: verification.warning,
        });
      });
    }

    const lists: MoverSnapshot["lists"] = {};
    const failedTabs: MoverTab[] = [];
    const staleTabs: MoverTab[] = [];
    const times: number[] = [];
    const warnings = new Set<string>();
    let availableTabs = 0;
    for (const tab of tabs) {
      const failed = failures.has(tab);
      if (failed) failedTabs.push(tab);
      const entry = entries.get(tab);
      if (!entry || (failed && clock() - entry.fetchedAt > 10 * 60_000)) {
        lists[tab] = [];
        continue;
      }
      availableTabs += 1;
      times.push(entry.fetchedAt);
      if (failed) staleTabs.push(tab);
      if (entry.warning) warnings.add(entry.warning);
      lists[tab] = presentMovers(tab, entry.rows.map(row => ({
        ...row, delayed: row.source !== "upstox" || moverQuoteDelayed(row.quoteAt, clock()),
      })));
    }
    const rows = Object.values(lists).flat();
    const brokerRows = rows.filter(row => row.source === "upstox").length;
    const delayedRows = rows.filter(row => row.delayed).length;
    const source = brokerRows && brokerRows === rows.length ? "upstox" : brokerRows ? "mixed" : "tradingview";
    const status = !availableTabs ? "unavailable"
      : failedTabs.length === tabs.length ? "stale"
      : failedTabs.length || source === "mixed" || (delayedRows > 0 && delayedRows < rows.length) ? "partial"
      : rows.length && !delayedRows ? "verified" : "delayed";
    if (failedTabs.length) warnings.add(staleTabs.length ? "Some lists could not refresh. Their last successful snapshot is shown." : "Some lists could not be loaded. Please retry.");
    if (source !== "upstox") warnings.add("Scanner prices may be delayed; their exchange quote time is unavailable.");
    if (source === "upstox" && delayedRows) warnings.add("Some broker quote timestamps are old or unavailable. Check each quote time.");
    return {
      ok: availableTabs > 0, lists, fetchedAt: times.length ? new Date(Math.min(...times)).toISOString() : null,
      marketOpen, status, source, warning: warnings.size ? [...warnings].join(" ") : null, failedTabs, staleTabs,
    };
  }

  return function getMovers(summary = false, refresh = false) {
    const key = summary ? "summary" : "all";
    const flight = pending.get(key);
    if (flight) return flight;
    const request = load(summary, refresh).finally(() => pending.delete(key));
    pending.set(key, request);
    return request;
  };
}
