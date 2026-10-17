import type { ScreeningResult } from './fundamental-screener.ts';
/** Reimport price/fundamental fields without discarding uniquely matched research decisions. */
export function preserveFundamentalReviews(next:ScreeningResult[],previous:ScreeningResult[]):ScreeningResult[]{
 const key=(r:ScreeningResult)=>r.isin.trim().toUpperCase()|| (r.nseCode?`NSE:${r.nseCode.trim().toUpperCase()}`:r.bseCode?`BSE:${r.bseCode.trim()}`:'');
 const groups=new Map<string,ScreeningResult[]>();
 for(const row of previous){const id=key(row);if(id)groups.set(id,[...(groups.get(id)??[]),row]);}
 return next.map(row=>{const matches=groups.get(key(row));return matches?.length===1?{...row,decision:matches[0].decision,notes:matches[0].notes}:row;});
}
