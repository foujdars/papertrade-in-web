import type { Candle } from './market';

export function averageCandleVolume(candles: Candle[]) {
  let total = 0, count = 0;
  for (const candle of candles) if (Number.isFinite(candle.volume) && candle.volume > 0) { total += candle.volume; count++; }
  return count ? total / count : 1;
}
function volumeTint(color: string, strength: number) {
  const weight = Math.max(.28, Math.min(1, Number.isFinite(strength) ? strength : 1));
  return '#' + [1, 3, 5].map((start) => Math.round(parseInt(color.slice(start, start + 2), 16) * weight + 255 * (1 - weight)).toString(16).padStart(2, '0')).join('');
}
/** Tint from the candle direction, never from an already blended color string. */
export function desktopVolumeCandleColors(candle: Candle, averageVolume: number, colors: { up: string; down: string; wickUp: string; wickDown: string; borderUp: string; borderDown: string }) {
  const up = candle.close >= candle.open;
  const strength = averageVolume > 0 ? candle.volume / (averageVolume * 1.8) : 1;
  return {
    color: volumeTint(up ? colors.up : colors.down, strength),
    wickColor: volumeTint(up ? colors.wickUp : colors.wickDown, strength),
    borderColor: volumeTint(up ? colors.borderUp : colors.borderDown, strength),
  };
}
