export type CloudPoint = { x: number; a: number; b: number };
export type CloudSegment = { left: CloudPoint; right: CloudPoint; bullish: boolean };

/** Split at crossings so one candle interval never paints the wrong cloud colour. */
export function cloudSegments(points: ReadonlyArray<CloudPoint | null>): CloudSegment[] {
  const segments: CloudSegment[] = [];
  for (let i = 1; i < points.length; i++) {
    const left = points[i - 1], right = points[i];
    if (!left || !right || ![left.x,left.a,left.b,right.x,right.a,right.b].every(Number.isFinite)) continue;
    const d1 = left.a - left.b, d2 = right.a - right.b;
    if (d1 * d2 < 0) {
      const fraction = d1 / (d1 - d2);
      const value = left.a + (right.a - left.a) * fraction;
      const cross = { x: left.x + (right.x - left.x) * fraction, a: value, b: value };
      segments.push({left,right:cross,bullish:d1>0},{left:cross,right,bullish:d2>0});
    } else segments.push({left,right,bullish:(d1 || d2)>=0});
  }
  return segments;
}
