import type { Candle } from './market';
import { analyseDiscovery, indiaDay, researchCandles, type DiscoveryStock } from './stock-discovery.ts';

export const BHARAT_PERIODS = ['1M','3M','6M','1Y','Max'] as const;
export type BharatPeriod = typeof BHARAT_PERIODS[number];
export type BharatPick = DiscoveryStock & {rank:number;score:number;momentum:number;momentumScore:number;trend:number;riskScore:number;reasons:string[]};
export type BharatComparison = {available:boolean;reason:string|null;label:string;period:BharatPeriod;investment:number;points:{date:string;basket:number;benchmark:number}[];basketReturn:number|null;benchmarkReturn:number|null;excess:number|null;startDate:string|null;endDate:string|null;sessions:number;constituents:number};
export const BHARAT_RETROSPECTIVE_LABEL='Current basket retrospective · not strategy backtest';
export const BHARAT_COMPARISON_NOTE='Price-only comparison of the current basket using equal initial allocations and fixed fractional shares; excludes dividends, fees, taxes and rebalancing. Corporate-action adjustment of supplied history is unverified. Every displayed date includes every constituent and the benchmark. Fundamental source dates may be unavailable; current scores do not establish historical information availability.';
export const BHARAT_METHODOLOGY='Original rule-based score: 45% fundamentals, 35% relative 63-session momentum rank, 10% trend and 10% volatility risk. At least 70% fundamental coverage, completed daily prices and a 20-session median traded-value floor are required. At most four picks per industry by default. Ranking applies only to the supplied scanned candidates, not the entire listed market. Current selections use current information; their historical curve is retrospective, not evidence of an investable historical strategy. '+BHARAT_COMPARISON_NOTE;
const clamp=(n:number)=>Math.max(0,Math.min(100,n));
const mean=(values:number[])=>values.reduce((a,b)=>a+b,0)/values.length;

/** Snapshot ranking only: no historical selection, rebalancing or proprietary AI model is implied. */
export function buildBharatPicks(stocks:DiscoveryStock[],benchmark:Candle[],options:{now?:number;minTurnover?:number;industryCap?:number;limit?:number}={}) {
 const now=options.now??Date.now(),minTurnover=options.minTurnover??10000000,industryCap=options.industryCap??4,limit=options.limit??20;
 if(!Number.isFinite(now)||!Number.isFinite(minTurnover)||minTurnover<0||!Number.isInteger(industryCap)||industryCap<1||industryCap>20||!Number.isInteger(limit)||limit<1||limit>20)throw new Error('Invalid Bharat selection options');
 const excluded:{name:string;reason:string}[]=[],seen=new Set<string>();
 const cleaned:DiscoveryStock[]=[];
 for(const stock of stocks){
  const name=stock.result.name,key=stock.instrument.instrumentKey;
  let reason='';
  if(seen.has(key))reason='Duplicate instrument';
  else if(stock.result.isFinancial)reason='Financial business needs a separate sector model';
  else if(stock.result.gateStatus!=='review'||stock.result.decision==='rejected')reason='Did not pass fundamental research gates';
  else if(!Number.isFinite(stock.fundamentals.coverage)||stock.fundamentals.coverage<70)reason='Less than 70% fundamental scoring coverage';
  else if(!Number.isFinite(stock.fundamentals.total)||stock.fundamentals.total<0||stock.fundamentals.total>100)reason='Invalid fundamental score';
  if(reason){excluded.push({name,reason});continue;}
  seen.add(key);
  try {
   const analysed=analyseDiscovery(stock,stock.candles,now);
   if(analysed.candles.length<64)reason='Needs at least 64 completed sessions for momentum';
   else if(analysed.turnover<minTurnover)reason='Below minimum 20-session median traded value';
   if(reason)excluded.push({name,reason});else cleaned.push(analysed);
  }catch(error){excluded.push({name,reason:error instanceof Error?error.message:'Daily history unavailable'});}
 }
 const asOf=cleaned.map(s=>s.asOf).sort().at(-1)??null;
 const usable=cleaned.filter(s=>{if(s.asOf===asOf)return true;excluded.push({name:s.result.name,reason:'Price date differs from latest eligible scan session'});return false;});
 const scored=usable.map(stock=>{
  const closes=stock.candles.map(c=>c.close),last=closes.at(-1)!,sma20=mean(closes.slice(-20)),sma50=mean(closes.slice(-50));
  const momentum=(last/closes[closes.length-64]-1)*100;
  const trend=[last>sma20,last>sma50,sma20>sma50].filter(Boolean).length/3*100,riskScore=clamp(100-stock.atrPercent*12.5);
  return {...stock,momentum,trend,riskScore};
 });
 const ranked=scored.map(stock=>{
  const momentumScore=scored.length<2?50:(scored.filter(s=>s.momentum<stock.momentum).length+(scored.filter(s=>s.momentum===stock.momentum).length-1)/2)/(scored.length-1)*100;
  const score=stock.fundamentals.total*.45+momentumScore*.35+stock.trend*.1+stock.riskScore*.1;
  const reasons=[`Fundamentals ${stock.fundamentals.total.toFixed(1)}/100 · ${stock.fundamentals.coverage.toFixed(0)}% data coverage`,`63-session price return ${stock.momentum>=0?'+':''}${stock.momentum.toFixed(1)}% · momentum rank ${momentumScore.toFixed(0)}/100`,`Trend ${stock.trend.toFixed(0)}/100 · ${stock.entry>mean(stock.candles.slice(-50).map(c=>c.close))?'above':'below'} 50-session average`,`Daily ATR ${stock.atrPercent.toFixed(2)}% · risk score ${stock.riskScore.toFixed(0)}/100`];
  return {...stock,momentumScore,score,reasons};
 }).sort((a,b)=>b.score-a.score||a.instrument.instrumentKey.localeCompare(b.instrument.instrumentKey));
 const counts=new Map<string,number>(),picks:BharatPick[]=[];
 for(const stock of ranked){const industry=stock.result.industry.trim().toLowerCase()||'unclassified',count=counts.get(industry)??0;
  if(count>=industryCap){excluded.push({name:stock.result.name,reason:`Industry diversification cap of ${industryCap}`});continue;}
  if(picks.length>=limit){excluded.push({name:stock.result.name,reason:`Outside top ${limit} after scoring and diversification`});continue;}
  counts.set(industry,count+1);picks.push({...stock,rank:picks.length+1});
 }
 return {picks,eligible:ranked.length,excluded,asOf,diversificationOmissions:ranked.length-picks.length,methodology:BHARAT_METHODOLOGY,label:BHARAT_RETROSPECTIVE_LABEL,comparison:compareBharatBasket(picks,benchmark,'1Y',100000,now)};
}

/** Equal initial rupee allocation, fixed fractional shares and no subsequent rebalancing.
 * Every point includes every current constituent and benchmark on the identical trading date.
 */
export function compareBharatBasket(picks:Pick<DiscoveryStock,'candles'>[],benchmark:Candle[],period:BharatPeriod='1Y',investment=100000,now=Date.now()):BharatComparison {
 const empty:BharatComparison={available:false,reason:null,label:BHARAT_RETROSPECTIVE_LABEL,period,investment,points:[],basketReturn:null,benchmarkReturn:null,excess:null,startDate:null,endDate:null,sessions:0,constituents:picks.length};
 const unavailable=(reason:string):BharatComparison=>({...empty,reason});
 if(!BHARAT_PERIODS.includes(period))return unavailable('Unsupported period; choose 1M, 3M, 6M, 1Y or Max');
 if(!Number.isFinite(investment)||investment<=0||investment>1e10||!Number.isFinite(now))return unavailable('Enter a positive investment up to ₹1,000 crore and a valid date');
 if(!picks.length)return unavailable('No eligible constituents are available');
 if(!benchmark.length)return unavailable('Benchmark daily history is unavailable; comparison cannot be calculated');
 let histories:Candle[][];
 try{histories=[...picks.map(p=>researchCandles(p.candles,now)),researchCandles(benchmark,now)];}
 catch(error){return unavailable(`Comparison unavailable: ${error instanceof Error?error.message:'invalid daily history'}`);}
 const maps=histories.map(rows=>new Map(rows.map(c=>[indiaDay(c.time*1000),c.close])));
 const common=[...maps.at(-1)!.keys()].filter(date=>maps.every(m=>m.has(date))).sort();
 const sessions=period==='Max'?Math.max(0,common.length-1):({'1M':21,'3M':63,'6M':126,'1Y':252} as const)[period];
 if(sessions<1||common.length<sessions+1)return unavailable(`Insufficient exact common history: ${common.length} dates across every constituent and benchmark; ${period==='Max'?'at least 2':sessions+1} required for ${period}`);
 const dates=period==='Max'?common:common.slice(-sessions-1),first=dates[0],last=dates.at(-1)!;
 // A stale constituent must not silently move the complete current comparison endpoint backwards.
 if(histories.some(rows=>indiaDay(rows.at(-1)!.time*1000)!==last))return unavailable('Latest completed dates differ across constituents and benchmark; comparison needs a common current endpoint');
 const bases=maps.map(m=>m.get(first)!);
 const points=dates.map(date=>({date,basket:investment*mean(maps.slice(0,-1).map((m,i)=>m.get(date)!/bases[i])),benchmark:investment*maps.at(-1)!.get(date)!/bases.at(-1)!}));
 const basketReturn=(points.at(-1)!.basket/investment-1)*100,benchmarkReturn=(points.at(-1)!.benchmark/investment-1)*100;
 return {...empty,available:true,points,basketReturn,benchmarkReturn,excess:basketReturn-benchmarkReturn,startDate:first,endDate:last,sessions:dates.length-1};
}
