import test from 'node:test';
import assert from 'node:assert/strict';
import * as drawing from 'lightweight-charts-drawing';
import {buildVolumeProfile,volumeValueArea} from '../lib/volume-profile.ts';
import {profilePeriod,profileFetchPlan,istSessionStart} from '../lib/profile-range.ts';
import {createProfileDataClient} from '../lib/profile-data-client.ts';
import {drawingLogicalAtTime,drawingTimeAtLogical} from '../lib/drawing-coordinates.ts';
import {createChartDrawingRegistry} from '../lib/chart-drawing-tools.ts';
import {holdingPerformance} from '../lib/holding-performance.ts';
import {readFile} from 'node:fs/promises';
import { layoutDrawingLabels } from '../lib/drawing-label-layout.ts';
import { EXTRA_DRAWING_TOOLS } from '../lib/drawing-extras.ts';
const candles=[{time:1,low:100,high:110,volume:100},{time:2,low:105,high:115,volume:200}];
const viewport={width:400,height:600,timeScale:{timeToCoordinate:t=>Number(t)*100},priceScale:{priceToCoordinate:p=>600-p*4}};

test('position drawings use actual anchor width, numeric per-unit values, distinct zones and serializable edits',()=>{
 const registry=createChartDrawingRegistry(drawing,()=>candles);
 for(const [type,stop,target] of [['long-position',95,110],['short-position',105,90]]) {
  const item=registry.createDrawing(type,'position',[{time:1,price:100},{time:1.8,price:stop},{time:2.2,price:target}],{}, {visible:true});
  const geometry=item.computeGeometry(viewport), zones=geometry.filter(g=>g.type==='polygon'), labels=geometry.filter(g=>g.type==='text');
  assert.equal(zones.length,2); assert.notEqual(zones[0].fill,zones[1].fill);
  assert.equal(Math.max(...zones[0].points.map(p=>p.x)),220.00000000000003);
  assert.ok(labels.every(g=>!/[A-Za-z$₹]/.test(g.text))); assert.ok(labels.some(g=>g.text==='100.00 · 1:2.00'));
  assert.ok(labels.some(g=>g.text.includes('+10.00 (+10.00%)'))); assert.ok(labels.some(g=>g.text.includes('-5.00 (-5.00%)')));
  const saved=item.toJSON(),restored=registry.createDrawing(saved.type,saved.id,saved.anchors,saved.style,saved.options);
  assert.deepEqual(restored.computeGeometry(viewport),geometry); assert.equal(restored.clone('copy').type,type);
  assert.equal(item.testHit({x:160,y:200},viewport),true); assert.equal(item.testHit({x:330,y:200},viewport),false);
 }
});
test('dense labels stay inside narrow plots, shrink and never overlap each other',()=>{
 for(const width of [120,240,320,768]) {
  const labels=Array.from({length:14},(_,i)=>({text:i<3?'23380.15 · +77.61 (+0.35%)':`${i*.236}`,x:i%2?-15:width+90,y:95,align:'center'}));
  const boxes=layoutDrawingLabels(labels,width,450,(text,size)=>text.length*size*.55);
  assert.equal(boxes.length,14);
  for(const [i,b] of boxes.entries()) {
   assert.ok(b.x>=0&&b.x+b.width<=width&&b.y>=0&&b.y+b.height<=450);
   for(const a of boxes.slice(0,i))assert.ok(b.x>=a.x+a.width||b.x+b.width<=a.x||b.y>=a.y+a.height||b.y+b.height<=a.y);
  }
  if(width===120)assert.equal(boxes[0].fontSize,10);
 }
 assert.equal(layoutDrawingLabels([{text:'$123',x:40,y:50}],150,150,(text,size)=>text.length*size)[0].text,'₹123');
});
test('every manual pattern and visual has a real restorable factory and geometry',()=>{
 const registry=createChartDrawingRegistry(drawing,()=>candles);
 for(const tool of EXTRA_DRAWING_TOOLS) {
  const anchors=Array.from({length:tool.anchors},(_,i)=>({time:1+i*.2,price:100+(i%2?10:0)}));
  const item=registry.createDrawing(tool.id,tool.id,anchors,{}, {visible:true});
  assert.equal(registry.get(tool.id).requiredAnchors,tool.anchors); assert.equal(item.isValid(),true);
  const geometry=item.computeGeometry(viewport);assert.ok(geometry.length,tool.id);
  const saved=item.toJSON();assert.deepEqual(registry.createDrawing(saved.type,saved.id,saved.anchors,saved.style,saved.options).computeGeometry(viewport),geometry);
  assert.equal(item.clone('copy').type,tool.id);
 }
});

test('drawing coordinate conversion remains reversible before, between and after candles',()=>{
 const times=[100,200,500,600];
 for(const logical of [-5,-.3,0,.4,1,2.5,3,4,20])assert.ok(Math.abs(drawingLogicalAtTime(drawingTimeAtLogical(logical,times),times)-logical)<1e-10);
 assert.equal(drawingLogicalAtTime(3,[]),null);
});

test('all registered drawing factories resolve missing candle times through logical coordinates',()=>{
 const registry=createChartDrawingRegistry(drawing,()=>candles);
 for(const entry of registry.getAll()){
  const item=registry.createDrawing(entry.type,'qa',Array.from({length:Math.max(2,entry.requiredAnchors)},(_,i)=>({time:i+1,price:100+i*2})));
  assert.ok(item,entry.type);
  item.attached({chart:{timeScale:()=>({width:()=>400,timeToCoordinate:t=>t===1?0:t===2?100:null,logicalToCoordinate:l=>l*100,coordinateToTime:()=>null})},series:{priceToCoordinate:p=>600-p*4,coordinateToPrice:y=>(600-y)/4},requestUpdate:()=>{}});
  const mapped=item.getViewport();
  assert.equal(mapped.timeScale.timeToCoordinate(3),200,entry.type+' future');
  assert.equal(mapped.timeScale.timeToCoordinate(0),-100,entry.type+' past');
  assert.equal(mapped.timeScale.timeToCoordinate(1.5),50,entry.type+' between');
 }
});

test('drawing mode uses a centre dot without a guidance banner and chart footer is scoped',async()=>{
 const source=await readFile(new URL('../components/MarketChart.tsx',import.meta.url),'utf8');
 assert.match(source,/className="drawing-crosshair"/);assert.doesNotMatch(source,/className="chart-placement-hint"/);
 const dashboard=await readFile(new URL('../components/TradingDashboard.tsx',import.meta.url),'utf8');
 assert.match(dashboard,/activeNavigationSection === "trade" && <div className="chart-trade-footer permanent-trade-footer"/);
 const tools=await readFile(new URL('../lib/chart-drawing-tools.ts',import.meta.url),'utf8');
 assert.doesNotMatch(tools,/fillRect\(x-offset/);
});

test('point confirmation snapshots the pinned crosshair, never the tap coordinates',async()=>{
 const source=await readFile(new URL('../components/MarketChart.tsx',import.meta.url),'utf8');
 const down=source.slice(source.indexOf('const onPointerDown ='),source.indexOf('const onPointerMove ='));
 assert.match(down,/const anchor = drawingAimRef\.current \? \{ \.\.\.drawingAimRef\.current \}/);
 assert.doesNotMatch(down,/aim\(event\)/);
 const up=source.slice(source.indexOf('const onPointerUp ='),source.indexOf('const onKeyDown ='));
 assert.match(up,/!gesture\.moved && gesture\.anchor\) commitOrEdit\(event, gesture\.anchor\)/);
 assert.match(source,/gesture\?\.pointerId === event\.pointerId && gesture\.moved\) aim\(event\)/);
 assert.match(source,/pointTool \? lastCrosshairAnchorRef\.current/);
 assert.match(source,/tap anywhere to confirm/);
 const aim=source.slice(source.indexOf('const aim ='),source.indexOf('const commitOrEdit ='));
 assert.match(aim,/origin\.x \+ event\.clientX - gesture\.x/);
 assert.match(aim,/origin\.y \+ event\.clientY - gesture\.y/);
 assert.match(source,/price: original\.price \+ current\.price - edit\.start\.price/);
});
test('volume profile preserves selected candle volume, including flat candles and reversed ranges',()=>{
 const bins=buildVolumeProfile([...candles,{time:3,low:110,high:110,volume:50}],3,1);
 assert.ok(Math.abs(bins.reduce((n,b)=>n+b.volume,0)-350)<1e-6);
 assert.equal(buildVolumeProfile(candles,9,10).length,0);
 assert.equal(buildVolumeProfile([{time:1,low:1,high:2,volume:0}],1,2).length,0);
});
test('price measurement is a compact vertical arrow with signed price and percentage',()=>{
 const registry=createChartDrawingRegistry(drawing,()=>candles);
 const measure=registry.createDrawing('price-range','p',[{time:1,price:100},{time:2,price:110}]);
 measure.setAnchors(measure.anchors);
 assert.ok(measure.anchors.every(a=>a.time===2));
 const geometry=measure.computeGeometry(viewport);
 assert.ok(geometry.some(g=>g.type==='text'&&g.text==='+10.00 (+10.00%)'));
 assert.equal(geometry.some(g=>g.type==='rectangle'),false);
 measure.updateAnchor(0,{time:3,price:120});
 assert.ok(measure.anchors.every(a=>a.time===3));
 assert.ok(measure.computeGeometry(viewport).some(g=>g.type==='text'&&g.text==='-10.00 (-8.33%)'));
});
test('volume drawings restore through the registry and do not share data between charts',()=>{
 const populated=createChartDrawingRegistry(drawing,()=>candles),empty=createChartDrawingRegistry(drawing,()=>[]);
 const anchors=[{time:1,price:100},{time:2,price:115}];
 const profile=populated.createDrawing('volume-profile','v',anchors);
 const saved=profile.toJSON();
 const restored=populated.createDrawing(saved.type,saved.id,saved.anchors,saved.style,saved.options);
 assert.ok(restored.computeGeometry(viewport).some(g=>g.type==='polygon'));
 assert.ok(empty.createDrawing('volume-profile','e',anchors).computeGeometry(viewport).some(g=>g.type==='text'&&g.text.includes('unavailable')));
});
test('the full registry retains displaced shortcut tools',()=>{
 const registry=createChartDrawingRegistry(drawing,()=>candles);
 for(const tool of ['brush','long-position','short-position','extended-line','ray','volume-profile']) assert.ok(registry.get(tool),tool);
});
test('Fibonacci labels and direction survive saving and restoring',()=>{
 const registry=createChartDrawingRegistry(drawing,()=>candles);
 const fib=registry.createDrawing('fib-retracement','f',[{time:1,price:100},{time:2,price:110}],{}, {levels:[0,.5,.618,.705,.786,1,1.618,2.618],reverseDirection:true});
 const saved=fib.toJSON(),restored=registry.createDrawing(saved.type,saved.id,saved.anchors,saved.style,saved.options);
 assert.equal(restored.getPriceAtLevel(0),110);
 assert.equal(restored.getPriceAtLevel(1),100);
 assert.ok(restored.computeGeometry(viewport).some(g=>g.type==='text'&&g.text==='0.705'));
});

test('fixed-range profile is left placed at 30 percent width and conserves up/down candle volume',()=>{
 const data=[{...candles[0],open:102,close:108},{...candles[1],open:114,close:106}];
 const bins=buildVolumeProfile(data,1,2);
 assert.ok(Math.abs(bins.reduce((n,b)=>n+b.upVolume,0)-100)<1e-6);
 assert.ok(Math.abs(bins.reduce((n,b)=>n+b.downVolume,0)-200)<1e-6);
 const registry=createChartDrawingRegistry(drawing,()=>data,()=>({width:310,height:450}));
 const profile=registry.createDrawing('volume-profile','vp',[{time:1,price:100},{time:2,price:115}]);
 const bars=profile.computeGeometry(viewport).filter(g=>g.type==='polygon');
 assert.ok(bars.length>0);
 assert.equal(Math.min(...bars.flatMap(g=>g.points.map(p=>p.x))),100);
 assert.equal(Math.max(...bars.flatMap(g=>g.points.map(p=>p.x))),130);
 assert.ok(bars.every(g=>g.points.every(p=>p.x>=0&&p.x<=308&&p.y>=0&&p.y<=450)));
 assert.ok(new Set(bars.map(g=>g.fill)).size>=2);
});

test('anchored and session profiles restore with one anchor and render at the plot right edge',()=>{
 const modes=[];
 const registry=createChartDrawingRegistry(drawing,()=>candles,()=>({width:310,height:450}),(_from,_to,mode)=>{modes.push(mode);return {candles,label:'1m volume'};});
 for(const type of ['anchored-volume-profile','session-volume-profile']) {
  assert.equal(registry.get(type).requiredAnchors,1);
  const profile=registry.createDrawing(type,type,[{time:1,price:105}]);
  const saved=profile.toJSON(),restored=registry.createDrawing(saved.type,saved.id,saved.anchors,saved.style,saved.options);
  const bars=restored.computeGeometry(viewport).filter(g=>g.type==='polygon');
  assert.equal(Math.max(...bars.flatMap(g=>g.points.map(p=>p.x))),308);
  assert.equal(restored.clone('copy').type,type);
 }
 assert.deepEqual(modes,['anchored','session']);
});

test('profiles use 24 rows and value-area ties prefer the nearest row then above',()=>{
 assert.equal(buildVolumeProfile(candles,1,2).length,24);
 assert.deepEqual(volumeValueArea([10,20,40,20,10].map(volume=>({volume}))),{low:2,high:3,poc:2});
 assert.deepEqual(volumeValueArea([]),{low:-1,high:-1,poc:-1});
});

test('daily fixed range includes both whole sessions while session mode isolates its chosen IST day',()=>{
 const day=Date.parse('2026-09-15T00:00:00Z')/1000,previous=day-86400;
 const fixed=profilePeriod(day,previous,'fixed',[previous,day],86400);
 assert.equal(fixed.from,istSessionStart(previous));assert.equal(fixed.to,istSessionStart(day)+86399);
 const session=profilePeriod(previous,day,'session',[previous,day],86400);
 assert.deepEqual(session,{from:istSessionStart(previous),to:istSessionStart(previous)+86399});
 const anchored=profilePeriod(previous,previous,'anchored',[previous,day],86400);
 assert.deepEqual(anchored,fixed);
 const intraday=profilePeriod(day,day+300,'fixed',[day,day+300,day+600],300);
 assert.deepEqual(intraday,{from:day,to:day+599});
});

test('profile fetch planning uses one-minute session bars and bounded gap-free chunks',()=>{
 const now=Date.parse('2026-09-15T10:00:00Z')/1000,start=istSessionStart(now);
 assert.equal(profileFetchPlan(start,now,now).interval,1);
 const plan=profileFetchPlan(start-364*86400,now,now);
 assert.ok(plan.interval<=60);assert.ok(plan.chunks.length<=14);assert.ok(plan.includesToday);
 for(let i=1;i<plan.chunks.length;i++)assert.equal(Date.parse(plan.chunks[i].from)-Date.parse(plan.chunks[i-1].to),86400000);
 assert.throws(()=>profileFetchPlan(start-367*86400,now,now));
 assert.throws(()=>profileFetchPlan(now+86400,now+90000,now));
});

test('profile periods respect calendar months and do not stretch intraday bars across gaps',()=>{
 const february=Date.parse('2026-02-01T00:00:00Z')/1000;
 assert.equal(profilePeriod(february,february,'fixed',[february],31*86400,'1M').to,Date.parse('2026-03-01T00:00:00+05:30')/1000-1);
 assert.equal(profilePeriod(february,february,'fixed',[february,february+86400],300).to,february+299);
});

test('profile client debounces dragged anchors independently per drawing and cancels on disposal',async()=>{
 const original=globalThis.fetch,calls=[];
 globalThis.fetch=async url=>{calls.push(String(url));return {ok:true,json:async()=>({ok:true,candles,intervalMinutes:1})};};
 const client=createProfileDataClient('NSE_EQ|TEST',()=>{});
 try {
  client.read(100,200,'first');client.read(110,200,'first');client.read(120,200,'first');
  client.read(300,400,'second');
  await new Promise(resolve=>setTimeout(resolve,480));
  assert.equal(calls.length,2);assert.ok(calls.some(url=>url.includes('from=120')));
  assert.equal(client.read(120,200,'first').candles,candles);
  client.read(500,600,'first');client.dispose();await new Promise(resolve=>setTimeout(resolve,450));
  assert.equal(calls.length,2);
 } finally {client.dispose();globalThis.fetch=original;}
});

const today=Date.parse('2026-09-15T08:30:00Z');
const buy=(id,quantity,price,createdAt)=>({id,symbol:'TEST',side:'BUY',quantity,price,createdAt,product:'DELIVERY',status:'COMPLETE',time:''});
test('a new holding starts at zero daily return even when the stock is up 20 percent',()=>{
 const result=holdingPerformance([buy('1',150,734.9,today)],'TEST',734.9,612.45,today);
 assert.equal(result.dayPnl,0); assert.equal(result.purchasedAt,today);
 assert.ok(Math.abs(holdingPerformance([buy('1',150,734.9,today)],'TEST',740,612.45,today).dayPnl-765)<1e-7);
});
test('daily holdings returns distinguish overnight shares, additions and partial sales',()=>{
 const fills=[buy('1',10,90,today-86400000),buy('2',5,110,today)];
 assert.equal(holdingPerformance(fills,'TEST',110,100,today).dayPnl,100);
 const remaining=holdingPerformance([...fills,{...buy('3',12,110,today+1),side:'SELL'}],'TEST',112,100,today+2);
 assert.equal(remaining.dayPnl,6); assert.equal(remaining.purchasedAt,today);
 assert.equal(holdingPerformance(fills,'TEST',110,110,today+86400000).dayPnl,0);
});
test('holding day boundary uses IST and missing purchase dates are not invented',()=>{
 const start=Date.parse('2026-09-14T18:35:00Z');
 assert.equal(holdingPerformance([buy('legacy',1,100,start)],'TEST',100,80,start+3600000).dayPnl,0);
 const unknown=holdingPerformance([buy('legacy',1,100,undefined)],'TEST',100,null,today);
 assert.equal(unknown.purchasedAt,null);assert.equal(unknown.dayPnl,0);
});
