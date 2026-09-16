import type { Candle } from "./market";

export type SmcKind = "FVG" | "OB" | "Breaker" | "BOS / BMS" | "CHoCH" | "SMS / MSS" | "Sweep" | "EQH" | "EQL";
export type SmcMark = {
  id: string; kind: SmcKind; direction: "bullish" | "bearish";
  origin: number; confirmed: number; end?: number; low: number; high: number;
  status: "active" | "touched" | "filled" | "invalidated" | "confirmed";
  reason: string;
};
export const SMC_LESSONS: Record<SmcKind, string> = {
  "FVG": "Fair value gap: a three-candle imbalance. Bullish when candle 3's low is above candle 1's high; bearish is the reverse. Marked only after candle 3 closes. Touch is a retest; reaching the far edge fills the gap. A gap is not a promise that price will return.",
  "OB": "Order-block candidate: the last opposite-colour candle within 12 bars before a confirmed swing break. The full candle range is used. It is identified at the break, not at the earlier candle. A close beyond its far edge invalidates it. Candles alone cannot prove institutional orders.",
  "Breaker": "Breaker candidate: an invalidated order-block zone, now watched in the opposite direction. This simplified teaching rule does not require a preceding liquidity sweep. A later retest marks it touched; a close beyond the opposite edge invalidates it.",
  "BOS / BMS": "Break of structure / break of market structure: a close beyond an unbroken confirmed swing in the established direction. The first break establishes direction. Swings require 3 candles on each side, so confirmation is delayed by 3 bars. Wick-only breaks do not qualify.",
  "CHoCH": "Change of character: the first confirmed swing break against the current structural direction. It warns of a possible change, not a confirmed profitable reversal. This learner updates direction on that break.",
  "SMS / MSS": "Structure / market-structure shift: here, a CHoCH with displacement (break candle body at least 1.5 times the prior 14-bar average true range). Naming varies among SMC educators; this is the learner's explicit convention, not a universal definition.",
  "Sweep": "Liquidity-sweep candidate: price wicks beyond a confirmed swing but closes back inside it. Each swing is marked once. This describes price behaviour; it cannot establish intent or prove a stop hunt.",
  "EQH": "Equal highs: successive confirmed swing highs within 0.1 times the prior 14-bar average true range. They can suggest a visible liquidity reference, but do not show actual resting orders.",
  "EQL": "Equal lows: successive confirmed swing lows within 0.1 times the prior 14-bar average true range. Use the marked tolerance, not an assumption that the two prices are identical.",
};

type Swing = { index: number; price: number; broken: boolean; swept: boolean };
const zoneKinds = new Set<SmcKind>(["FVG", "OB", "Breaker"]);
export const isSmcZone = (mark: SmcMark) => zoneKinds.has(mark.kind);

/** Original deterministic OHLC heuristics. Input must contain ONLY closed/revealed bars. */
export function analyzeSmc(input: readonly Candle[], sameSessionOnly = false) {
  const bars = input.filter(b => [b.time, b.open, b.high, b.low, b.close].every(Number.isFinite) && b.high >= b.low);
  const marks: SmcMark[] = [];
  let high: Swing | undefined;
  let low: Swing | undefined;
  let direction = 0;
  const atr: number[] = [];
  const ranges: number[] = [];
  const date = (time: number) => Math.floor((time + 19800) / 86400);
  const add = (kind: SmcKind, side: number, origin: number, confirmed: number, bottom: number, top: number, reason: string): SmcMark => {
    const mark: SmcMark = { id: `${kind}:${confirmed}:${origin}:${side}`, kind, direction: side > 0 ? "bullish" : "bearish", origin, confirmed, low: bottom, high: top, status: zoneKinds.has(kind) ? "active" : "confirmed", reason };
    marks.push(mark);
    return mark;
  };
  for (let i = 0; i < bars.length; i++) {
    const b = bars[i];
    const priorClose = bars[i - 1]?.close ?? b.open;
    ranges.push(Math.max(b.high - b.low, Math.abs(b.high - priorClose), Math.abs(b.low - priorClose)));
    atr.push(ranges.slice(Math.max(0, i - 13), i + 1).reduce((a, v) => a + v, 0) / Math.min(i + 1, 14));
    // Advance existing zones before creating anything on this bar.
    for (const z of marks.filter(m => isSmcZone(m) && !m.end)) {
      const bull = z.direction === "bullish";
      const touches = b.low <= z.high && b.high >= z.low;
      const filled = bull ? b.low <= z.low : b.high >= z.high;
      const invalid = bull ? b.close < z.low : b.close > z.high;
      if (z.kind === "FVG" && filled) { z.status = "filled"; z.end = b.time; }
      else if (z.kind !== "FVG" && invalid) {
        z.status = "invalidated"; z.end = b.time;
        if (z.kind === "OB") add("Breaker", bull ? -1 : 1, z.origin, b.time, z.low, z.high, `The ${z.direction} OB at ${z.low.toFixed(2)}–${z.high.toFixed(2)} was invalidated by a close at ${b.close.toFixed(2)}. Watch it as an opposite-direction breaker candidate.`);
      } else if (touches) z.status = "touched";
    }

    // A pivot is available ONLY when its three right-hand candles have closed.
    const p = i - 3;
    if (p >= 3) {
      const pivot = bars[p];
      const neighbours = bars.slice(p - 3, p + 4).filter((_, k) => k !== 3);
      for (const side of [1, -1]) {
        const isHigh = side === 1;
        if (!neighbours.every(n => isHigh ? pivot.high > n.high : pivot.low < n.low)) continue;
        const price = isHigh ? pivot.high : pivot.low;
        const previous = isHigh ? high : low;
        const tolerance = (atr[i - 1] ?? 0) * .1;
        if (previous && Math.abs(previous.price - price) <= tolerance) {
          add(isHigh ? "EQH" : "EQL", isHigh ? -1 : 1, bars[previous.index].time, b.time, Math.min(price, previous.price), Math.max(price, previous.price), `Two confirmed swing ${isHigh ? "highs" : "lows"} are within ${tolerance.toFixed(2)} (0.1 × prior ATR). The second swing became known only after 3 further bars closed.`);
        }
        const swing = { index: p, price, broken: false, swept: false };
        if (isHigh) high = swing; else low = swing;
      }
    }
    for (const side of [1, -1]) {
      const swing = side === 1 ? high : low;
      if (!swing || swing.broken) continue;
      const broken = side === 1 ? b.close > swing.price : b.close < swing.price;
      if (broken) {
        const changed = direction !== 0 && direction !== side;
        const displaced = i >= 14 && Math.abs(b.close - b.open) >= 1.5 * atr[i - 1];
        const kind = changed ? (displaced ? "SMS / MSS" : "CHoCH") : "BOS / BMS";
        add(kind, side, bars[swing.index].time, b.time, swing.price, swing.price,
          `Close ${b.close.toFixed(2)} broke the confirmed swing at ${swing.price.toFixed(2)}. ${changed ? "This opposes the previous structural direction." : direction === 0 ? "This is the first direction-establishing break in the loaded history." : "This continues the previous structural direction."}${changed && displaced ? ` CHoCH + displacement: body ${Math.abs(b.close - b.open).toFixed(2)} ≥ 1.5 × prior ATR ${atr[i - 1].toFixed(2)}.` : ""}`);
        swing.broken = true;
        direction = side;
        for (let j = i - 1; j >= Math.max(0, i - 12, swing.index); j--) {
          const candidate = bars[j];
          if (side === 1 ? candidate.close < candidate.open : candidate.close > candidate.open) {
            // Do not create a zone already invalidated by the break candle itself.
            if ((side === 1 ? b.close >= candidate.low : b.close <= candidate.high) &&
                !marks.some(m => m.kind === "OB" && m.origin === candidate.time && m.direction === (side === 1 ? "bullish" : "bearish"))) {
              add("OB", side, candidate.time, b.time, candidate.low, candidate.high, `Last opposite-colour candle before the ${kind} at ${b.close.toFixed(2)}. Full range ${candidate.low.toFixed(2)}–${candidate.high.toFixed(2)}; identified only when the break closed.`);
            }
            break;
          }
        }
      } else if (!swing.swept && (side === 1 ? b.high > swing.price && b.close <= swing.price : b.low < swing.price && b.close >= swing.price)) {
        swing.swept = true;
        add("Sweep", -side, bars[swing.index].time, b.time, swing.price, swing.price, `Wick crossed the confirmed swing at ${swing.price.toFixed(2)}, but the candle closed back inside at ${b.close.toFixed(2)}. Not a close-confirmed structure break.`);
      }
    }
    if (i >= 2 && (!sameSessionOnly || date(bars[i - 2].time) === date(b.time))) {
      const first = bars[i - 2];
      if (b.low > first.high) add("FVG", 1, first.time, b.time, first.high, b.low, `Candle 3 low ${b.low.toFixed(2)} is above candle 1 high ${first.high.toFixed(2)}. Confirmed after candle 3 closed; the middle candle spans the imbalance.`);
      if (b.high < first.low) add("FVG", -1, first.time, b.time, b.high, first.low, `Candle 3 high ${b.high.toFixed(2)} is below candle 1 low ${first.low.toFixed(2)}. Confirmed after candle 3 closed; the middle candle spans the imbalance.`);
    }
  }
  const range = high && low && high.price > low.price ? { high: high.price, low: low.price, midpoint: (high.price + low.price) / 2, time: Math.max(bars[high.index].time, bars[low.index].time) } : null;
  return { marks, range, direction: direction > 0 ? "Bullish structure" : direction < 0 ? "Bearish structure" : "Waiting for a swing break" };
}
