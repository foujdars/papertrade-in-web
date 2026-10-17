import type { Instrument } from './market';
import type { ScreeningResult } from './fundamental-screener.ts';
import { discoveryCandidates } from './stock-discovery.ts';
export type BharatStrategy = 'outperformers' | 'bargains' | 'smallcap';
export const BHARAT_STRATEGIES = [
 { id:'outperformers',name:'Bharat Market Outperformers',limit:20,description:'A balanced screen for fundamental strength, momentum and measured risk.',method:'45% fundamentals · 35% momentum · 10% trend · 10% risk.' },
 { id:'bargains',name:'Bharat Bargains',limit:15,description:'Relative-value research: positive P/E below the industry P/E, PEG up to 1.5 and established quality.',method:'45% valuation · 35% quality · 10% balance sheet · 10% risk. Relative valuation is not an estimate of intrinsic value.' },
 { id:'smallcap',name:'Bharat Small Cap Gems',limit:20,description:'A smaller-company growth screen with ₹500–5,000 crore market cap and at least 10% three-year sales and profit growth.',method:'40% growth · 25% quality · 20% momentum · 15% risk. The size band is a Papertrade research rule, not an official index or SEBI classification.' },
] as const;
export function bharatStrategyRule(result:ScreeningResult,strategy:BharatStrategy):string|null {
 const m=result.metrics;
 if(strategy==='bargains'){
  if(!(m.pe!=null&&m.pe>0&&m.industryPe!=null&&m.industryPe>0&&m.pe<m.industryPe))return 'Needs positive P/E below positive industry P/E';
  if(!(m.peg!=null&&m.peg>0&&m.peg<=1.5))return 'Needs positive PEG up to 1.5';
  if(!(m.roe!=null&&m.roe>=15&&m.roce!=null&&m.roce>=15))return 'Needs ROE and ROCE of at least 15%';
 }
 if(strategy==='smallcap'){
  if(!(m.marketCapCr!=null&&Number.isFinite(m.marketCapCr)&&m.marketCapCr>=500&&m.marketCapCr<=5000))return 'Needs Market Capitalization (INR crore) between 500 and 5,000';
  if(!(m.profit3!=null&&m.profit3>=10&&m.sales3!=null&&m.sales3>=10))return 'Needs three-year profit and sales growth of at least 10%';
 }
 return null;
}
export function bharatCandidates(results:ScreeningResult[],instruments:Instrument[],strategy:BharatStrategy){
 const filtered=results.filter(r=>!bharatStrategyRule(r,strategy));
 const pool=discoveryCandidates(filtered,instruments,60);
 return {...pool,excluded:[...results.flatMap(r=>{const reason=bharatStrategyRule(r,strategy);return reason?[{name:r.name,reason}]:[];}),...pool.excluded]};
}
