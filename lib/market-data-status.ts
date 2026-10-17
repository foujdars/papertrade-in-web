export type MarketDataStatus = { status?: string; source?:string; fetchedAt?: string|null; marketOpen?: boolean; warning?: string|null; staleTabs?: readonly string[]; failedTabs?: readonly string[] };
export function marketDataLabel(meta:MarketDataStatus|null|undefined, failed=false, now=Date.now(), tab?:string) {
 if(failed||meta?.status==='stale'||tab&&meta?.staleTabs?.includes(tab))return 'Refresh failed · Last available quotes';
 if(meta?.status==='unavailable'||tab&&meta?.failedTabs?.includes(tab))return 'Quotes unavailable';
 const at=Date.parse(meta?.fetchedAt??'');
 if(meta?.marketOpen&&Number.isFinite(at)&&now-at>60_000)return 'Refresh overdue · Last available quotes';
 if(meta?.status==='partial')return 'Some quotes delayed';
 if(meta?.status==='delayed')return meta.source==='upstox'?'Delayed broker quotes':'Delayed scanner quotes';
 if(meta?.status==='verified')return meta.marketOpen?'Broker-checked quotes':'Market closed · Last available quotes';
 return 'Quote timing unavailable';
}
export function marketTimeLabel(value:string|null|undefined, prefix='Quote') {
 const at=Date.parse(value??'');
 if(!Number.isFinite(at))return prefix==='Quote'?'Quote time unavailable':'';
 return `${prefix} ${new Intl.DateTimeFormat('en-IN',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false,timeZone:'Asia/Kolkata'}).format(at)} IST`;
}
