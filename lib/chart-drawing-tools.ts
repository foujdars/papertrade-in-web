import type { Anchor, DrawingOptions, DrawingStyle, Geometry, Point, Viewport } from "lightweight-charts-drawing";
import { buildVolumeProfile, type VolumeCandle } from "./volume-profile.ts";

export function createChartDrawingRegistry(drawing: typeof import("lightweight-charts-drawing"), candles: () => VolumeCandle[]) {
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
    paneViews() { return [new drawing.DrawingPaneView(this)]; }
    isValid() { return this.anchors.length >= 2; }
    computeGeometry(viewport: Viewport): Geometry[] {
      if (!this.isValid()) return [];
      const a=this.anchorToPixel(this.anchors[0],viewport), b=this.anchorToPixel(this.anchors[1],viewport);
      if (!a||!b) return [];
      const bins=buildVolumeProfile(candles(),Number(this.anchors[0].time),Number(this.anchors[1].time));
      const x=Math.min(a.x,b.x), width=Math.max(20,Math.abs(b.x-a.x));
      if (!bins.length) return [{type:"text",position:{x:Math.max(90,Math.min(viewport.width-90,x+width/2)),y:Math.max(24,Math.min(a.y,b.y))},text:"Volume unavailable for this range",align:"center"}];
      const max=Math.max(...bins.map(bin=>bin.volume));
      const geometry: Geometry[]=[];
      for (const bin of bins) {
        const top=viewport.priceScale.priceToCoordinate(bin.high),bottom=viewport.priceScale.priceToCoordinate(bin.low);
        if(top===null||bottom===null)continue;
        const y=Math.min(top,bottom), right=x+width*.7*bin.volume/max, floor=y+Math.max(1,Math.abs(bottom-top)-1);
        geometry.push({type:"polygon",closed:true,points:[{x,y},{x:right,y},{x:right,y:floor},{x,y:floor}]});
      }
      const peak=bins.reduce((best,bin)=>bin.volume>best.volume?bin:best,bins[0]);
      const poc=viewport.priceScale.priceToCoordinate((peak.low+peak.high)/2);
      if(poc!==null)geometry.push({type:"line",start:{x,y:poc},end:{x:x+width,y:poc}});
      const top=viewport.priceScale.priceToCoordinate(bins.at(-1)!.high)??Math.min(a.y,b.y);
      geometry.push({type:"text",position:{x:Math.max(95,Math.min(viewport.width-95,x+width/2)),y:Math.max(16,top-12)},text:"Volume profile · OHLCV estimate",align:"center",color:this.style.lineColor});
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
