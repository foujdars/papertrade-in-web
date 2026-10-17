import type { IChartApi, IPrimitivePaneView, ISeriesApi, ISeriesPrimitive, Logical, SeriesAttachedParameter, Time } from 'lightweight-charts';
import type { Candle } from './market';
import type { StudyConfig } from './indicator-catalog';
import { anchoredVwapBands, type AnchoredVwapBand } from './anchored-vwap';

export class AnchoredVwapOverlay implements ISeriesPrimitive<Time> {
  chart?: IChartApi;
  series?: ISeriesApi<'Candlestick'|'Bar'|'Line'|'Area'|'Baseline'|'Histogram'>;
  request?: () => void;
  candles: Candle[] = [];
  anchor: number | null = null;
  private config?: StudyConfig;
  private points: Array<AnchoredVwapBand & {index:number}> = [];

  attached(params: SeriesAttachedParameter<Time>) {
    this.chart=params.chart;this.series=params.series as AnchoredVwapOverlay['series'];this.request=params.requestUpdate;
  }
  detached() {this.chart=undefined;this.series=undefined;this.request=undefined;}
  configure(config: StudyConfig) {this.config=config;}
  update(candles: Candle[], anchor: number | null) {
    this.candles=candles;this.anchor=anchor;
    const indices=new Map(candles.map((bar,i)=>[bar.time,i]));
    this.points=anchor===null?[]:anchoredVwapBands(candles,anchor,this.config?.source).map(point=>({...point,index:indices.get(point.time)!}));
    this.request?.();
  }
  paneViews(): IPrimitivePaneView[] {
    return [{renderer:()=>({draw:target=>target.useMediaCoordinateSpace(({context,mediaSize})=>this.paint(context,mediaSize.width,mediaSize.height))})}];
  }
  private paint(ctx: CanvasRenderingContext2D,width:number,height:number) {
    if(!this.chart||!this.series||!this.points.length)return;
    const config=this.config,scale=this.chart.timeScale(),visible=scale.getVisibleLogicalRange();
    const points=this.points.filter(p=>!visible||p.index>=Math.floor(visible.from)-1&&p.index<=Math.ceil(visible.to)+1);
    const pixel=(point:typeof points[number],multiple:number)=>{
      const x=scale.logicalToCoordinate(point.index as Logical),y=this.series!.priceToCoordinate(point.value+multiple*point.deviation);
      return x===null||y===null?null:{x,y};
    };
    ctx.save();ctx.beginPath();ctx.rect(0,0,width,height);ctx.clip();
    ctx.globalAlpha=(config?.opacity??100)/100;ctx.lineJoin='round';
    const multiplier=config?.inputs.bands??0;
    for(const multiple of multiplier>0?[multiplier,-multiplier,0]:[0]) {
      ctx.strokeStyle=config?.colors[multiple===0?0:multiple>0?1:2]??'#d946ef';
      ctx.lineWidth=multiple===0?(config?.width??3):1;
      ctx.setLineDash(multiple===0?([[],[1,2],[4,4],[8,4],[1,4]][config?.dash??0]):[4,4]);
      ctx.beginPath();let moved=false;
      for(const point of points){const p=pixel(point,multiple);if(!p){moved=false;continue;}if(moved)ctx.lineTo(p.x,p.y);else{ctx.moveTo(p.x,p.y);moved=true;}}
      ctx.stroke();
    }
    const first=this.points[0],label=pixel(first,0);
    if(label&&label.x>=0&&label.x<=width){ctx.font='700 10px Inter, system-ui, sans-serif';ctx.fillStyle=config?.colors[0]??'#d946ef';ctx.textAlign='left';ctx.textBaseline='bottom';ctx.fillText('AVWAP',label.x+4,Math.max(12,label.y-4));}
    ctx.restore();
  }
}
