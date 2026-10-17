"use client";
import { useState } from 'react';
import { useTransientBack } from './useTransientBack';
import { ChevronDown, ChevronRight, X } from 'lucide-react';
import type { chartDataSnapshot } from '@/lib/chart-data-window';
type Props={snapshot:ReturnType<typeof chartDataSnapshot>;symbol:string;timeframe:string;timezone:string;hovered:boolean;onClose:()=>void};
const format=(value:number|null)=>value===null?'—':new Intl.NumberFormat('en-IN',{maximumFractionDigits:8}).format(value);
export function ChartDataWindow({snapshot,symbol,timeframe,timezone,hovered,onClose}:Props){
 useTransientBack(true,onClose);
 const [collapsed,setCollapsed]=useState<string[]>([]);
 const toggle=(id:string)=>setCollapsed(current=>current.includes(id)?current.filter(item=>item!==id):[...current,id]);
 return <aside className="desktop-chart-data" aria-label="Chart data window"><header><b>Data window</b><button type="button" aria-label="Close data window" onClick={onClose}><X size={17}/></button></header><div className="chart-data-content">
 <p className="chart-data-symbol">{symbol}<span>{timeframe} · {hovered?'Selected candle':'Latest candle'}</span></p>
 {snapshot?<><time dateTime={new Date(snapshot.candle.time*1000).toISOString()}>{new Intl.DateTimeFormat('en-GB',{dateStyle:'medium',timeStyle:'short',timeZone:timezone}).format(snapshot.candle.time*1000)}</time><small className="chart-data-zone">{timezone}</small>
 <dl>{[['Open',snapshot.candle.open],['High',snapshot.candle.high],['Low',snapshot.candle.low],['Close',snapshot.candle.close],['Change',snapshot.change],['Change %',snapshot.changePercent],['Volume',snapshot.candle.volume]].map(([name,value])=><div key={name}><dt>{name}</dt><dd>{format(value as number|null)}{name==='Change %'&&value!==null?'%':''}</dd></div>)}</dl>
 {snapshot.groups.map(group=><section key={group.id}><button className="chart-data-heading" type="button" aria-expanded={!collapsed.includes(group.id)} onClick={()=>toggle(group.id)}>{collapsed.includes(group.id)?<ChevronRight size={14}/>:<ChevronDown size={14}/>}<b>{group.title}</b></button>{!collapsed.includes(group.id)&&<dl>{group.rows.map((row,index)=><div key={`${row.name}-${index}`}><dt>{row.color&&<i style={{background:row.color}}/>}{row.name}</dt><dd>{format(row.value)}</dd></div>)}</dl>}</section>)}<p className="chart-data-hint">Move or touch and hold the crosshair to inspect a candle. Empty indicator values have insufficient history or no output on that bar.</p></>:<p className="chart-data-hint">Waiting for chart candles.</p>}
 </div></aside>;
}
