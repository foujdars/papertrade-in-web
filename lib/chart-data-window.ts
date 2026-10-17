import type { Candle } from './market';
import type { StudyResult } from './study-calculations';
export type ChartDataGroup={id:string;title:string;rows:{name:string;value:number|null;color?:string}[]};
export function chartDataSnapshot(candles:Candle[],time:number|null|undefined,studies:{id:string;title:string;result:StudyResult}[]){
  const index=time==null?candles.length-1:candles.findIndex(c=>c.time===time);
  if(index<0)return null;
  const candle=candles[index],previous=candles[index-1]?.close;
  const groups:ChartDataGroup[]=studies.map(study=>({id:study.id,title:study.title,rows:study.result.plots.map(plot=>{
    const source=index-(plot.offset??0),value=plot.values[source];
    return {name:plot.name,value:Number.isFinite(value)?value:null,color:plot.colors?.[source]};
  })})).filter(group=>group.rows.length>0);
  return {candle,index,change:previous!==undefined?candle.close-previous:null,changePercent:previous?((candle.close-previous)/previous)*100:null,groups};
}
