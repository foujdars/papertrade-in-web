type Commodity = { symbol: string; instrumentKey?: string; underlyingSymbol?: string };
const priority = ['CRUDEOILM', 'CRUDEOIL', 'NATGASMINI', 'NATURALGASMINI', 'NATURALGAS', 'GOLDM', 'GOLD', 'SILVERM', 'SILVER', 'COPPER', 'ALUMINIUM', 'ALUMINI', 'ZINC', 'ZINCMINI', 'LEAD', 'NICKEL', 'ELECDMBL'];
export const commodityRoot = (item: Commodity) => (item.underlyingSymbol || item.symbol.replace(/-\d{8}$/, '')).toUpperCase();
export function commodityLogo(item: Commodity): string | null {
  if (!item.instrumentKey?.startsWith('MCX_FO|')) return null;
  const root = commodityRoot(item);
  const type = /^GOLD/.test(root) ? 'gold' : /^SILVER/.test(root) ? 'silver' : /^CRUDE/.test(root) ? 'oil' : /GAS/.test(root) ? 'gas' : /^COPPER/.test(root) ? 'copper' : /^ALUM/.test(root) ? 'aluminium' : /^ELEC/.test(root) ? 'electricity' : /^(COTTON|KAPAS|CARDAMOM|MENTHA|CPO|CASTOR|RUBBER)/.test(root) ? 'agriculture' : 'metal';
  return `/commodities/${type}.svg`;
}
export function compareCommodityPriority(a: Commodity, b: Commodity) {
  const rank = (item: Commodity) => { const i = priority.indexOf(commodityRoot(item)); return i < 0 ? priority.length : i; };
  return rank(a) - rank(b) || a.symbol.localeCompare(b.symbol);
}
/** Observed contract volume takes precedence; absent quotes use an editorial order. */
export function rankCommodityRows<T extends Commodity>(rows: T[], volume: (item: T) => number): T[] {
  const usable = (item: T) => { const n = volume(item); return Number.isFinite(n) && n > 0 ? n : 0; };
  return rows.slice().sort((a, b) => usable(b) - usable(a) || compareCommodityPriority(a, b));
}
