import test from 'node:test';
import assert from 'node:assert/strict';
import * as drawing from 'lightweight-charts-drawing';
import {buildVolumeProfile} from '../lib/volume-profile.ts';
import {createChartDrawingRegistry} from '../lib/chart-drawing-tools.ts';
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
