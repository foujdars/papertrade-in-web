import test from 'node:test';
import assert from 'node:assert/strict';
import * as drawing from 'lightweight-charts-drawing';
import { regressionChannel } from '../lib/regression-channel.ts';
import { cloudSegments } from '../lib/study-cloud.ts';
import { anchoredVwapBands } from '../lib/anchored-vwap.ts';
import { createChartDrawingRegistry } from '../lib/chart-drawing-tools.ts';
import { studyDefaults, normalizeStudy } from '../lib/indicator-catalog.ts';
import { macdHistogramColor } from '../lib/histogram-color.ts';
const near=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-8,`${actual} != ${expected}`);
const bars=[2,4,5,8].map((close,i)=>({time:100+i*100,open:close,high:close+1,low:close-1,close,volume:1}));

test('regression uses candle closes and bar positions with independently known least-squares residuals',()=>{
 const fit=regressionChannel(bars,100,400);
 near(fit.start,1.9);near(fit.end,7.6);near(fit.deviation,Math.sqrt(.175));
 near(fit.correlation,9.5/Math.sqrt(5*18.75));assert.equal(fit.count,4);
 assert.deepEqual(regressionChannel(bars,400,100),fit);
 assert.deepEqual(regressionChannel([...bars,{time:500,close:10000}],100,400),fit);
 assert.equal(regressionChannel(bars,100,100),null);
 assert.equal(regressionChannel([{time:1,close:3},{time:2,close:NaN}],1,2),null);
 const flat=regressionChannel([{time:1,close:3},{time:2,close:3}],1,2);
 assert.equal(flat.deviation,0);assert.equal(flat.correlation,0);
});

test('regression drawing restores its data-driven geometry independently of clicked prices and chart instances',()=>{
 const viewport={width:500,height:400,timeScale:{timeToCoordinate:t=>Number(t),logicalToCoordinate:i=>i*100},priceScale:{priceToCoordinate:p=>400-p*10}};
 const registry=createChartDrawingRegistry(drawing,()=>bars);
 const item=registry.createDrawing('regression-trend','fit',[{time:100,price:9000},{time:400,price:-9000}]);
 const geometry=item.computeGeometry(viewport),lines=geometry.filter(g=>g.type==='line');
 assert.equal(lines.length,3);near(lines[0].start.y,381);near(lines[0].end.y,324);
 assert.deepEqual(item.getControlPoints(viewport).map(p=>p.y),[381,324]);
 assert.ok(item.testHit({x:150,y:352.5},viewport));assert.equal(item.testHit({x:150,y:100},viewport),false);
 const saved=item.toJSON();assert.deepEqual(registry.createDrawing(saved.type,saved.id,saved.anchors,saved.style,saved.options).computeGeometry(viewport),geometry);
 assert.deepEqual(item.clone('copy').computeGeometry(viewport),geometry);
 const replay=createChartDrawingRegistry(drawing,()=>bars.slice(0,2));
 assert.notDeepEqual(replay.createDrawing(saved.type,saved.id,saved.anchors).computeGeometry(viewport),geometry);
});

test('regression translates saved intraday offsets once when the chart frame changes',()=>{
 const shifted=bars.map(b=>({...b,time:b.time+19800}));
 const registry=createChartDrawingRegistry(drawing,()=>shifted,undefined,undefined,{timeframe:'5m',calendarOffset:19800});
 const item=registry.createDrawing('regression-trend','fit',[{time:100,price:0},{time:400,price:0}],{}, {anchorTimeOffset:0});
 const viewport={width:500,height:400,timeScale:{timeToCoordinate:t=>Number(t),logicalToCoordinate:i=>i*100},priceScale:{priceToCoordinate:p=>400-p*10}};
 near(item.computeGeometry(viewport)[0].start.y,381);
});

test('anchored VWAP bands use weighted population variance, chosen source, and causal updates',()=>{
 const candles=[{time:1,high:10,low:10,close:10,open:20,volume:1},{time:2,high:14,low:14,close:14,open:24,volume:3}];
 const points=anchoredVwapBands(candles,1);near(points[1].value,13);near(points[1].deviation,Math.sqrt(3));
 assert.equal(points[0].deviation,0);
 assert.deepEqual(anchoredVwapBands(candles.slice(0,1),1),points.slice(0,1));
 assert.deepEqual(anchoredVwapBands(candles,2),[{time:2,value:14,deviation:0}]);
 near(anchoredVwapBands(candles,1,'open')[1].value,23);
 assert.deepEqual(anchoredVwapBands(candles.map(c=>({...c,volume:0})),1),[]);
 assert.deepEqual(anchoredVwapBands(candles,NaN),[]);
 const translated=anchoredVwapBands(candles.map(c=>({...c,high:c.high+1e9,low:c.low+1e9,close:c.close+1e9})),1);
 near(translated[1].deviation,points[1].deviation);
});

test('cloud segments split exactly at a crossing, preserve trend colour and never bridge unavailable bars',()=>{
 const segments=cloudSegments([{x:0,a:4,b:2},{x:2,a:2,b:4}]);
 assert.equal(segments.length,2);assert.equal(segments[0].bullish,true);assert.equal(segments[1].bullish,false);
 assert.deepEqual(segments[0].right,{x:1,a:3,b:3});assert.deepEqual(segments[1].left,segments[0].right);
 assert.deepEqual(cloudSegments([{x:0,a:4,b:2},null,{x:2,a:2,b:4}]),[]);
 assert.deepEqual(cloudSegments([{x:0,a:NaN,b:2},{x:2,a:2,b:4}]),[]);
});

test('old indicator settings receive compatible band and cloud defaults; new settings have bounded inputs',()=>{
 assert.equal(studyDefaults('anchored-vwap').source,'hlc3');
 assert.equal(normalizeStudy('anchored-vwap',{}).inputs.bands,0);
 assert.equal(normalizeStudy('anchored-vwap',{}).source,'hlc3');
 assert.equal(normalizeStudy('ichimoku',{}).inputs.cloud,1);
 assert.equal(normalizeStudy('anchored-vwap',{inputs:{bands:100}}).inputs.bands,5);
 assert.equal(normalizeStudy('ichimoku',{inputs:{cloud:0}}).inputs.cloud,0);
});

test('regression selects containing intraday bars after switching timeframes',()=>{
 const source=bars.map((b,i)=>({...b,time:19800+i*300}));
 const registry=createChartDrawingRegistry(drawing,()=>source,undefined,undefined,{timeframe:'5m',calendarOffset:19800});
 const item=registry.createDrawing('regression-trend','fit',[{time:19920,price:500},{time:20820,price:1}]);
 const viewport={width:500,height:400,timeScale:{logicalToCoordinate:i=>i*100},priceScale:{priceToCoordinate:p=>400-p*10}};
 near(item.computeGeometry(viewport)[0].start.y,381);
 const before=item.getControlPoints(viewport);item.updateAnchor(0,{time:19920,price:-999});assert.deepEqual(item.getControlPoints(viewport),before);
});

test('MACD distinguishes strengthening, fading, recovering and falling histogram bars',()=>{
 const colors=studyDefaults('macd').colors;
 assert.equal(macdHistogramColor(2,1,colors),colors[2]);
 assert.equal(macdHistogramColor(1,2,colors),colors[3]);
 assert.equal(macdHistogramColor(-1,-2,colors),colors[4]);
 assert.equal(macdHistogramColor(-2,-1,colors),colors[5]);
 assert.equal(macdHistogramColor(2,2,colors),colors[3]);
 assert.equal(macdHistogramColor(2,NaN,colors),colors[2]);
 assert.equal(macdHistogramColor(-2,undefined,colors),colors[5]);
 assert.equal(new Set(colors.slice(2,6)).size,4);
});
