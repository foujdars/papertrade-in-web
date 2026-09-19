import { LineSeries, HistogramSeries, type IChartApi, type ISeriesApi, type Time, type LineWidth, type LineStyle, type ISeriesPrimitive, type SeriesAttachedParameter, type IPrimitivePaneView } from 'lightweight-charts';
import type { Candle } from './market';
import { computeStudy, type StudyResult } from './study-calculations';
import { STUDIES, studyDefaults, type StudyConfig } from './indicator-catalog';
import { buildVolumeProfile } from './volume-profile';

type Bundle={id:string;config:StudyConfig;signature:string;series:ISeriesApi<'Line'|'Histogram'>[];pane:number;result:StudyResult;primitive?:VisibleProfile};
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
export class ChartStudyRenderer {
 chart:IChartApi;bundles:Bundle[]=[];data:Candle[]=[];time:(epoch:number)=>Time;signature='';comparisons:Record<string,Candle[]>={};
 constructor(chart:IChartApi,time:(epoch:number)=>Time){this.chart=chart;this.time=time;}
 sync(enabled:Record<string,boolean>,settings:Record<string,StudyConfig>,timeframe:string,data:Candle[]){
  const selected=STUDIES.filter(s=>s.id!=='smc'&&enabled[s.id]&&!s.unavailable).map(s=>({definition:s,config:settings[s.id]??studyDefaults(s.id)})).filter(s=>!s.config.hidden&&(!s.config.timeframes.length||s.config.timeframes.includes(timeframe))).map(s=>({...s,result:computeStudy(s.definition.id,data,s.config,this.comparisons[s.config.comparisonKey??''])}));
  const signature=JSON.stringify(selected.map(s=>[s.definition.id,s.config,s.result.plots.map(p=>[p.name,p.histogram,p.points]),s.result.range,s.result.levels]));
  if(signature!==this.signature){
   const range=this.chart.timeScale().getVisibleLogicalRange(),price=this.chart.priceScale('right'),auto=price.options().autoScale,priceRange=price.getVisibleRange();
   for(const b of [...this.bundles].reverse())for(const s of [...b.series].reverse())this.chart.removeSeries(s);
   this.bundles=[];this.signature=signature;let pane=0;
   for(const {definition:d,config:c,result} of selected){
    const index=d.overlay?0:++pane,series:Bundle['series']=[];
    // Preserve an empty pane/series when history is unavailable so later live data can fill it.
    const plots=result.plots.length?result.plots:[{name:d.name,values:[]}];
    for(let i=0;i<plots.length;i++){
     const plot=plots[i],color=c.colors[i%c.colors.length]+Math.round(c.opacity/100*255).toString(16).padStart(2,'0');
     const s=plot.histogram?this.chart.addSeries(HistogramSeries,{color,priceLineVisible:false,lastValueVisible:c.showValue,priceFormat:d.volume?{type:'volume'}:{type:'price',precision:2,minMove:.01}},index):this.chart.addSeries(LineSeries,{color,lineWidth:c.width as LineWidth,lineStyle:c.dash as LineStyle,lineVisible:!plot.points,pointMarkersVisible:!!plot.points,pointMarkersRadius:3,priceLineVisible:false,lastValueVisible:c.showValue,crosshairMarkerVisible:false,title:'',autoscaleInfoProvider:result.range?()=>({priceRange:{minValue:result.range![0],maxValue:result.range![1]}}):undefined},index);
     if(i===0)for(const level of result.levels??[])s.createPriceLine({price:level,color:'#8c849b80',lineWidth:1,lineStyle:2,axisLabelVisible:false,title:''});series.push(s);
    }
    const bundle:Bundle={id:d.id,config:c,signature:JSON.stringify(c),series,pane:index,result};
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
    const alpha=Math.round(b.config.opacity/100*255).toString(16).padStart(2,'0');
    let color=plot?.colors?.[i];
    if(b.id==='volume'&&k===0)color=b.config.colors[data[i].close>=data[i].open?0:1];
    else if(b.id==='supertrend')color=b.config.colors[data[i].close>=value?0:1];
    else if(plot?.histogram&&b.id!=='chop-zone')color=b.config.colors[value>=0?0:1];
    if(color)color=color.slice(0,7)+alpha;
    return [{time:this.time(data[at].time),value,color}];
   });b.series[k].setData(points);
  }b.primitive?.update(data);
 }}
 fit(height:number){const panes=this.chart.panes(),lower=panes.length-1;if(!lower){panes[0]?.setHeight(height);return;}const h=Math.max(58,Math.min(120,Math.floor(height*.52/lower)));panes[0]?.setHeight(Math.max(140,height-h*lower));for(let i=1;i<panes.length;i++)panes[i].setHeight(h);}
 summaries(){return this.bundles.map(b=>({id:b.id,pane:b.pane,message:b.result.message,value:b.result.plots[0]?.values.filter(Number.isFinite).at(-1)}));}
}
