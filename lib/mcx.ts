import type { Instrument } from "./market.ts";
import { getNseMarketStatus, nseDate, nseSquareOffMinute, type NseSession } from "./market-hours.ts";

export const isMcx = (instrument: { instrumentKey?: string }) => Boolean(instrument.instrumentKey?.startsWith("MCX_FO|"));
const lateAgri = new Set(["COTTON", "COTTONCNDY", "COTTONOIL", "KAPAS"]);
const agri = new Set([...lateAgri, "MENTHAOIL", "CARDAMOM", "CPO", "CASTORSEED", "RUBBER"]);

export type McxMasterRow = { segment?: string; instrument_type?: string; instrument_key?: string; trading_symbol?: string; name?: string; underlying_symbol?: string; underlying_key?: string; expiry?: number; last_trading_date?: number; lot_size?: number; qty_multiplier?: number };
export function mcxInstruments(master: McxMasterRow[], now = new Date()): Instrument[] {
  const day = nseDate(now);
  return master.flatMap(row => {
    if (row.segment !== "MCX_FO" || row.instrument_type !== "FUT" || !/^MCX_FO\|\d+$/.test(row.instrument_key ?? "")) return [];
    const expiryMs = row.last_trading_date ?? row.expiry;
    if (!expiryMs || !Number.isFinite(expiryMs)) return [];
    const expiry = nseDate(new Date(expiryMs));
    // Quantity is expressed in quoted-price units, as in the existing futures engine.
    // MCX qty_multiplier is units per lot (e.g. GOLD 100, SILVER 30).
    const lotSize = row.qty_multiplier ?? row.lot_size;
    if (expiry < day || !Number.isSafeInteger(lotSize) || !lotSize || lotSize <= 0) return [];
    const root = row.underlying_symbol ?? row.name ?? "";
    const symbol = `${root}-${expiry.replaceAll("-", "")}`;
    return [{ symbol, name: row.trading_symbol ?? `${root} ${expiry}`, exchange: "MCX" as const,
      instrumentKey: row.instrument_key!, price: 0, change: 0, assetType: "FUTURE" as const,
      expiry, lotSize, underlyingSymbol: root, underlyingKey: row.underlying_key,
      categories: ["MCX", "COMMODITY", agri.has(root) ? "AGRI" : "NON_AGRI", ...(lateAgri.has(root) ? ["LATE_AGRI"] : [])] }];
  }).sort((a, b) => a.underlyingSymbol!.localeCompare(b.underlyingSymbol!) || a.expiry!.localeCompare(b.expiry!));
}

/** Dated exchange windows handle DST, holidays and special sessions. Commodity
 * caps follow MCX/TRD/550/2026; no NSE calendar or guessed-open fallback. */
export function mcxContractSession(instrument: Pick<Instrument, "categories" | "underlyingSymbol">, session: NseSession | null): NseSession | null {
  if (!session) return null;
  const root = instrument.underlyingSymbol ?? "";
  const cap = lateAgri.has(root) || instrument.categories.includes("LATE_AGRI") ? "21:00" : agri.has(root) || instrument.categories.includes("AGRI") ? "17:00" : null;
  if (!cap) return session;
  const end = Date.parse(`${session.date}T${cap}:00+05:30`);
  return { ...session, sessions: session.sessions.map(s => ({ start: s.start, end: Math.min(s.end, end) })).filter(s => s.end > s.start) };
}
export function indianInstrumentStatus(instrument: Pick<Instrument, "instrumentKey" | "categories" | "underlyingSymbol">, date: Date, nse: NseSession | null, mcx: NseSession | null) {
  if (!isMcx(instrument)) return getNseMarketStatus(date, nse);
  const status = getNseMarketStatus(date, mcxContractSession(instrument, mcx));
  return { ...status, message: status.isOpen ? "MCX is open · Paper trading enabled" : !mcx || mcx.status === "UNAVAILABLE" ? "Checking MCX session · Trading temporarily disabled" : "MCX session closed · Trading disabled" };
}
export function indianSquareOffMinute(instrument: Pick<Instrument, "instrumentKey" | "categories" | "underlyingSymbol">, date: Date, nse: NseSession | null, mcx: NseSession | null) {
  const session = isMcx(instrument) ? mcxContractSession(instrument, mcx) : nse;
  return isMcx(instrument) && !session?.sessions.length ? 24 * 60 : nseSquareOffMinute(date, session);
}
