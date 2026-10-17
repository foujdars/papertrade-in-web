"use client";
import {marketDataLabel,marketTimeLabel,type MarketDataStatus as Status} from '@/lib/market-data-status';
export function MarketDataStatus({metadata,failed=false,tab,now,compact=false}:{metadata?:Status|null;failed?:boolean;tab?:string;now?:number;compact?:boolean}) {
 const label=marketDataLabel(metadata,failed,now,tab),checked=marketTimeLabel(metadata?.fetchedAt,'Checked');
 return <span className={`market-data-status${compact?' is-compact':''}`} role="status" title={metadata?.warning??undefined}><span>{label}</span>{!compact&&checked&&<small>{checked}</small>}{!compact&&metadata?.warning&&<small>{metadata.warning}</small>}</span>;
}
