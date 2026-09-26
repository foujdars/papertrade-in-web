import type { Instrument } from './market';
import type { FnoUnderlying } from './fno';

export const TRADING_GROUPS = ['Nifty 50 stocks', 'F&O stocks', 'Indices', 'PSU bank stocks', 'Nifty 500 stocks'] as const;
export type TradingGroup = typeof TRADING_GROUPS[number];
export const TRADING_INDICES: Instrument[] = [
  { symbol: 'NIFTY', name: 'Nifty 50', instrumentKey: 'NSE_INDEX|Nifty 50', exchange: 'NSE', assetType: 'INDEX', categories: ['INDEX'], price: 0, change: 0 },
  { symbol: 'BANKNIFTY', name: 'Bank Nifty', instrumentKey: 'NSE_INDEX|Nifty Bank', exchange: 'NSE', assetType: 'INDEX', categories: ['INDEX'], price: 0, change: 0 },
  { symbol: 'SENSEX', name: 'Sensex', instrumentKey: 'BSE_INDEX|SENSEX', exchange: 'BSE', assetType: 'INDEX', categories: ['INDEX'], price: 0, change: 0 },
];
export function tradingUniverse(group: TradingGroup, instruments: Instrument[], underlyings: FnoUnderlying[] = []) {
  if (group === 'Indices') return TRADING_INDICES;
  const category = ({ 'Nifty 50 stocks': 'NIFTY 50', 'PSU bank stocks': 'NIFTY PSU BANK', 'Nifty 500 stocks': 'NIFTY 500' } as Partial<Record<TradingGroup, string>>)[group];
  const eligible = new Set(underlyings.filter((item) => item.underlyingType === 'EQUITY').map((item) => item.instrumentKey));
  return [...new Map(instruments.filter((item) => /^NSE_EQ\|INE[A-Z0-9]+$/.test(item.instrumentKey) &&
    (group === 'F&O stocks' ? eligible.has(item.instrumentKey) : item.categories.includes(category!)))
    .map((item) => [item.instrumentKey, item])).values()];
}
export function isTradingInstrument(key: string) {
  return /^NSE_EQ\|INE[A-Z0-9]+$/.test(key) || TRADING_INDICES.some((item) => item.instrumentKey === key);
}
