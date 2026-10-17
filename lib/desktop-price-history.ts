export type PricePoint = { time: number; close: number };

/** Display only observed closes from the latest Indian session; never synthesize a curve. */
export function latestSessionPrices(value: unknown): PricePoint[] {
  if (!Array.isArray(value)) return [];
  const points = new Map<number, PricePoint>();
  for (const row of value) {
    const time = Number(row?.time), close = Number(row?.close);
    if (Number.isFinite(time) && time > 0 && Number.isFinite(close) && close > 0) points.set(time, { time, close });
  }
  const sorted = [...points.values()].sort((a,b)=>a.time-b.time);
  const day = (time: number) => new Date((time+19800)*1000).toISOString().slice(0,10);
  const last = sorted.at(-1);
  return last ? sorted.filter(point=>day(point.time)===day(last.time)) : [];
}

export function priceLineGeometry(points: PricePoint[], reference?: number, width = 180, height = 54) {
  if (points.length < 2) return null;
  const baseline = Number.isFinite(reference) && reference! > 0 ? reference! : points[0].close;
  const values = [...points.map(p=>p.close),baseline];
  const low=Math.min(...values),high=Math.max(...values),span=high-low || Math.max(1,high*.001);
  const start=points[0].time,end=points.at(-1)!.time;
  if (end<=start) return null;
  const x=(time:number)=>3+(time-start)/(end-start)*(width-6);
  const y=(price:number)=>3+(high-price)/span*(height-6);
  const path=points.map((point,i)=>`${!i || point.time-points[i-1].time>15*60 ? 'M':'L'}${x(point.time).toFixed(2)},${y(point.close).toFixed(2)}`).join(' ');
  return {path,flat:points.every(p=>p.close===baseline),baselineY:y(baseline),lastX:x(end),lastY:y(points.at(-1)!.close),up:points.at(-1)!.close>=baseline};
}
