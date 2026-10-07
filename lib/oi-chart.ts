import { oiSummary } from './home-derivatives.ts';

type Strike = ReturnType<typeof oiSummary>['strikes'][number];

/** Levels always use the full expiry chain, including strikes outside the chart. */
export function oiLevels(strikes: Strike[], spot: number | null) {
  const strongest = (side: 'call' | 'put') => {
    if (!strikes.length || strikes.some(row => row[side].oi === null)) return null;
    const ranked = [...strikes].sort((a, b) => b[side].oi! - a[side].oi! || (spot === null ? 0 : Math.abs(a.strike - spot) - Math.abs(b.strike - spot)) || a.strike - b.strike);
    return ranked[0][side].oi! > 0 ? ranked[0].strike : null;
  };
  const support = strongest('put'), resistance = strongest('call');
  let maxPain: number | null = null;
  if (support !== null && resistance !== null) {
    // Total intrinsic settlement payout. Prefix sums keep this linear in chain size.
    let callBelow = 0, callStrikeBelow = 0;
    let putAbove = strikes.reduce((sum, row) => sum + row.put.oi!, 0);
    let putStrikeAbove = strikes.reduce((sum, row) => sum + row.strike * row.put.oi!, 0);
    let best = Infinity;
    for (const row of strikes) {
      putAbove -= row.put.oi!; putStrikeAbove -= row.strike * row.put.oi!;
      const payout = row.strike * callBelow - callStrikeBelow + putStrikeAbove - row.strike * putAbove;
      if (payout < best || payout === best && spot !== null && Math.abs(row.strike - spot) < Math.abs(maxPain! - spot)) { best = payout; maxPain = row.strike; }
      callBelow += row.call.oi!; callStrikeBelow += row.strike * row.call.oi!;
    }
  }
  return { support, resistance, maxPain };
}

export function nearbyOiStrikes(strikes: Strike[], spot: number | null, count = 11) {
  if (strikes.length <= count) return strikes;
  const target = spot ?? strikes[Math.floor(strikes.length / 2)].strike;
  const atm = strikes.reduce((best, row, i) => Math.abs(row.strike - target) < Math.abs(strikes[best].strike - target) ? i : best, 0);
  const start = Math.max(0, Math.min(strikes.length - count, atm - Math.floor(count / 2)));
  return strikes.slice(start, start + count);
}

export function oiChartScale(values: (number | null)[]) {
  const valid = values.filter((v): v is number => v !== null && Number.isFinite(v));
  const low = Math.min(0, ...valid), high = Math.max(0, ...valid);
  const rough = (high - low || 1) / 4, power = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 5, 10].find(v => v * power >= rough)! * power;
  const min = Math.floor(low / step) * step, max = high === 0 && low === 0 ? step : Math.ceil(high / step) * step;
  const ticks = Array.from({ length: Math.round((max - min) / step) + 1 }, (_, i) => min + i * step);
  return { min, max, ticks };
}
