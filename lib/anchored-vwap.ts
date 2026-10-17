import type { Candle } from "./market";

export type AnchoredVwapPoint = { time: number; value: number };
export type AnchoredVwapBand = AnchoredVwapPoint & { deviation: number };
type VwapCandle = Pick<Candle, "time" | "high" | "low" | "close" | "volume"> & {open?:number};

/** Weighted online variance of candle source prices; never reads bars before the anchor. */
export function anchoredVwapBands(candles: VwapCandle[], anchorTime: number, source = 'hlc3'): AnchoredVwapBand[] {
  if (!Number.isFinite(anchorTime)) return [];
  let volume=0,mean=0,m2=0;
  const points:AnchoredVwapBand[]=[];
  for(const candle of candles) {
    if(candle.time<anchorTime||!Number.isFinite(candle.time))continue;
    const price=source==='open'?candle.open:source==='high'?candle.high:source==='low'?candle.low:source==='close'?candle.close:source==='hl2'?(candle.high+candle.low)/2:source==='ohlc4'?(candle.open!+candle.high+candle.low+candle.close)/4:(candle.high+candle.low+candle.close)/3;
    if(!Number.isFinite(price)||!Number.isFinite(candle.volume)||candle.volume<=0)continue;
    const next=volume+candle.volume,delta=price!-mean;
    mean+=candle.volume/next*delta;
    m2+=candle.volume*delta*(price!-mean);volume=next;
    if(!Number.isFinite(mean)||!Number.isFinite(m2)||!Number.isFinite(volume))break;
    points.push({time:candle.time,value:mean,deviation:Math.sqrt(Math.max(0,m2/volume))});
  }
  return points;
}

/** Volume-weighted typical price from the anchor candle forward. Earlier candles are ignored. */
export function anchoredVwap(candles: Pick<Candle, "time" | "high" | "low" | "close" | "volume">[], anchorTime: number): AnchoredVwapPoint[] {
  return anchoredVwapBands(candles,anchorTime).map(({time,value})=>({time,value}));
}
