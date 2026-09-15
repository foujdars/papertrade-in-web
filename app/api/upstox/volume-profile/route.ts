import { isSupportedNseInstrumentKey } from "@/lib/upstox";
import { upstoxErrorResponse, upstoxFetch } from "@/lib/upstox-server";
import { profileFetchPlan } from "@/lib/profile-range";
import type { VolumeCandle } from "@/lib/volume-profile";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Payload = { data?: { candles?: [string,number,number,number,number,number][] } };
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const key=params.get("instrumentKey")??"",from=Number(params.get("from")),to=Number(params.get("to"));
  if(!isSupportedNseInstrumentKey(key))return Response.json({ok:false,error:{message:"Unsupported instrument key."}},{status:400});
  let plan: ReturnType<typeof profileFetchPlan>;
  try { plan=profileFetchPlan(from,to); } catch { return Response.json({ok:false,error:{message:"Select a profile range within one year and not in the future."}},{status:400}); }
  try {
    const byTime=new Map<number,VolumeCandle>();
    const add=(payload:Payload)=>{for(const c of payload.data?.candles??[]){const time=Date.parse(c[0])/1000;const candle={time,open:Number(c[1]),high:Number(c[2]),low:Number(c[3]),close:Number(c[4]),volume:Number(c[5])};if(Object.values(candle).every(Number.isFinite)&&candle.high>=candle.low&&candle.volume>=0)byTime.set(time,candle);}};
    const encoded=encodeURIComponent(key);
    // Bounded sequential chunks respect upstream per-request interval limits. Never truncate a profile to the chart's 1600-bar cap.
    for(const chunk of plan.chunks) {
      if(chunk.from===plan.today)continue;
      add(await upstoxFetch<Payload>(`/v3/historical-candle/${encoded}/minutes/${plan.interval}/${chunk.to}/${chunk.from}`));
    }
    if(plan.includesToday)add(await upstoxFetch<Payload>(`/v3/historical-candle/intraday/${encoded}/minutes/${plan.interval}`));
    const candles=[...byTime.values()].filter(c=>c.time>=from&&c.time<=to).sort((a,b)=>a.time-b.time);
    if(!candles.length)return Response.json({ok:false,error:{message:"No intraday volume data for this range."}},{status:404});
    return Response.json({ok:true,candles,intervalMinutes:plan.interval,source:"Upstox",fetchedAt:new Date().toISOString()},{headers:{"Cache-Control":"private, max-age=20"}});
  } catch(error) { return upstoxErrorResponse(error); }
}
