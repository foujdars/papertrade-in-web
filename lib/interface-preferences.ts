import { DEFAULT_PNL_SCOPE, validPnlDate, type PnlScope } from "./pnl-analytics.ts";
export const PNL_SCOPE_KEY = "papertrade-pnl-scope-v1";
export const PNL_BREAKDOWN_KEY = "papertrade-pnl-breakdown-v1";
export const IPO_VIEW_KEY = "papertrade-ipo-view-v1";
export function readPreference(key: string): unknown { try { return JSON.parse(localStorage.getItem(key) ?? "null"); } catch { return null; } }
export function writePreference(key: string, value: unknown) { try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; } }
export function normalizePnlScope(input: unknown): PnlScope {
  const v = input && typeof input === "object" ? input as Partial<PnlScope> : {};
  const validCustom = validPnlDate(v.start ?? "") && validPnlDate(v.end ?? "") && v.start! <= v.end!;
  return { ...DEFAULT_PNL_SCOPE, period: v.period === "custom" ? validCustom ? "custom" : "all" : v.period === "month" || v.period === "30d" ? v.period : "all", asset: v.asset === "stocks" || v.asset === "fno" ? v.asset : "all", product: v.product === "INTRADAY" || v.product === "DELIVERY" ? v.product : "all", start: validPnlDate(v.start ?? "") ? v.start! : "", end: validPnlDate(v.end ?? "") ? v.end! : "" };
}
export const readPnlScope = () => normalizePnlScope(readPreference(PNL_SCOPE_KEY));
