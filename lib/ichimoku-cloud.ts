import type { IChartApi, IPrimitivePaneView, ISeriesApi, ISeriesPrimitive, Logical, SeriesAttachedParameter, Time } from 'lightweight-charts';
import type { Candle } from './market';
import type { StudyConfig } from './indicator-catalog';
import type { StudyResult } from './study-calculations';
import { cloudSegments, type CloudPoint } from './study-cloud';

export class IchimokuCloud implements ISeriesPrimitive<Time> {
  private chart?: IChartApi;
  private series?: ISeriesApi<'Line'>;
  private request?: () => void;
  private points: Array<CloudPoint | null> = [];
  constructor(private config: StudyConfig) {}
  attached(params: SeriesAttachedParameter<Time>) {
    this.chart=params.chart;this.series=params.series as ISeriesApi<'Line'>;this.request=params.requestUpdate;
  }
  detached() { this.chart=undefined;this.series=undefined;this.request=undefined; }
  update(data: Candle[], result?: StudyResult) {
    const a=result?.plots[2],b=result?.plots[3];
    this.points=data.map((_,i)=>{
      const ai=i-(a?.offset??0),bi=i-(b?.offset??0),av=a?.values[ai],bv=b?.values[bi];
      return Number.isFinite(av)&&Number.isFinite(bv)?{x:i,a:av!,b:bv!}:null;
    });
    this.request?.();
  }
  paneViews(): IPrimitivePaneView[] {
    return [{zOrder:()=> 'bottom',renderer:()=>({draw:target=>target.useMediaCoordinateSpace(({context:ctx,mediaSize})=>{
      if(!this.chart||!this.series||this.config.inputs.cloud===0)return;
      const scale=this.chart.timeScale(),visible=scale.getVisibleLogicalRange();if(!visible)return;
      const points=this.points.slice(Math.max(0,Math.floor(visible.from)-1),Math.min(this.points.length,Math.ceil(visible.to)+2));
      ctx.save();ctx.beginPath();ctx.rect(0,0,mediaSize.width,mediaSize.height);ctx.clip();
      ctx.globalAlpha=this.config.opacity/100*.16;
      for(const segment of cloudSegments(points)) {
        const x1=scale.logicalToCoordinate(segment.left.x as Logical),x2=scale.logicalToCoordinate(segment.right.x as Logical);
        const a1=this.series.priceToCoordinate(segment.left.a),a2=this.series.priceToCoordinate(segment.right.a);
        const b1=this.series.priceToCoordinate(segment.left.b),b2=this.series.priceToCoordinate(segment.right.b);
        if(x1===null||x2===null||a1===null||a2===null||b1===null||b2===null)continue;
        ctx.fillStyle=this.config.colors[segment.bullish?5:6];ctx.beginPath();
        ctx.moveTo(x1,a1);ctx.lineTo(x2,a2);ctx.lineTo(x2,b2);ctx.lineTo(x1,b1);ctx.closePath();ctx.fill();
      }
      ctx.restore();
    })})}];
  }
}
