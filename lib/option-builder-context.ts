import { deltaOptionRoot } from "./global-contracts.ts";
import { isTokenisedDelta } from "./delta-option-list.ts";
import type { Instrument } from "./market";
import type { SpreadMarket } from "./spread-chain-client";

export type BuilderContext = {
  initialMarket: SpreadMarket;
  initialRoot: string;
  initialExpiry: string;
  initialContract?: string;
  initialStrike?: number;
  initialKind?: "CE" | "PE";
};

export function optionBuilderContext(option: Instrument): BuilderContext {
  const delta = option.exchange === "DELTA" ? deltaOptionRoot(option.symbol) : null;
  const metal = option.exchange === "MCX" || option.instrumentKey.startsWith("MCX_FO|");
  const [kind, , strike, date] = delta ? option.symbol.split("-") : [];
  const symbolDate = date ? `20${date.slice(4)}-${date.slice(2,4)}-${date.slice(0,2)}` : "";
  const expiry = option.expiry ?? symbolDate;
  return {
    initialMarket: delta ? (isTokenisedDelta(option) ? "tokens" : "crypto") : metal ? "metals" : "india",
    initialRoot: delta ?? (metal ? option.underlyingSymbol : option.underlyingKey ?? option.underlyingSymbol) ?? "",
    initialExpiry: metal && option.underlyingKey?.startsWith("MCX_FO|") ? `${expiry.slice(0,10)}~${option.underlyingKey}` : expiry,
    initialContract: delta ? option.symbol : option.instrumentKey,
    initialStrike: option.strikePrice ?? (strike ? Number(strike) : undefined),
    initialKind: option.optionType ?? (kind === "C" ? "CE" : kind === "P" ? "PE" : undefined),
  };
}
