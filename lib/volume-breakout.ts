export const VOLUME_SMA_PERIOD = 20;
export const VOLUME_BREAKOUT_MULTIPLIER = 5;
export const VOLUME_BREAKOUT_LIMIT = 15;

export type HistoricalVolumePoint = {
  date: string;
  volume: number;
};

export type VolumeBreakoutCandidate = {
  symbol: string;
  name: string;
  instrumentKey: string;
  lastPrice: number;
  previousClose: number;
  todayVolume: number;
  sessionDate: string;
};

export type VolumeBreakoutRow = VolumeBreakoutCandidate & {
  netChange: number;
  changePercent: number;
  sma20Volume: number;
  volumeMultiple: number;
};

export type OpenHighCandidate = {
  symbol: string;
  name: string;
  instrumentKey: string;
  lastPrice: number;
  previousClose: number;
  open: number;
  high: number;
  low: number;
  volume: number;
};

export type OpenHighRow = OpenHighCandidate & {
  netChange: number;
  changePercent: number;
};

export function rankOpenHighStocks(candidates: OpenHighCandidate[], limit = 10): OpenHighRow[] {
  return candidates.flatMap((candidate) => {
    if (![candidate.lastPrice, candidate.previousClose, candidate.open, candidate.high].every(Number.isFinite)) return [];
    const equalityTolerance = Math.max(0.0001, Math.abs(candidate.high) * 1e-8);
    if (Math.abs(candidate.open - candidate.high) > equalityTolerance) return [];
    const netChange = candidate.lastPrice - candidate.previousClose;
    return [{
      ...candidate,
      netChange,
      changePercent: candidate.previousClose > 0 ? (netChange / candidate.previousClose) * 100 : 0,
    }];
  })
    .sort((a, b) => a.changePercent - b.changePercent || b.volume - a.volume || a.symbol.localeCompare(b.symbol))
    .slice(0, Math.max(0, limit));
}

export function rankVolumeBreakouts(
  candidates: VolumeBreakoutCandidate[],
  historyBySymbol: Map<string, HistoricalVolumePoint[]>,
  limit = VOLUME_BREAKOUT_LIMIT,
): VolumeBreakoutRow[] {
  return candidates.flatMap((candidate) => {
    if (!Number.isFinite(candidate.todayVolume) || candidate.todayVolume <= 0) return [];
    const previousSessions = (historyBySymbol.get(candidate.symbol) ?? [])
      .filter((point) => point.date < candidate.sessionDate && Number.isFinite(point.volume) && point.volume >= 0)
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, VOLUME_SMA_PERIOD - 1);
    if (previousSessions.length !== VOLUME_SMA_PERIOD - 1) return [];

    // The scanner expression uses the current daily bar inside SMA(volume, 20).
    const sma20Volume = (candidate.todayVolume + previousSessions.reduce((sum, point) => sum + point.volume, 0)) / VOLUME_SMA_PERIOD;
    const volumeMultiple = sma20Volume > 0 ? candidate.todayVolume / sma20Volume : 0;
    if (!(candidate.todayVolume > sma20Volume * VOLUME_BREAKOUT_MULTIPLIER)) return [];
    const netChange = candidate.lastPrice - candidate.previousClose;
    return [{
      ...candidate,
      netChange,
      changePercent: candidate.previousClose > 0 ? (netChange / candidate.previousClose) * 100 : 0,
      sma20Volume,
      volumeMultiple,
    }];
  })
    .sort((a, b) => b.changePercent - a.changePercent || b.volumeMultiple - a.volumeMultiple || b.todayVolume - a.todayVolume)
    .slice(0, Math.max(0, limit));
}
