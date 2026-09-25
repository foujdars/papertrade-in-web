import { LineSeries, HistogramSeries, MismatchDirection, type Logical, type IChartApi, type ISeriesApi, type Time, type LineWidth, type LineStyle, type ISeriesPrimitive, type SeriesAttachedParameter, type IPrimitivePaneView } from 'lightweight-charts';
import type { Candle } from './market';
import { computeStudy, type StudyResult } from './study-calculations';
import { STUDIES, studyDefaults, type StudyConfig } from './indicator-catalog';
import { buildVolumeProfile } from './volume-profile';

type Bundle={id:string;config:StudyConfig;signature:string;series:ISeriesApi<'Line'|'Histogram'>[];pane:number;result:StudyResult;primitive?:{update:(data:Candle[])=>void}};
class VisibleProfile implements ISeriesPrimitive<Time>{
 chart?:IChartApi;series?:ISeriesApi<'Line'>;request?:()=>void;data:Candle[]=[];config:StudyConfig;
 constructor(config:StudyConfig){this.config=config;}
 attached(p:SeriesAttachedParameter<Time>){this.chart=p.chart;this.series=p.series as ISeriesApi<'Line'>;this.request=p.requestUpdate;}
 detached(){this.chart=undefined;this.series=undefined;this.request=undefined;}
 update(data:Candle[]){this.data=data;this.request?.();}
 paneViews():IPrimitivePaneView[]{return [{renderer:()=>({draw:target=>target.useMediaCoordinateSpace(({context:ctx,mediaSize})=>{
  const visible=this.chart?.timeScale().getVisibleLogicalRange();if(!visible||!this.series)return;
  const data=this.data.slice(Math.max(0,Math.floor(visible.from)),Math.min(this.data.length,Math.ceil(visible.to)+1));
  const bins=buildVolumeProfile(data,-Infinity,Infinity,this.config.inputs.rows);const max=Math.max(0,...bins.map(b=>b.volume));if(!max)return;
  ctx.save();ctx.beginPath();ctx.rect(0,0,mediaSize.width,mediaSize.height);ctx.clip();ctx.fillStyle=this.config.colors[0];ctx.globalAlpha=this.config.opacity/100*.32;
  for(const bin of bins){const top=this.series.priceToCoordinate(bin.high),bottom=this.series.priceToCoordinate(bin.low);if(top===null||bottom===null)continue;const width=bin.volume/max*mediaSize.width*.24;ctx.fillRect(mediaSize.width-width,top,width,Math.max(1,bottom-top));}ctx.restore();
 })})}];}
}
class OscillatorBands implements ISeriesPrimitive<Time>{
 chart?:IChartApi;series?:ISeriesApi<'Line'>;request?:()=>void;lower:number;upper:number;floor:number;ceiling:number;
 constructor(lower:number,upper:number,floor=0,ceiling=100){this.lower=lower;this.upper=upper;this.floor=floor;this.ceiling=ceiling;}
 attached(p:SeriesAttachedParameter<Time>){this.chart=p.chart;this.series=p.series as ISeriesApi<'Line'>;this.request=p.requestUpdate;}
 detached(){this.chart=undefined;this.series=undefined;this.request=undefined;}
 update(){this.request?.();}
 paneViews():IPrimitivePaneView[]{return [{zOrder:()=>'bottom',renderer:()=>({draw:target=>target.useMediaCoordinateSpace(({context:ctx,mediaSize})=>{
  const series=this.series;if(!series)return;
  const yUpper=series.priceToCoordinate(this.upper),yLower=series.priceToCoordinate(this.lower);
  if(yUpper===null||yLower===null)return;
  ctx.save();
  ctx.fillStyle='rgba(128,84,218,.16)';
  ctx.fillRect(0,Math.min(yUpper,yLower),mediaSize.width,Math.abs(yLower-yUpper));
  ctx.restore();
 })})}];}
}
export class ChartStudyRenderer {
 chart:IChartApi;bundles:Bundle[]=[];data:Candle[]=[];time:(epoch:number)=>Time;signature='';comparisons:Record<string,Candle[]>={};
 constructor(chart:IChartApi,time:(epoch:number)=>Time){this.chart=chart;this.time=time;}
 sync(enabled:Record<string,boolean>,settings:Record<string,StudyConfig>,timeframe:string,data:Candle[]){
  const selected=STUDIES.filter(s=>s.id!=='smc'&&s.id!=='patterns'&&s.id!=='opening-range'&&s.id!=='previous-day'&&s.id!=='anchored-vwap'&&enabled[s.id]&&!s.unavailable).map(s=>({definition:s,config:settings[s.id]??studyDefaults(s.id)})).filter(s=>!s.config.hidden&&(!s.config.timeframes.length||s.config.timeframes.includes(timeframe))).map(s=>({...s,result:computeStudy(s.definition.id,data,s.config,this.comparisons[s.config.comparisonKey??''])}));
  const signature=JSON.stringify(selected.map(s=>[s.definition.id,s.config,s.result.plots.map(p=>[p.name,p.histogram,p.points]),s.result.range,s.result.levels]));
  if(signature!==this.signature){
   const range=this.chart.timeScale().getVisibleLogicalRange(),price=this.chart.priceScale('right'),auto=price.options().autoScale,priceRange=price.getVisibleRange();
   for(const b of [...this.bundles].reverse())for(const s of [...b.series].reverse())this.chart.removeSeries(s);
   this.bundles=[];this.signature=signature;let pane=0;
   for(const {definition:d,config:c,result} of selected){
    const index=d.overlay||d.id==='volume'?0:++pane,series:Bundle['series']=[];
    // Preserve an empty pane/series when history is unavailable so later live data can fill it.
    const plots=result.plots.length?result.plots:[{name:d.name,values:[]}];
    for(let i=0;i<plots.length;i++){
     const plot=plots[i],isVolume=d.id==='volume',color=(isVolume&&i===1?c.colors[2]:c.colors[i%c.colors.length])+Math.round(c.opacity/100*(isVolume&&i===0?145:255)).toString(16).padStart(2,'0');
     const oscillator=d.id==='rsi';
     const s=plot.histogram?this.chart.addSeries(HistogramSeries,{color,priceScaleId:isVolume?'volume':undefined,priceLineVisible:false,lastValueVisible:!isVolume&&c.showValue,priceFormat:d.volume?{type:'volume'}:{type:'price',precision:2,minMove:.01}},index):this.chart.addSeries(LineSeries,{color,priceScaleId:isVolume?'volume':undefined,lineWidth:(oscillator&&i===0?Math.max(2,c.width):c.width) as LineWidth,lineStyle:(oscillator&&i>0&&c.dash===0?2:c.dash) as LineStyle,lineVisible:!plot.points,pointMarkersVisible:!!plot.points,pointMarkersRadius:3,priceLineVisible:false,lastValueVisible:!isVolume&&c.showValue&&!(oscillator&&i>0),crosshairMarkerVisible:oscillator&&i===0,crosshairMarkerRadius:4,title:'',autoscaleInfoProvider:result.range?()=>({priceRange:{minValue:result.range![0],maxValue:result.range![1]}}):undefined},index);
     if(i===0)for(const level of result.levels??[])s.createPriceLine({price:level,color:oscillator?'#8054da66':'#8c849b80',lineWidth:1,lineStyle:2,axisLabelVisible:false,title:''});series.push(s);
    }
    const bundle:Bundle={id:d.id,config:c,signature:JSON.stringify(c),series,pane:index,result};
    if(d.id==='volume')this.chart.priceScale('volume',0).applyOptions({visible:false,autoScale:true,scaleMargins:{top:.79,bottom:0}});
    if(d.id==='rsi'){this.chart.priceScale('right',index).applyOptions({scaleMargins:{top:.1,bottom:.12}});const bands=new OscillatorBands(c.inputs.lower??30,c.inputs.upper??70);(series[0] as ISeriesApi<'Line'>).attachPrimitive(bands);bundle.primitive=bands;}
    if(d.id==='vpvr'){series[0].applyOptions({visible:true,lastValueVisible:false,color:'transparent',autoscaleInfoProvider:()=>null});const primitive=new VisibleProfile(c);(series[0] as ISeriesApi<'Line'>).attachPrimitive(primitive);bundle.primitive=primitive;}
    this.bundles.push(bundle);
   }
   if(range)this.chart.timeScale().setVisibleLogicalRange(range);if(!auto&&priceRange){price.setAutoScale(false);price.setVisibleRange(priceRange);}
  }
  this.update(data,new Map(selected.map(s=>[s.definition.id,s.result])));
 }
 update(data:Candle[],results?:Map<string,StudyResult>){this.data=data;for(const b of this.bundles){
  b.result=results?.get(b.id)??computeStudy(b.id,data,b.config);
  for(let k=0;k<b.series.length;k++){
   const plot=b.id==='vpvr'?{name:'Profile anchor',values:data.map(c=>c.close)}:b.result.plots[k],offset=plot?.offset??0;
   // Displacements beyond loaded candles are not extrapolated through weekends/holidays.
   const points=(plot?.values??data.map(()=>Number.NaN)).flatMap((value,i)=>{
    const at=i+offset;if(at<0||at>=data.length)return [];
    if(!Number.isFinite(value))return b.id==='zigzag'?[]:[{time:this.time(data[at].time)}];
    const alpha=Math.round(b.config.opacity/100*(b.id==='volume'&&k===0?145:255)).toString(16).padStart(2,'0');
    let color=plot?.colors?.[i];
    if(b.id==='volume'&&k===0)color=b.config.colors[data[i].close>=data[i].open?0:1];
    else if(b.id==='supertrend')color=b.config.colors[data[i].close>=value?0:1];
    else if(plot?.histogram&&b.id!=='chop-zone')color=b.config.colors[value>=0?0:1];
    if(color)color=color.slice(0,7)+alpha;
    return [{time:this.time(data[at].time),value,color}];
   });b.series[k].setData(points);
  }b.primitive?.update(data);
 }}
 fit(height:number){const panes=this.chart.panes(),lower=panes.length-1;if(!lower){panes[0]?.setHeight(height);return;}const roomy=this.bundles.some(b=>b.pane>0&&(b.id==='rsi'||b.id==='stochastic'||b.id==='stoch-rsi'||b.id==='mfi'));const h=Math.max(roomy?104:58,Math.min(roomy?136:120,Math.floor(height*(roomy?0.4:0.52)/lower)));panes[0]?.setHeight(Math.max(140,height-h*lower));for(let i=1;i<panes.length;i++)panes[i].setHeight(h);}
 // Hit-test rendered pixels, not just the nearest timestamp: empty chart space is not a study.
 hitTest(clientX:number,clientY:number,tolerance=9):string|null {
  let closest=tolerance,hit:string|null=null;
  const scale=this.chart.timeScale();
  for(const b of this.bundles){
   if(b.id==='vpvr'||b.config.opacity===0)continue;
   const rect=this.chart.panes()[b.pane]?.getHTMLElement()?.getBoundingClientRect();
   if(!rect)continue;
   const x=clientX-rect.left,y=clientY-rect.top;
   if(x<0||x>scale.width()||y<0||y>rect.height)continue;
   const logical=scale.coordinateToLogical(x);if(logical===null)continue;
   for(const series of b.series){
    if(!series.options().visible)continue;
    const left=series.dataByIndex(Math.floor(logical),MismatchDirection.NearestLeft),right=series.dataByIndex(Math.ceil(logical),MismatchDirection.NearestRight);
    const pixel=(p:typeof left)=>{if(!p||!('value' in p))return null;const px=scale.timeToCoordinate(p.time),py=series.priceToCoordinate(p.value);return px===null||py===null?null:{x:px,y:py};};
    const a=pixel(left),z=pixel(right);let distance=Infinity;
    if(series.seriesType()==='Histogram'){
     const base=series.priceToCoordinate(0),next=scale.logicalToCoordinate((Math.floor(logical)+1) as Logical),prev=scale.logicalToCoordinate(Math.floor(logical) as Logical);
     const half=next!==null&&prev!==null?Math.abs(next-prev)*.45:3;
     for(const p of [a,z])if(p&&base!==null&&Math.abs(x-p.x)<=half&&y>=Math.min(base,p.y)&&y<=Math.max(base,p.y))distance=0;
    }else if(b.result.plots[b.series.indexOf(series)]?.points){
     for(const p of [a,z])if(p)distance=Math.min(distance,Math.hypot(x-p.x,y-p.y));
    }else if(a&&z){
     const dx=z.x-a.x,dy=z.y-a.y,t=Math.max(0,Math.min(1,((x-a.x)*dx+(y-a.y)*dy)/(dx*dx+dy*dy||1)));
     distance=Math.hypot(x-a.x-t*dx,y-a.y-t*dy);
    }
    if(distance<closest){closest=distance;hit=b.id;}
   }
  }
  return hit;
 }
 summaries(){return this.bundles.map(b=>({id:b.id,pane:b.pane,message:b.result.message,value:b.result.plots[0]?.values.filter(Number.isFinite).at(-1),extra:b.result.plots[1]?.values.filter(Number.isFinite).at(-1)}));}
 volumeLabel(){const b=this.bundles.find(bundle=>bundle.id==='volume');if(!b||!b.config.showValue)return null;const values=b.result.plots[0]?.values??[];let index=-1;for(let i=values.length-1;i>=0;i--)if(Number.isFinite(values[i])){index=i;break;}if(index<0)return null;const bar=this.data[index],up=!bar||bar.close>=bar.open;return {value:values[index],y:b.series[0]?.priceToCoordinate(values[index]),color:b.config.colors[up?0:1]};}
}
