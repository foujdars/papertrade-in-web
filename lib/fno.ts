import type { Instrument } from "@/lib/market";

export type FnoUnderlying = {
  symbol: string;
  name: string;
  instrumentKey: string;
  underlyingType: "INDEX" | "EQUITY";
  optionContracts: number;
  futureContracts: number;
};

export type OptionMarketData = {
  ltp: number;
  volume: number;
  oi: number;
  closePrice: number;
  bidPrice: number;
  bidQty: number;
  askPrice: number;
  askQty: number;
};

export type OptionGreeks = {
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
  iv: number;
  pop: number;
};

export type OptionContractSide = {
  instrumentKey: string;
  tradingSymbol: string;
  optionType: "CE" | "PE";
  lotSize: number;
  marketData: OptionMarketData;
  greeks: OptionGreeks;
};

export type OptionChainRow = {
  expiry: string;
  strikePrice: number;
  underlyingSpotPrice: number;
  pcr: number;
  call: OptionContractSide | null;
  put: OptionContractSide | null;
};

export function underlyingToInstrument(underlying: FnoUnderlying, price = 0): Instrument {
  return {
    symbol: underlying.symbol,
    name: underlying.name,
    exchange: "NSE",
    price,
    change: 0,
    instrumentKey: underlying.instrumentKey,
    categories: [],
    assetType: underlying.underlyingType === "INDEX" ? "INDEX" : "EQUITY",
  };
}

export function optionToInstrument(
  contract: OptionContractSide,
  row: OptionChainRow,
  underlying: FnoUnderlying,
): Instrument {
  return {
    symbol: contract.tradingSymbol,
    name: `${underlying.symbol} ${row.strikePrice} ${contract.optionType}`,
    exchange: "NSE",
    price: contract.marketData.ltp,
    change: contract.marketData.closePrice > 0
      ? ((contract.marketData.ltp - contract.marketData.closePrice) / contract.marketData.closePrice) * 100
      : 0,
    instrumentKey: contract.instrumentKey,
    categories: [],
    assetType: "OPTION",
    optionType: contract.optionType,
    strikePrice: row.strikePrice,
    expiry: row.expiry,
    lotSize: contract.lotSize,
    underlyingKey: underlying.instrumentKey,
    underlyingSymbol: underlying.symbol,
  };
}
