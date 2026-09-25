import type { Anchor, DrawingOptions, DrawingStyle, Geometry, Point, Viewport } from "lightweight-charts-drawing";
import type { IPrimitivePaneView, Logical } from "lightweight-charts";
import { buildVolumeProfile, volumeValueArea, type VolumeCandle } from "./volume-profile.ts";
import { istSessionStart } from "./profile-range.ts";
import type { ProfileMode } from "./profile-range.ts";
import type { ProfileData } from "./profile-data-client.ts";
import { drawingLogicalAtTime } from "./drawing-coordinates.ts";
import { EXTRA_DRAWING_TOOLS } from "./drawing-extras.ts";
import { paintDrawingLabels, type DrawingLabel } from "./drawing-label-layout.ts";
const readableFont = () => "13px sans-serif";

function centerPositionAnchors(type: string, center: Anchor, source: VolumeCandle[]): Anchor[] {
  const price = center.price;
  const time = Number(center.time);
  const times = source.map((candle) => Number(candle.time)).filter(Number.isFinite).sort((a, b) => a - b);
  const gaps = times.slice(1).map((value, index) => value - times[index]).filter((gap) => gap > 0).sort((a, b) => a - b);
  const step = gaps[Math.floor(gaps.length / 2)] || (time > 10_000 ? 86_400 : 1);
  const half = step * 6;
  const risk = Math.abs(price) * 0.015 || 1;
  const long = type === "long-position";
  const at = (offset: number) => (Number.isFinite(time) ? time + offset : center.time) as Anchor["time"];
  return [
    { time: at(0), price },
    { time: at(-half), price: price + (long ? -risk : risk) },
    { time: at(half), price: price + (long ? risk * 2 : -risk * 2) },
  ];
}

export function createChartDrawingRegistry(drawing: typeof import("lightweight-charts-drawing"), candles: () => VolumeCandle[], plotSize?: () => { width: number; height: number; dark?: boolean }, profileSource?: (from:number,to:number,mode:ProfileMode,id:string)=>ProfileData) {
  // A registry belongs to one chart; replay and live charts must not share a data-source closure.
  type Entry = NonNullable<ReturnType<ReturnType<typeof drawing.getToolRegistry>["get"]>>;
  const entries = new Map(drawing.getToolRegistry().getAll().map(entry => [entry.type, entry]));
  const registry = {
    register(entry: Entry) { entries.set(entry.type, entry); },
    get(type: string) { return entries.get(type); },
    getAll() { return [...entries.values()]; },
    createDrawing(type: string, id: string, anchors?: Anchor[], style?: Partial<DrawingStyle>, options?: Partial<DrawingOptions>) {
      const item=entries.get(type)?.factory(id, anchors, style, options) as InstanceType<typeof drawing.Drawing> | undefined;if(!item)return null;
      const getViewport=item.getViewport.bind(item);
      item.getViewport=()=>{
        const viewport=getViewport();if(!viewport)return null;
        const native=viewport.timeScale.timeToCoordinate;
        return {...viewport,height:plotSize?.().height??viewport.height,timeScale:{...viewport.timeScale,timeToCoordinate:time=>{
          const x=native(time);if(x!==null)return x;
          const logical=drawingLogicalAtTime(Number(time),candles().map(c=>c.time));
          return logical===null?null:viewport.timeScale.logicalToCoordinate(logical as Logical);
        }}};
      };
      if(!["long-position","short-position","price-range","fib-retracement","volume-profile","anchored-volume-profile","session-volume-profile",...EXTRA_DRAWING_TOOLS.map(t=>t.id)].includes(type)) {
        const nativeViews=item.paneViews.bind(item);
        // Preserve specialized shapes (arrowheads, channels, risk/reward, etc.)
        // while normalizing their canvas units and transparent label treatment.
        item.paneViews=()=>nativeViews().map(view=>({zOrder:()=>view.zOrder?.()??"normal",renderer:()=>({draw:target=>target.useMediaCoordinateSpace(scope=>{
          const viewport=item.getViewport();if(!viewport)return;
          scope.context.save();scope.context.beginPath();scope.context.rect(0,0,viewport.width,viewport.height);scope.context.clip();
          let labelBox=false;
          const labels: DrawingLabel[] = [];
          const baseTransform=scope.context.getTransform();
          const context=new Proxy(scope.context,{
            get(ctx,key){
              if(key==="beginPath")return ()=>{labelBox=false;ctx.beginPath();};
              if(key==="roundRect")return (...args:Parameters<CanvasRenderingContext2D["roundRect"]>)=>{labelBox=true;ctx.roundRect(...args);};
              if(key==="fill")return (...args:unknown[])=>{if(!labelBox)Reflect.apply(ctx.fill,ctx,args);};
              if(key==="stroke")return (...args:unknown[])=>{if(!labelBox)Reflect.apply(ctx.stroke,ctx,args);};
              if(key==="fillText")return (text:string,x:number,y:number,maxWidth?:number)=>{
                const point=baseTransform.inverse().multiply(ctx.getTransform()).transformPoint({x,y});
                labels.push({text,x:point.x,y:labelBox?point.y-10:point.y,align:ctx.textAlign,color:plotSize?.().dark?"#c4a2ff":item.style.lineColor});
              };
              const value=Reflect.get(ctx,key);return typeof value==="function"?value.bind(ctx):value;
            },
            set(ctx,key,value){return Reflect.set(ctx,key,key==="font"?readableFont():value);},
          });
          view.renderer()?.draw({useBitmapCoordinateSpace:callback=>callback({context,horizontalPixelRatio:1,verticalPixelRatio:1,bitmapSize:scope.mediaSize,mediaSize:scope.mediaSize}),useMediaCoordinateSpace:callback=>callback({...scope,context})} as Parameters<NonNullable<ReturnType<IPrimitivePaneView["renderer"]>>["draw"]>[0]);
          paintDrawingLabels(scope.context,labels,viewport.width,viewport.height);
          scope.context.restore();
        })})}));
      }
      return item;
    },
  };

  // Draw custom labels in CSS pixels, independent of the chart's backing-canvas ratio.
  const labeledPaneViews = (item: InstanceType<typeof drawing.Drawing>): IPrimitivePaneView[] => [{renderer:()=>({draw:target=>target.useMediaCoordinateSpace(({context:ctx})=>{
    const viewport=item.getViewport();if(!viewport||!item.options.visible)return;
    const size=plotSize?.()??viewport;
    ctx.save();ctx.beginPath();ctx.rect(0,0,size.width,size.height);ctx.clip();
    ctx.strokeStyle=item.style.lineColor;ctx.lineWidth=item.style.lineWidth;ctx.setLineDash(item.style.lineDash??[]);
    const labels: DrawingLabel[] = [];
    for(const geometry of item.computeGeometry(viewport)) {
      if(geometry.type==="line"){ctx.beginPath();ctx.moveTo(geometry.start.x,geometry.start.y);ctx.lineTo(geometry.end.x,geometry.end.y);ctx.stroke();}
      if(geometry.type==="text") {
        labels.push({text:geometry.text,x:geometry.position.x,y:geometry.position.y,align:geometry.align??"left",color:geometry.color??(plotSize?.().dark?"#c4a2ff":item.style.lineColor),fontSize:geometry.font?parseInt(geometry.font):12});
      }
    }
    paintDrawingLabels(ctx,labels,size.width,size.height);
    if(["selected","editing","hovered"].includes(item.state)) {
      ctx.setLineDash([]);ctx.lineWidth=1.5;
      for(const point of item.getControlPoints(viewport)){ctx.beginPath();ctx.arc(point.x,point.y,4,0,Math.PI*2);ctx.fillStyle=plotSize?.().dark?"#0c142b":"white";ctx.fill();ctx.stroke();}
    }
    ctx.restore();
  })})}];

  class PositionDrawing extends drawing.Drawing {
    readonly type: string;
    constructor(type: string,id:string,anchors:Anchor[]=[],style:Partial<DrawingStyle>={},options:Partial<DrawingOptions>={}) { super(id,anchors.length===1?centerPositionAnchors(type,anchors[0],candles()):anchors,style,options); this.type=type; }
    setAnchors(anchors: Anchor[]) { super.setAnchors(anchors.length===1?centerPositionAnchors(this.type,anchors[0],candles()):anchors); }
    updateAnchor(index: number, anchor: Anchor) {
      const current=this.anchors[index]; if(!current) return;
      this.setAnchors(this.anchors.map((item,itemIndex)=>itemIndex===index?{...item,price:anchor.price}:item));
    }
    isValid() { return this.anchors.length >= 3; }
    getControlPoints(viewport: Viewport) {
      const box=this.positionBox(viewport); if(!box) return [];
      const x=(box.left+box.end)/2;
      return [{x,y:box.entry.y,index:0},{x,y:box.stop.y,index:1},{x,y:box.target.y,index:2}];
    }
    positionBox(viewport: Viewport) {
      if (!this.isValid()) return null;
      const points=this.anchors.map(a=>this.anchorToPixel(a,viewport));
      if(points.some(p=>!p)) return null;
      const [entry,stop,target]=points as Point[];
      const left=Math.min(entry.x,stop.x,target.x), right=Math.max(entry.x,stop.x,target.x);
      const end=right-left<8?left+64:right;
      if(end<0||left>(plotSize?.().width??viewport.width)) return null;
      return {entry,stop,target,left,end};
    }
    computeGeometry(viewport: Viewport): (Geometry & { fill?: string })[] {
      const box=this.positionBox(viewport); if(!box) return [];
      const {entry,stop,target,left,end}=box, [e,s,t]=this.anchors.map(a=>a.price), center=(left+end)/2;
      const sign=this.type==="long-position"?1:-1, reward=(t-e)*sign, risk=(e-s)*sign;
      const riskColor=plotSize?.().dark?"#ff819b":"#ce355b", rewardColor=plotSize?.().dark?"#40dfb4":"#00876b";
      const zone=(y:number,fill:string):Geometry & {fill:string}=>({type:"polygon",closed:true,points:[{x:left,y:entry.y},{x:end,y:entry.y},{x:end,y},{x:left,y}],fill});
      const delta=(n:number)=>`${n>=0?"+":""}${n.toFixed(2)} (${n>=0?"+":""}${(e?n/e*100:0).toFixed(2)}%)`;
      return [zone(target.y,"rgba(0,174,132,.19)"),zone(stop.y,"rgba(242,62,103,.18)"),
        {type:"line",start:{x:left,y:entry.y},end:{x:end,y:entry.y}},
        {type:"line",start:{x:left,y:stop.y},end:{x:end,y:stop.y}},
        {type:"line",start:{x:left,y:target.y},end:{x:end,y:target.y}},
        {type:"text",position:{x:center,y:target.y+(target.y<entry.y?-10:22)},text:`${t.toFixed(2)} · ${delta(reward)}`,align:"center",color:rewardColor},
        {type:"text",position:{x:center,y:entry.y-6},text:`${e.toFixed(2)} · ${risk>0&&reward>=0?`1:${(reward/risk).toFixed(2)}`:"—"}`,align:"center",color:plotSize?.().dark?"#c4a2ff":"#7653bd"},
        {type:"text",position:{x:center,y:stop.y+(stop.y<entry.y?-10:22)},text:`${s.toFixed(2)} · ${delta(-risk)}`,align:"center",color:riskColor},
      ];
    }
    paneViews():IPrimitivePaneView[] {return [{renderer:()=>({draw:target=>target.useMediaCoordinateSpace(({context:ctx})=>{
      const viewport=this.getViewport();if(!viewport||!this.options.visible)return;
      const size=plotSize?.()??viewport, labels:DrawingLabel[]=[];
      ctx.save();ctx.beginPath();ctx.rect(0,0,size.width,size.height);ctx.clip();
      for(const g of this.computeGeometry(viewport)) {
        if(g.type==="polygon") {ctx.beginPath();g.points.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.closePath();ctx.fillStyle=g.fill!;ctx.fill();}
        else if(g.type==="line") {ctx.beginPath();ctx.moveTo(g.start.x,g.start.y);ctx.lineTo(g.end.x,g.end.y);ctx.strokeStyle=plotSize?.().dark?"#a694d0":"#8c81a7";ctx.lineWidth=1;ctx.stroke();}
        else if(g.type==="text")labels.push({text:g.text,x:g.position.x,y:g.position.y,align:g.align,color:g.color});
      }
      paintDrawingLabels(ctx,labels,size.width,size.height);
      if(["selected","editing","hovered"].includes(this.state))for(const p of this.getControlPoints(viewport)){ctx.beginPath();ctx.arc(p.x,p.y,4,0,Math.PI*2);ctx.fillStyle="#fff";ctx.fill();ctx.strokeStyle="#8657d9";ctx.stroke();}
      ctx.restore();
    })})}];}
    testHit(point:Point,viewport:Viewport) {return this.computeGeometry(viewport).some(g=>g.type==="polygon"&&point.x>=Math.min(...g.points.map(p=>p.x))&&point.x<=Math.max(...g.points.map(p=>p.x))&&point.y>=Math.min(...g.points.map(p=>p.y))-5&&point.y<=Math.max(...g.points.map(p=>p.y))+5);}
    clone(id:string){return new PositionDrawing(this.type,id,[...this.anchors],this.style,this.options);}
  }
  class ManualPattern extends drawing.Drawing {
    readonly type:string;
    constructor(type:string,id:string,anchors:Anchor[]=[],style:Partial<DrawingStyle>={},options:Partial<DrawingOptions>={}){super(id,anchors,style,options);this.type=type;}
    definition(){return EXTRA_DRAWING_TOOLS.find(t=>t.id===this.type)!;}
    isValid(){return this.anchors.length>=this.definition().anchors;}
    paneViews(){return labeledPaneViews(this);}
    computeGeometry(viewport:Viewport):Geometry[]{
      if(!this.isValid())return [];
      const points=this.anchors.map(a=>this.anchorToPixel(a,viewport));if(points.some(p=>!p))return [];
      const p=points as Point[],definition=this.definition(), geometry:Geometry[]=[];
      const line=(a:Point,b:Point)=>geometry.push({type:"line",start:a,end:b});
      if(definition.category==="Visuals")return [{type:"text",position:p[0],text:definition.labels,align:"center",font:"24px sans-serif"}];
      if(["cyclic-lines","time-cycles","sine-line"].includes(this.type)) {
        const span=Math.max(12,Math.abs(p[1].x-p[0].x)),left=Math.min(p[0].x,p[1].x),width=plotSize?.().width??viewport.width;
        if(this.type==="cyclic-lines") {for(let x=left-Math.ceil(left/span)*span;x<=width;x+=span)line({x,y:0},{x,y:viewport.height});}
        else {
          const start=Math.max(0,left-Math.ceil(left/span)*span),base=Math.max(p[0].y,p[1].y),height=Math.max(12,Math.abs(p[0].y-p[1].y));
          let prev:Point|undefined;
          for(let x=start;x<=width;x+=3){const phase=(x-left)/span*Math.PI*2,y=this.type==="sine-line"?(p[0].y+p[1].y)/2-Math.sin(phase)*height/2:base-Math.abs(Math.sin(phase/2))*height;const next={x,y};if(prev)line(prev,next);prev=next;}
        }
        return geometry;
      }
      p.forEach((point,i)=>{if(i)line(p[i-1],point);geometry.push({type:"text",position:{x:point.x,y:point.y+(i%2? -12:22)},text:definition.labels.split(" ")[i]??String(i),align:"center",font:readableFont()});});
      if(["xabcd-pattern","cypher-pattern"].includes(this.type)){line(p[0],p[2]);line(p[2],p[4]);line(p[1],p[3]);}
      if(this.type==="triangle-pattern"){line(p[0],p[4]);line(p[1],p[3]);}
      if(this.type==="head-shoulders")line(p[2],p[4]);
      return geometry;
    }
    testHit(point:Point,viewport:Viewport){return this.computeGeometry(viewport).some(g=>{
      if(g.type==="text")return Math.hypot(point.x-g.position.x,point.y-g.position.y)<16;
      if(g.type!=="line")return false;const dx=g.end.x-g.start.x,dy=g.end.y-g.start.y,d=dx*dx+dy*dy,t=d?Math.max(0,Math.min(1,((point.x-g.start.x)*dx+(point.y-g.start.y)*dy)/d)):0;
      return Math.hypot(point.x-g.start.x-t*dx,point.y-g.start.y-t*dy)<7;
    });}
    clone(id:string){return new ManualPattern(this.type,id,[...this.anchors],this.style,this.options);}
  }

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
  for(const type of ["long-position","short-position"])registry.register({...registry.get(type)!,requiredAnchors:1,factory:(id,anchors,style,options)=>new PositionDrawing(type,id,anchors??[],style,options)});
  for(const tool of EXTRA_DRAWING_TOOLS)registry.register({type:tool.id,name:tool.label,category:"shape",requiredAnchors:tool.anchors,factory:(id,anchors,style,options)=>new ManualPattern(tool.id,id,anchors,style,options)});
  for (const [type,name,Tool] of [["price-range","Price measurement",PriceMeasurement],["volume-profile","Fixed-range volume profile",VolumeProfile]] as const) {
    registry.register({type,name,category:"measurement",requiredAnchors:2,factory:(id:string,anchors?:Anchor[],style?:Partial<DrawingStyle>,options?:Partial<DrawingOptions>)=>new Tool(id,anchors,style,options)});
  }
  for(const [type,name,Tool] of [["anchored-volume-profile","Anchored volume profile",AnchoredVolumeProfile],["session-volume-profile","Session volume profile",SessionVolumeProfile]] as const)registry.register({type,name,category:"measurement",requiredAnchors:1,factory:(id,anchors,style,options)=>new Tool(id,anchors,style,options)});
  return registry;
}
