export const SECTORS = [
  { id: "bank", label: "Bank", symbol: "^NSEBANK", watch: "bank", chart: "BANKNIFTY" },
  { id: "psu", label: "PSU Bank", symbol: "^CNXPSUBANK", watch: "psu" },
  { id: "it", label: "IT", symbol: "^CNXIT", watch: "it" },
  { id: "auto", label: "Auto", symbol: "^CNXAUTO", watch: "auto" },
  { id: "pharma", label: "Pharma", symbol: "^CNXPHARMA", watch: "pharma" },
  { id: "fmcg", label: "FMCG", symbol: "^CNXFMCG", watch: "fmcg" },
  { id: "metal", label: "Metal", symbol: "^CNXMETAL", watch: "metal" },
  { id: "energy", label: "Energy", symbol: "^CNXENERGY", watch: "energy" },
  { id: "realty", label: "Realty", symbol: "^CNXREALTY" },
  { id: "infra", label: "Infra", symbol: "^CNXINFRA" },
  { id: "media", label: "Media", symbol: "^CNXMEDIA" },
  { id: "pse", label: "PSE", symbol: "^CNXPSE" },
  { id: "consumption", label: "Consumption", symbol: "^CNXCONSUM" },
  { id: "commodities", label: "Commodities", symbol: "^CNXCMDT" },
  { id: "services", label: "Services", symbol: "^CNXSERVICE" },
  { id: "mnc", label: "MNC", symbol: "^CNXMNC" },
] as const;

export type SectorId = (typeof SECTORS)[number]["id"];

export type SectorTile = {
  id: SectorId;
  label: string;
  symbol: string;
  watch: string | null;
  chart: string | null;
  price: number;
  change: number;
};

export function sectorChartUrl(symbol: string) {
  return `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=5d`;
}

/** Session change only. A 5-day chart previous close is not today's move. */
export function sectorQuote(payload: unknown): { price: number; change: number } | null {
  const meta = (payload as { chart?: { result?: Array<{ meta?: { regularMarketPrice?: unknown; regularMarketChangePercent?: unknown } }> } })?.chart?.result?.[0]?.meta;
  const price = Number(meta?.regularMarketPrice);
  const change = Number(meta?.regularMarketChangePercent);
  if (!Number.isFinite(price) || !Number.isFinite(change)) return null;
  return { price, change };
}

export function heatLevel(change: number) {
  if (change >= 1.5) return 3;
  if (change >= 0.6) return 2;
  if (change > 0.05) return 1;
  if (change <= -1.5) return -3;
  if (change <= -0.6) return -2;
  if (change < -0.05) return -1;
  return 0;
}
