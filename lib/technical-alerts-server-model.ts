import { defaultTechnicalConfig, emptyTechnicalStore, technicalConfigError, technicalLimitError, type TechnicalConfig, type TechnicalRule, type TechnicalStore } from "./technical-alerts";
import { isSupportedNseInstrumentKey } from "./upstox";
import type { Instrument } from "./market";

export class TechnicalRequestError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
export type TechnicalCommand = { action: "save" | "pause" | "resume" | "delete"; id?: string; revision?: string; config?: TechnicalConfig; instrument?: Instrument };
/** Construct trusted server state field-by-field. Client timestamps/cursors/status never enter storage. */
export function applyTechnicalCommand(store: TechnicalStore, command: TechnicalCommand, now: number, newId: string): TechnicalStore {
  if (!command || !["save", "pause", "resume", "delete"].includes(command.action)) throw new TechnicalRequestError("Unknown alert action.");
  if (command.id !== undefined && !/^[\w-]{1,80}$/.test(command.id)) throw new TechnicalRequestError("Invalid alert ID.");
  const current = store.rules.find(r => r.id === command.id);
  if (command.id && (!current || current.revision !== command.revision)) throw new TechnicalRequestError("This alert changed. Refresh before editing.", 409);
  if (command.action !== "save" && !current) throw new TechnicalRequestError("Alert not found.", 404);
  let rule: TechnicalRule;
  if (command.action === "delete") return { ...store, rules: store.rules.filter(r => r.id !== command.id) };
  if (command.action === "save") {
    if (!command.config || !command.instrument) throw new TechnicalRequestError("Indicator settings and symbol are required.");
    const config = Object.fromEntries(Object.keys(defaultTechnicalConfig()).map(key => [key, command.config![key as keyof TechnicalConfig]])) as TechnicalConfig;
    const error = technicalConfigError(config); if (error) throw new TechnicalRequestError(error);
    const item = command.instrument;
    if (typeof item.instrumentKey !== "string" || !isSupportedNseInstrumentKey(item.instrumentKey) || typeof item.symbol !== "string" || !item.symbol.trim() || item.symbol.length > 100 || typeof item.name !== "string" || item.name.length > 200) throw new TechnicalRequestError("Invalid instrument.");
    if (["volume", "vwap"].includes(config.family) && (item.instrumentKey.startsWith("NSE_INDEX|") || item.assetType === "INDEX")) throw new TechnicalRequestError("Indices have no traded volume.");
    const instrument: Instrument = { symbol: item.symbol, name: item.name, instrumentKey: item.instrumentKey, exchange: "NSE", price: 0, change: 0, categories: [], ...(item.assetType && ["EQUITY", "INDEX", "OPTION", "FUTURE"].includes(item.assetType) ? { assetType: item.assetType } : {}) };
    rule = { ...config, delivery: "server", id: current?.id ?? newId, revision: newId, instrument, status: "active", createdAt: current?.createdAt ?? now, armedAt: now, expiresAt: now + config.days * 86400000 };
  } else {
    if (current!.expiresAt <= now || !["active", "paused"].includes(current!.status)) throw new TechnicalRequestError("Edit this completed or expired alert to rearm it.");
    const { lastBar: _lastBar, ...rest } = current!;
    rule = { ...rest, revision: newId, status: command.action === "pause" ? "paused" : "active", armedAt: now };
  }
  const limit = technicalLimitError(store.rules, rule); if (limit) throw new TechnicalRequestError(limit);
  return { ...store, rules: [rule, ...store.rules.filter(r => r.id !== rule.id)] };
}
export function readServerTechnicalStore(value: unknown): TechnicalStore {
  if (!value) return emptyTechnicalStore();
  const data = value as TechnicalStore;
  if (data.version !== 1 || !Array.isArray(data.rules) || !Array.isArray(data.events)) throw new Error("Invalid saved server alerts");
  return data;
}
