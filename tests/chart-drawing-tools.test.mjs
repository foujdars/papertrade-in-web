import test from 'node:test';
import assert from 'node:assert/strict';
import * as drawing from 'lightweight-charts-drawing';
import {buildVolumeProfile} from '../lib/volume-profile.ts';
import {createChartDrawingRegistry} from '../lib/chart-drawing-tools.ts';
import {holdingPerformance} from '../lib/holding-performance.ts';
const candles=[{time:1,low:100,high:110,volume:100},{time:2,low:105,high:115,volume:200}];
const viewport={width:400,height:600,timeScale:{timeToCoordinate:t=>Number(t)*100},priceScale:{priceToCoordinate:p=>600-p*4}};
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

test('right-docked profile stays inside the plot and conserves up/down candle volume',()=>{
 const data=[{...candles[0],open:102,close:108},{...candles[1],open:114,close:106}];
 const bins=buildVolumeProfile(data,1,2);
 assert.ok(Math.abs(bins.reduce((n,b)=>n+b.upVolume,0)-100)<1e-6);
 assert.ok(Math.abs(bins.reduce((n,b)=>n+b.downVolume,0)-200)<1e-6);
 const registry=createChartDrawingRegistry(drawing,()=>data,()=>({width:310,height:450}));
 const profile=registry.createDrawing('volume-profile','vp',[{time:1,price:100},{time:2,price:115}]);
 const bars=profile.computeGeometry(viewport).filter(g=>g.type==='polygon');
 assert.ok(bars.length>0);
 assert.equal(Math.max(...bars.flatMap(g=>g.points.map(p=>p.x))),308);
 assert.ok(bars.every(g=>g.points.every(p=>p.x>=0&&p.x<=308&&p.y>=0&&p.y<=450)));
 assert.ok(new Set(bars.map(g=>g.fill)).size>=2);
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
