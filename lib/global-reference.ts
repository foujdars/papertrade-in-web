import type { Instrument } from "./market";

const stocks = [
  ["NVDA", "NVIDIA"], ["AAPL", "Apple"], ["MSFT", "Microsoft"], ["GOOGL", "Alphabet"],
  ["AMZN", "Amazon"], ["META", "Meta Platforms"], ["TSLA", "Tesla"], ["AVGO", "Broadcom"],
  ["TSM", "Taiwan Semiconductor ADR"], ["SPY", "SPDR S&P 500 ETF"], ["QQQ", "Invesco QQQ ETF"],
  ["AMD", "Advanced Micro Devices"], ["PLTR", "Palantir"], ["COIN", "Coinbase"],
  ["MSTR", "Strategy"], ["HOOD", "Robinhood"], ["INTC", "Intel"], ["MU", "Micron Technology"],
] as const;
const crypto = [
  ["BTC", "Bitcoin"], ["ETH", "Ethereum"], ["SOL", "Solana"], ["XRP", "XRP"],
  ["DOGE", "Dogecoin"], ["ADA", "Cardano"], ["LINK", "Chainlink"], ["AVAX", "Avalanche"],
  ["SUI", "Sui"], ["LTC", "Litecoin"], ["BCH", "Bitcoin Cash"], ["DOT", "Polkadot"],
] as const;

function referenceInstrument(symbol: string, name: string, category: string): Instrument {
  return {
    symbol, name, instrumentKey: `REF|${symbol}`, exchange: "GLOBAL", price: 0, change: 0,
    categories: ["GLOBAL", category],
    assetType: category === "US_MARKET" ? "EQUITY" : undefined,
  };
}

export const GLOBAL_REFERENCE_INSTRUMENTS: Instrument[] = [
  ...stocks.map(([symbol, name]) => referenceInstrument(symbol, name, "US_MARKET")),
  ...crypto.map(([symbol, name]) => referenceInstrument(`${symbol}-USD`, `${name} spot`, "CRYPTO")),
  referenceInstrument("XAUUSD", "Gold spot", "GOLD"),
];
export const isGlobalReferenceKey = (value?: string) => Boolean(value?.startsWith("REF|"));
export const globalReferenceInstrument = (symbol: string) =>
  GLOBAL_REFERENCE_INSTRUMENTS.find((instrument) => instrument.symbol === symbol);
