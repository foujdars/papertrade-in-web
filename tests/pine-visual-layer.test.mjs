import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'vite';
import {PineTS} from 'pinets';
const server=await createServer({configFile:false,server:{middlewareMode:true},appType:'custom',optimizeDeps:{noDiscovery:true,entries:[]}});
const {PineVisualLayer,normalizePineVisuals,pineLineGeometry,extractPineBarColors,pineVisualWarnings}=await server.ssrLoadModule('/lib/pine-visual-layer.ts');
test.after(()=>server.close());
const candles=Array.from({length:4},(_,i)=>({time:1700000000+i*60,open:10+i,high:12+i,low:9+i,close:11+i,volume:100}));
function canvas(){
 const calls=[];const ctx=new Proxy({calls,measureText:v=>({width:String(v).length*6})},{get(target,key){if(key in target)return target[key];return (...args)=>calls.push([key,...args]);},set(target,key,value){target[key]=value;return true;}});
 return {ctx,calls,target:{useMediaCoordinateSpace:f=>f({context:ctx,mediaSize:{width:100,height:100}})}};
}
function attached(layer){let updates=0;layer.attached({chart:{timeScale:()=>({logicalToCoordinate:i=>10+i*20,timeToCoordinate:t=>10+(t-candles[0].time)/60*20,getVisibleLogicalRange:()=>({from:0,to:3})})},series:{priceToCoordinate:p=>100-p*5},requestUpdate:()=>updates++});return ()=>updates;}

test('extended line clipping handles rays, verticals, backwards endpoints and invalid values',()=>{
 assert.deepEqual(pineLineGeometry(20,30,40,50,100,100,'both'),[0,10,90,100]);
 assert.deepEqual(pineLineGeometry(20,30,40,30,100,100,'right'),[20,30,100,30]);
 assert.deepEqual(pineLineGeometry(10,20,10,40,100,100,'both'),[10,0,10,100]);
 assert.deepEqual(pineLineGeometry(80,40,20,40,100,100,'both'),[100,40,0,40]);
 assert.equal(pineLineGeometry(-10,20,-10,40,100,100,'both'),null);
 assert.equal(pineLineGeometry(NaN,20,0,40,100,100),null);
});

test('actual PineTS outputs normalize fills, per-bar backgrounds, drawings, shapes, chars and row-major table cells',async()=>{
 const source=`//@version=6
indicator("Visual",overlay=true)
p=plot(close,"Close")
h=hline(12,"Level")
fill(p,h,color.new(color.green,70))
bgcolor(color.new(color.red,80))
plotshape(close>0,"Up",shape.triangleup,location.belowbar,color.green,text="GO")
plotchar(close>0,"Char","X",location.abovebar,color.blue)
if barstate.islast
    line.new(0,10,3,14,xloc=xloc.bar_index,extend=extend.both)
    box.new(1,14,3,10)
    label.new(2,12,"hey",yloc=yloc.abovebar)
    t=table.new(position.top_right,2,1)
    table.cell(t,0,0,"Left")
    table.cell(t,1,0,"Right")`;
 const data=candles.map(c=>({...c,openTime:c.time*1000,closeTime:c.time*1000+59999}));
 const run=await new PineTS(data,'TEST','1').run(source);
 const raw=Object.entries(run.plots).map(([key,p])=>({key,...p}));
 const visual=normalizePineVisuals(raw,candles);
 assert.equal(visual.fills.length,1);assert.deepEqual(visual.fills[0].a,[11,12,13,14]);assert.deepEqual(visual.fills[0].b,[12,12,12,12]);
 assert.equal(visual.backgrounds.length,4);assert.equal(visual.shapes.length,8);
 assert.equal(visual.shapes[0].location,'belowbar');assert.equal(visual.shapes[0].style,'shapetriangleup');
 assert.equal(visual.lines[0].extend,'both');assert.equal(visual.lines[0].xloc,'bar_index');assert.equal(visual.labels[0].yloc,'abovebar');
 assert.equal(visual.tables[0].cells[0][0].text,'Left');assert.equal(visual.tables[0].cells[1][0].text,'Right');
 const layer=new PineVisualLayer();attached(layer);layer.update(candles,visual);const draw=canvas();
 for(const view of layer.paneViews())view.renderer().draw(draw.target);
 assert.ok(draw.calls.some(c=>c[0]==='fillText'&&c[1]==='Left'));assert.ok(draw.calls.some(c=>c[0]==='fillText'&&c[1]==='X'));
 assert.ok(draw.calls.some(c=>c[0]==='stroke'));assert.ok(draw.calls.some(c=>c[0]==='fillRect'));
});

test('fills do not bridge missing values, replacement clears stale visuals and detached layers release snapshots',()=>{
 const layer=new PineVisualLayer(),updates=attached(layer);
 layer.update(candles,{fills:[{a:[10,null,12,13],b:[8,9,10,11],colors:['#f00','#0f0','#00f']}],labels:[{x:1,y:12,text:'old'}]});
 const first=canvas();layer.paneViews()[0].renderer().draw(first.target);
 assert.equal(first.calls.filter(c=>c[0]==='fill').length,1);
 layer.update(candles,{});const second=canvas();for(const view of layer.paneViews())view.renderer().draw(second.target);
 assert.equal(second.calls.filter(c=>['fill','fillRect','fillText','stroke'].includes(c[0])).length,0);assert.equal(updates(),2);
 layer.detached();const third=canvas();for(const view of layer.paneViews())view.renderer().draw(third.target);assert.equal(third.calls.length,0);
});

test('deleted drawings and oversized tables do not become chart objects',()=>{
 const visuals=normalizePineVisuals([{key:'lines',options:{style:'drawing_line'},data:[{time:0,value:[{_deleted:true,x1:0,x2:1,y1:1,y2:2}]}]},{key:'table',options:{style:'table'},data:[{time:0,value:[{columns:1000,rows:1000,cells:[]}]}]}],candles);
 assert.equal(visuals.lines.length,0);assert.equal(visuals.tables.length,0);
});

test('visible drawing prices expand the host scale and disappear on clear',()=>{
 const layer=new PineVisualLayer();attached(layer);layer.update(candles,{boxes:[{left:0,right:2,top:200,bottom:150}],labels:[{x:100,y:900,text:'offscreen'}]});
 assert.deepEqual(layer.autoscaleInfo(0,3),{priceRange:{minValue:150,maxValue:200}});
 layer.clear();assert.equal(layer.autoscaleInfo(0,3),null);
 layer.update(candles,{labels:[{x:1,y:NaN,yloc:'abovebar',text:'anchored'}]});
 assert.deepEqual(layer.autoscaleInfo(0,3),{priceRange:{minValue:candles[1].high,maxValue:candles[1].high}},'above-bar labels use candle price even when their unused y is na');
});

test('actual PineTS linefill, polyline, arrow, OHLC and candle colors reach canvas geometry',async()=>{
 const source=`//@version=6
indicator("Extras",overlay=true)
barcolor(color.yellow)
plotarrow(close-open,title="Arrows")
plotbar(open,high,low,close,"Bars",color.orange)
plotcandle(open,high,low,close,"Candles",color.green,wickcolor=color.red,bordercolor=color.blue)
if barstate.islast
    l1=line.new(0,10,3,14)
    l2=line.new(0,8,3,11)
    linefill.new(l1,l2,color.new(color.blue,70))
    points=array.new<chart.point>()
    array.push(points,chart.point.from_index(0,10))
    array.push(points,chart.point.from_index(1,14))
    array.push(points,chart.point.from_index(3,12))
    polyline.new(points,curved=true,closed=true,fill_color=color.new(color.red,80))`;
 const run=await new PineTS(candles.map(c=>({...c,openTime:c.time*1000,closeTime:c.time*1000+59999})),'TEST','1').run(source);
 const raw=Object.entries(run.plots).map(([key,p])=>({key,...p})),visual=normalizePineVisuals(raw,candles);
 assert.equal(visual.linefills.length,1);assert.equal(visual.polylines[0].points.length,3);assert.equal(visual.polylines[0].curved,true);
 assert.equal(visual.ohlc.length,8);assert.equal(visual.ohlc[4].candle,true);assert.equal(visual.ohlc[4].wickcolor,'#F23645');
 assert.equal(visual.shapes[0].style,'shapearrowup');assert.equal(extractPineBarColors(raw).get(candles[0].time),'#FDD835');
 const layer=new PineVisualLayer();attached(layer);layer.update(candles,visual);const draw=canvas();for(const view of layer.paneViews())view.renderer().draw(draw.target);
 assert.ok(draw.calls.some(c=>c[0]==='bezierCurveTo'));assert.ok(draw.calls.some(c=>c[0]==='strokeRect'));assert.ok(draw.calls.filter(c=>c[0]==='fill').length>=3);
 assert.deepEqual(pineVisualWarnings([{key:'x',options:{style:'unknown-test-style'},data:[]}]),['Visual style unknown-test-style is not rendered by the chart host.']);
});

test('bar-index visuals and autoscale follow main candles on a comparison union timeline',()=>{
 const layer=new PineVisualLayer(),mainLogical=[0,3,5,6],union=new Map(candles.map((c,i)=>[c.time,mainLogical[i]]));
 union.set(candles[0].time+20,1);union.set(candles[0].time+40,2);
 const scale={timeToIndex:t=>union.get(t)??null,timeToCoordinate:t=>union.has(t)?10+union.get(t)*10:null,logicalToCoordinate:i=>10+i*10,coordinateToLogical:x=>(x-10)/10,getVisibleLogicalRange:()=>({from:3,to:3})};
 layer.attached({chart:{timeScale:()=>scale},series:{priceToCoordinate:p=>100-p},requestUpdate(){}});
 layer.update(candles,{lines:[{x1:0,y1:10,x2:1,y2:20}],labels:[{x:1,y:80,text:'main1'},{x:3,y:900,text:'offscreen'}],backgrounds:[{x:1,color:'#f00'}],fills:[{a:[10,20,30,40],b:[5,10,15,20],colors:['#f00']}]});
 const draw=canvas();for(const view of layer.paneViews())view.renderer().draw(draw.target);
 assert.ok(draw.calls.some(c=>c[0]==='lineTo'&&c[1]===40&&c[2]===80),'line endpoint uses main candle1 timestamp at union logical3');
 assert.ok(draw.calls.some(c=>c[0]==='fillText'&&c[1]==='main1'&&c[2]===40));
 assert.deepEqual(layer.autoscaleInfo(3,3),{priceRange:{minValue:10,maxValue:80}});
 assert.equal(layer.x(1.5),50,'fractional index interpolates main candle timestamps');
 assert.equal(layer.x(4),80,'future index starts from mapped last main candle');
 assert.equal(layer.x((candles[0].time+20)*1000,'bar_time'),20,'bar-time points map exact comparison-only timestamps');
 layer.clear();assert.equal(layer.autoscaleInfo(3,3),null);
});
