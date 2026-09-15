import type { Anchor, DrawingOptions, DrawingStyle, Geometry, Point, Viewport } from "lightweight-charts-drawing";
import type { IPrimitivePaneView } from "lightweight-charts";
import { buildVolumeProfile, type VolumeCandle } from "./volume-profile.ts";

export function createChartDrawingRegistry(drawing: typeof import("lightweight-charts-drawing"), candles: () => VolumeCandle[], plotSize?: () => { width: number; height: number }) {
  // A registry belongs to one chart; replay and live charts must not share a data-source closure.
  type Entry = NonNullable<ReturnType<ReturnType<typeof drawing.getToolRegistry>["get"]>>;
  const entries = new Map(drawing.getToolRegistry().getAll().map(entry => [entry.type, entry]));
  const registry = {
    register(entry: Entry) { entries.set(entry.type, entry); },
    get(type: string) { return entries.get(type); },
    getAll() { return [...entries.values()]; },
    createDrawing(type: string, id: string, anchors?: Anchor[], style?: Partial<DrawingStyle>, options?: Partial<DrawingOptions>) { return entries.get(type)?.factory(id, anchors, style, options) ?? null; },
  };

  class PriceMeasurement extends drawing.Drawing {
    readonly type = "price-range";
    setAnchors(anchors: Anchor[]) { const time = anchors.at(-1)?.time; super.setAnchors(anchors.map(a => ({ ...a, time: time ?? a.time }))); }
    updateAnchor(index: number, anchor: Anchor) { const anchors = this.anchors.map((a,i) => ({ ...(i === index ? anchor : a), time: anchor.time })); this.setAnchors(anchors); }
    paneViews() { return [new drawing.DrawingPaneView(this)]; }
    isValid() { return this.anchors.length >= 2; }
    computeGeometry(viewport: Viewport): Geometry[] {
      if (!this.isValid()) return [];
      const a = this.anchorToPixel(this.anchors[0], viewport), b = this.anchorToPixel(this.anchors[1], viewport);
      if (!a || !b) return [];
      const x = b.x, start = this.anchors[0].price, delta = this.anchors[1].price - start;
      const sign = delta > 0 ? "+" : "", label = `${sign}${delta.toFixed(2)} (${sign}${(start ? delta / start * 100 : 0).toFixed(2)}%)`;
      const direction = b.y < a.y ? 1 : -1;
      return [
        { type: "line", start: {x, y:a.y}, end: {x, y:b.y} },
        ...[a.y,b.y].map(y => ({ type: "line" as const, start:{x:x-12,y}, end:{x:x+12,y} })),
        { type:"line", start:{x:x-5,y:b.y+7*direction}, end:{x,y:b.y} },
        { type:"line", start:{x:x+5,y:b.y+7*direction}, end:{x,y:b.y} },
        { type:"text", position:{x:Math.max(80,Math.min(viewport.width-80,x)),y:Math.max(16,Math.min(a.y,b.y)-12)}, text:label, align:"center", color:this.style.lineColor },
      ];
    }
    testHit(point: Point, viewport: Viewport) {
      if (!this.isValid()) return false;
      const a=this.anchorToPixel(this.anchors[0],viewport),b=this.anchors[1]&&this.anchorToPixel(this.anchors[1],viewport);
      return !!a&&!!b&&Math.abs(point.x-b.x)<14&&point.y>=Math.min(a.y,b.y)-12&&point.y<=Math.max(a.y,b.y)+12;
    }
    clone(id: string) { return new PriceMeasurement(id,[...this.anchors],this.style,this.options); }
  }

  class VolumeProfile extends drawing.Drawing {
    readonly type = "volume-profile";
    paneViews(): IPrimitivePaneView[] { return [{ renderer: () => ({ draw: target => target.useMediaCoordinateSpace(({context: ctx}) => {
      const viewport = this.getViewport();
      if (!viewport || !this.options.visible) return;
      const size = plotSize?.() ?? viewport;
      ctx.save(); ctx.beginPath(); ctx.rect(0,0,size.width,size.height); ctx.clip();
      for (const geometry of this.profileGeometry(viewport)) {
        if (geometry.type === "polygon") {
          ctx.beginPath(); geometry.points.forEach((p,i) => i ? ctx.lineTo(p.x,p.y) : ctx.moveTo(p.x,p.y)); ctx.closePath(); ctx.fillStyle = geometry.fill ?? "#688ef5"; ctx.fill();
        } else if (geometry.type === "line") {
          ctx.beginPath(); ctx.moveTo(geometry.start.x,geometry.start.y); ctx.lineTo(geometry.end.x,geometry.end.y); ctx.strokeStyle = "#b575ba"; ctx.lineWidth = 1; ctx.stroke();
        } else if (geometry.type === "text") {
          ctx.fillStyle = "#8a7ea3"; ctx.font = "11px sans-serif"; ctx.textAlign = "right"; ctx.fillText(geometry.text,geometry.position.x,geometry.position.y);
        }
      }
      if (this.state === "selected" || this.state === "editing") {
        const controls = this.getControlPoints(viewport);
        ctx.setLineDash([3,4]); ctx.strokeStyle = "#a78bfa";
        for (const point of controls) { ctx.beginPath(); ctx.moveTo(point.x,0); ctx.lineTo(point.x,size.height); ctx.stroke(); }
        ctx.setLineDash([]);
        for (const point of controls) { ctx.beginPath(); ctx.arc(point.x,point.y,6,0,Math.PI*2); ctx.fillStyle="#fff"; ctx.fill(); ctx.strokeStyle="#8b5cf6";ctx.stroke(); }
      }
      ctx.restore();
    }) }) }]; }
    isValid() { return this.anchors.length >= 2; }
    computeGeometry(viewport: Viewport): Geometry[] { return this.profileGeometry(viewport); }
    profileGeometry(viewport: Viewport): (Geometry & {fill?: string})[] {
      if (!this.isValid()) return [];
      const a=this.anchorToPixel(this.anchors[0],viewport), b=this.anchorToPixel(this.anchors[1],viewport);
      if (!a||!b) return [];
      const bins=buildVolumeProfile(candles(),Number(this.anchors[0].time),Number(this.anchors[1].time));
      const size=plotSize?.()??viewport, right=Math.max(0,size.width-2), width=Math.min(180,size.width*.32);
      if (!bins.length) return [{type:"text",position:{x:right-4,y:80},text:"Volume unavailable for this range",align:"right"}];
      const max=Math.max(...bins.map(bin=>bin.volume));
      const geometry: (Geometry & {fill?:string})[]=[];
      const peakIndex=bins.findIndex(bin=>bin.volume===max);
      let left=peakIndex, high=peakIndex, covered=max;
      const total=bins.reduce((n,bin)=>n+bin.volume,0);
      while(covered<total*.7&&(left>0||high<bins.length-1)) {
        if(left>0&&(high===bins.length-1||bins[left-1].volume>=bins[high+1].volume)) covered+=bins[--left].volume;
        else covered+=bins[++high].volume;
      }
      for (const [index,bin] of bins.entries()) {
        const top=viewport.priceScale.priceToCoordinate(bin.high),bottom=viewport.priceScale.priceToCoordinate(bin.low);
        if(top===null||bottom===null)continue;
        const y=Math.max(0,Math.min(top,bottom)), floor=Math.min(size.height,Math.max(top,bottom)-.5);
        if(floor<=y||bin.volume<=0)continue;
        const x=right-width*bin.volume/max, split=right-width*bin.upVolume/max, valueArea=index>=left&&index<=high;
        for(const [start,end,fill] of [[x,split,valueArea?"#f45b9b":"#efb3d0"],[split,right,valueArea?"#5d8ff0":"#a1dbe1"]] as const) {
          if(end>start)geometry.push({type:"polygon",closed:true,fill,points:[{x:start,y},{x:end,y},{x:end,y:floor},{x:start,y:floor}]});
        }
      }
      const peak=bins.reduce((best,bin)=>bin.volume>best.volume?bin:best,bins[0]);
      const poc=viewport.priceScale.priceToCoordinate((peak.low+peak.high)/2);
      if(poc!==null&&poc>=0&&poc<=size.height)geometry.push({type:"line",start:{x:0,y:poc},end:{x:right,y:poc}});
      if(this.state==="selected"||this.state==="editing")geometry.push({type:"text",position:{x:right-4,y:size.height-10},text:"Candle-volume estimate · 70% value area",align:"right"});
      return geometry;
    }
    testHit(point: Point, viewport: Viewport) {
      return this.computeGeometry(viewport).some(g=>g.type==="polygon"&&point.x>=g.points[0].x&&point.x<=g.points[1].x&&point.y>=g.points[0].y&&point.y<=g.points[2].y);
    }
    clone(id: string) { return new VolumeProfile(id,[...this.anchors],this.style,this.options); }
  }
  class LabeledFibonacci extends drawing.FibRetracement {
    paneViews() { return [new drawing.DrawingPaneView(this)]; }
    computeGeometry(viewport: Viewport): Geometry[] {
      const geometry=super.computeGeometry(viewport);
      if(!this.isValid())return geometry;
      const a=this.anchorToPixel(this.anchors[0],viewport),b=this.anchorToPixel(this.anchors[1],viewport);
      if(!a||!b)return geometry;
      for(const level of this.fibOptions.levels??[]) {
        const y=viewport.priceScale.priceToCoordinate(this.getPriceAtLevel(level));
        if(y===null||y<0||y>viewport.height)continue;
        geometry.push({type:"text",position:{x:Math.min(viewport.width-36,Math.max(a.x,b.x)+4),y:y-3},text:String(level),color:this.style.lineColor});
      }
      return geometry;
    }
    toJSON() { return {...super.toJSON(), options:{...this.options,...this.fibOptions}}; }
    clone(id:string) { return new LabeledFibonacci(id,[...this.anchors],this.style,this.fibOptions); }
  }
  registry.register({...registry.get("fib-retracement")!,factory:(id,anchors,style,options)=>new LabeledFibonacci(id,anchors,style,options)});
  for (const [type,name,Tool] of [["price-range","Price measurement",PriceMeasurement],["volume-profile","Fixed-range volume profile",VolumeProfile]] as const) {
    registry.register({type,name,category:"measurement",requiredAnchors:2,factory:(id:string,anchors?:Anchor[],style?:Partial<DrawingStyle>,options?:Partial<DrawingOptions>)=>new Tool(id,anchors,style,options)});
  }
  return registry;
}
