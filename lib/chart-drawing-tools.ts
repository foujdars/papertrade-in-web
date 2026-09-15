import type { Anchor, DrawingOptions, DrawingStyle, Geometry, Point, Viewport } from "lightweight-charts-drawing";
import type { IPrimitivePaneView } from "lightweight-charts";
import { buildVolumeProfile, volumeValueArea, type VolumeCandle } from "./volume-profile.ts";
import { istSessionStart } from "./profile-range.ts";
import type { ProfileMode } from "./profile-range.ts";
import type { ProfileData } from "./profile-data-client.ts";
const readableFont = () => "13px sans-serif";

export function createChartDrawingRegistry(drawing: typeof import("lightweight-charts-drawing"), candles: () => VolumeCandle[], plotSize?: () => { width: number; height: number; dark?: boolean }, profileSource?: (from:number,to:number,mode:ProfileMode,id:string)=>ProfileData) {
  // A registry belongs to one chart; replay and live charts must not share a data-source closure.
  type Entry = NonNullable<ReturnType<ReturnType<typeof drawing.getToolRegistry>["get"]>>;
  const entries = new Map(drawing.getToolRegistry().getAll().map(entry => [entry.type, entry]));
  const registry = {
    register(entry: Entry) { entries.set(entry.type, entry); },
    get(type: string) { return entries.get(type); },
    getAll() { return [...entries.values()]; },
    createDrawing(type: string, id: string, anchors?: Anchor[], style?: Partial<DrawingStyle>, options?: Partial<DrawingOptions>) { return entries.get(type)?.factory(id, anchors, style, options) ?? null; },
  };

  // Draw custom labels in CSS pixels, independent of the chart's backing-canvas ratio.
  const labeledPaneViews = (item: InstanceType<typeof drawing.Drawing>): IPrimitivePaneView[] => [{renderer:()=>({draw:target=>target.useMediaCoordinateSpace(({context:ctx})=>{
    const viewport=item.getViewport();if(!viewport||!item.options.visible)return;
    const size=plotSize?.()??viewport;
    ctx.save();ctx.beginPath();ctx.rect(0,0,size.width,size.height);ctx.clip();
    ctx.strokeStyle=item.style.lineColor;ctx.lineWidth=item.style.lineWidth;ctx.setLineDash(item.style.lineDash??[]);
    for(const geometry of item.computeGeometry(viewport)) {
      if(geometry.type==="line"){ctx.beginPath();ctx.moveTo(geometry.start.x,geometry.start.y);ctx.lineTo(geometry.end.x,geometry.end.y);ctx.stroke();}
      if(geometry.type==="text") {
        ctx.font=readableFont();ctx.textAlign=geometry.align??"left";ctx.textBaseline="bottom";
        const width=ctx.measureText(geometry.text).width;
        const offset=ctx.textAlign==="center"?width/2:ctx.textAlign==="right"?width:0;
        const x=Math.max(offset+3,Math.min(size.width-width+offset-3,geometry.position.x)),y=Math.max(15,Math.min(size.height-3,geometry.position.y));
        ctx.fillStyle=plotSize?.().dark?"#0c142b":"#ffffff";ctx.fillRect(x-offset-2,y-14,width+4,15);
        ctx.fillStyle=geometry.color??item.style.lineColor;ctx.fillText(geometry.text,x,y);
      }
    }
    if(["selected","editing","hovered"].includes(item.state)) {
      ctx.setLineDash([]);ctx.lineWidth=1.5;
      for(const point of item.getControlPoints(viewport)){ctx.beginPath();ctx.arc(point.x,point.y,4,0,Math.PI*2);ctx.fillStyle=plotSize?.().dark?"#0c142b":"white";ctx.fill();ctx.stroke();}
    }
    ctx.restore();
  })})}];

  class PriceMeasurement extends drawing.Drawing {
    readonly type = "price-range";
    setAnchors(anchors: Anchor[]) { const time = anchors.at(-1)?.time; super.setAnchors(anchors.map(a => ({ ...a, time: time ?? a.time }))); }
    updateAnchor(index: number, anchor: Anchor) { const anchors = this.anchors.map((a,i) => ({ ...(i === index ? anchor : a), time: anchor.time })); this.setAnchors(anchors); }
    paneViews() { return labeledPaneViews(this); }
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
        { type:"text", position:{x:Math.max(80,Math.min((plotSize?.().width??viewport.width)-80,x)),y:Math.max(16,Math.min(a.y,b.y)-12)}, text:label, font:readableFont(), align:"center", color:this.style.lineColor },
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
    readonly type: string = "volume-profile";
    readonly mode: ProfileMode = "fixed";
    paneViews(): IPrimitivePaneView[] { return [{ renderer: () => ({ draw: target => target.useMediaCoordinateSpace(({context: ctx}) => {
      const viewport = this.getViewport();
      if (!viewport || !this.options.visible) return;
      const size = plotSize?.() ?? viewport;
      ctx.save(); ctx.beginPath(); ctx.rect(0,0,size.width,size.height); ctx.clip();
      for (const geometry of this.profileGeometry(viewport)) {
        if (geometry.type === "polygon") {
          ctx.beginPath(); geometry.points.forEach((p,i) => i ? ctx.lineTo(p.x,p.y) : ctx.moveTo(p.x,p.y)); ctx.closePath(); ctx.fillStyle = geometry.fill ?? "#688ef5"; ctx.fill();
        } else if (geometry.type === "line") {
          ctx.beginPath(); ctx.moveTo(geometry.start.x,geometry.start.y); ctx.lineTo(geometry.end.x,geometry.end.y); ctx.strokeStyle = plotSize?.().dark ? "#e8e3f4" : "#191724"; ctx.lineWidth = 2; ctx.stroke();
        } else if (geometry.type === "text") {
          ctx.fillStyle = plotSize?.().dark ? "#c8bddc" : "#635776"; ctx.font = "12px sans-serif"; ctx.textAlign = "right"; ctx.fillText(geometry.text,geometry.position.x,geometry.position.y,Math.max(40,size.width-16));
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
    isValid() { return this.anchors.length >= (this.mode==="fixed"?2:1); }
    computeGeometry(viewport: Viewport): Geometry[] { return this.profileGeometry(viewport); }
    profileGeometry(viewport: Viewport): (Geometry & {fill?: string})[] {
      if (!this.isValid()) return [];
      const a=this.anchorToPixel(this.anchors[0],viewport), b=this.anchorToPixel(this.anchors[this.mode==="fixed"?1:0],viewport);
      if (!a||!b) return [];
      const from=Number(this.anchors[0].time),to=this.mode==="fixed"?Number(this.anchors[1].time):candles().at(-1)?.time??from;
      const source=profileSource?.(from,to,this.mode,this.id);
      const data=source?.candles??candles().filter(c=>this.mode==="session"?istSessionStart(c.time)===istSessionStart(from):c.time>=Math.min(from,to)&&c.time<=Math.max(from,to));
      const bins=buildVolumeProfile(data,-Infinity,Infinity,24);
      const size=plotSize?.()??viewport;
      // FRVP scales to its selected range. Right-docked profiles keep a readable
      // 30% plot width even when their anchor is the latest candle near the axis.
      const right=this.mode==="fixed"?Math.max(a.x,b.x):Math.max(0,size.width-2),start=this.mode==="fixed"?Math.min(a.x,b.x):0,width=Math.max(1,(right-start)*.3);
      if (!bins.length) return [{type:"text",position:{x:size.width-8,y:size.height-12},text:source?.label??"Volume unavailable for this range",align:"right"}];
      const max=Math.max(...bins.map(bin=>bin.volume));
      const geometry: (Geometry & {fill?:string})[]=[];
      const {low:left,high}=volumeValueArea(bins);
      for (const [index,bin] of bins.entries()) {
        const top=viewport.priceScale.priceToCoordinate(bin.high),bottom=viewport.priceScale.priceToCoordinate(bin.low);
        if(top===null||bottom===null)continue;
        const y=Math.max(0,Math.min(top,bottom)), floor=Math.min(size.height,Math.max(top,bottom)-.5);
        if(floor<=y||bin.volume<=0)continue;
        const valueArea=index>=left&&index<=high,up=width*bin.upVolume/max,down=width*bin.downVolume/max;
        const sections=this.mode==="fixed"?[[start,start+up,valueArea?"#08bed0":"#95dbe0"],[start+up,start+up+down,valueArea?"#f45b9b":"#efb3d0"]] as const:[[right-up-down,right-up,valueArea?"#f45b9b":"#efb3d0"],[right-up,right,valueArea?"#5d8ff0":"#a1dbe1"]] as const;
        for(const [begin,end,fill] of sections) {
          const clippedStart=Math.max(0,begin),clippedEnd=Math.min(size.width-2,end);
          if(clippedEnd>clippedStart)geometry.push({type:"polygon",closed:true,fill,points:[{x:clippedStart,y},{x:clippedEnd,y},{x:clippedEnd,y:floor},{x:clippedStart,y:floor}]});
        }
      }
      const peak=bins.reduce((best,bin)=>bin.volume>best.volume?bin:best,bins[0]);
      const poc=viewport.priceScale.priceToCoordinate((peak.low+peak.high)/2);
      if(poc!==null&&poc>=0&&poc<=size.height&&right>=0&&start<size.width)geometry.push({type:"line",start:{x:Math.max(0,start),y:poc},end:{x:Math.min(size.width-2,right),y:poc}});
      if(this.state==="selected"||this.state==="editing")geometry.push({type:"text",position:{x:size.width-8,y:size.height-10},text:source?.label??"Candle-volume estimate · 70% value area",align:"right"});
      return geometry;
    }
    testHit(point: Point, viewport: Viewport) {
      return this.computeGeometry(viewport).some(g=>g.type==="polygon"&&point.x>=g.points[0].x&&point.x<=g.points[1].x&&point.y>=g.points[0].y&&point.y<=g.points[2].y);
    }
    clone(id: string) { return new VolumeProfile(id,[...this.anchors],this.style,this.options); }
  }
  class AnchoredVolumeProfile extends VolumeProfile { readonly type="anchored-volume-profile"; readonly mode:ProfileMode="anchored"; clone(id:string){return new AnchoredVolumeProfile(id,[...this.anchors],this.style,this.options);} }
  class SessionVolumeProfile extends VolumeProfile { readonly type="session-volume-profile"; readonly mode:ProfileMode="session"; clone(id:string){return new SessionVolumeProfile(id,[...this.anchors],this.style,this.options);} }
  class LabeledFibonacci extends drawing.FibRetracement {
    paneViews() { return labeledPaneViews(this); }
    computeGeometry(viewport: Viewport): Geometry[] {
      const geometry=super.computeGeometry(viewport);
      if(!this.isValid())return geometry;
      const a=this.anchorToPixel(this.anchors[0],viewport),b=this.anchorToPixel(this.anchors[1],viewport);
      if(!a||!b)return geometry;
      for(const level of this.fibOptions.levels??[]) {
        const y=viewport.priceScale.priceToCoordinate(this.getPriceAtLevel(level));
        if(y===null||y<0||y>viewport.height)continue;
        geometry.push({type:"text",position:{x:Math.max(4,Math.min((plotSize?.().width??viewport.width)-42,Math.max(a.x,b.x)+4)),y:y-3},text:String(level),font:readableFont(),color:plotSize?.().dark?"#c4a2ff":this.style.lineColor});
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
  for(const [type,name,Tool] of [["anchored-volume-profile","Anchored volume profile",AnchoredVolumeProfile],["session-volume-profile","Session volume profile",SessionVolumeProfile]] as const)registry.register({type,name,category:"measurement",requiredAnchors:1,factory:(id,anchors,style,options)=>new Tool(id,anchors,style,options)});
  return registry;
}
