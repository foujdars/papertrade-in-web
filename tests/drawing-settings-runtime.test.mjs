import test from 'node:test';
import assert from 'node:assert/strict';
import * as drawing from 'lightweight-charts-drawing';
import {createChartDrawingRegistry} from '../lib/chart-drawing-tools.ts';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
const viewport={width:600,height:600,timeScale:{timeToCoordinate:time=>Number(time)*100,logicalToCoordinate:index=>100+index*100},priceScale:{priceToCoordinate:price=>500-price*2}};
test('edited Fibonacci levels, reversal and extensions are applied to geometry, hits, restore and clone',()=>{
 const registry=createChartDrawingRegistry(drawing,()=>[],()=>({width:600,height:600,formatPrice:price=>price.toFixed(2)}));
 const fib=registry.createDrawing('fib-retracement','fib',[{time:1,price:100},{time:3,price:200}],{},{levels:[0,.5,1]});
 fib.updateOptions({levels:[0,.25,1.5],reverseDirection:true,extendLeft:true,extendRight:false,fibLabels:'percent',fibShowPrices:true});
 const geometry=fib.computeGeometry(viewport),lines=geometry.filter(shape=>shape.type==='line');
 assert.deepEqual(lines.map(line=>[line.start.x,line.end.x,line.start.y]),[[0,300,100],[0,300,150],[0,300,400]]);
 assert.ok(geometry.some(shape=>shape.type==='text'&&shape.text==='25% · 175.00'));
 assert.equal(fib.testHit({x:30,y:150},viewport),true);assert.equal(fib.testHit({x:400,y:150},viewport),false);
 const saved=fib.toJSON();const restored=registry.createDrawing(saved.type,saved.id,saved.anchors,saved.style,saved.options);
 assert.deepEqual(restored.computeGeometry(viewport),geometry);const clone=fib.clone('copy');assert.deepEqual(clone.computeGeometry(viewport),geometry);clone.updateOptions({levels:[.5],reverseDirection:false});assert.equal(clone.getPriceAtLevel(.5),150);assert.equal(clone.getPriceAtLevel(0),100);assert.equal(clone.computeGeometry(viewport).filter(shape=>shape.type==='line').length,1);assert.deepEqual(fib.fibOptions.levels,[0,.25,1.5]);fib.setFibOptions({levels:[.2,.4],reverseDirection:false});assert.deepEqual(fib.toJSON().options.levels,[.2,.4]);assert.equal(fib.getPriceAtLevel(.2),120);
 fib.updateOptions({levels:[],fibShowPrices:false,fibLabels:'none'});assert.deepEqual(fib.computeGeometry(viewport),[]);
});
test('regression deviation widths and extension extrapolate the fit while handles stay at sampled candles',()=>{
 const bars=[2,4,5,8].map((close,index)=>({time:100+index*100,open:close,high:close+1,low:close-1,close,volume:1}));
 const view={...viewport,priceScale:{priceToCoordinate:price=>500-price*10}};
 const registry=createChartDrawingRegistry(drawing,()=>bars);
 const regression=registry.createDrawing('regression-trend','reg',[{time:100,price:99},{time:400,price:1}]);
 const handles=regression.getControlPoints(view);
 regression.updateOptions({regressionDeviation:3,extendLeft:true,extendRight:true,regressionShowStats:false});
 const geometry=regression.computeGeometry(view),lines=geometry.filter(shape=>shape.type==='line');
 assert.equal(lines.length,3);near(lines[0].start.x,0);near(lines[0].start.y,500);near(lines[0].end.x,600);near(lines[0].end.y,386);
 near(lines[0].start.y-lines[1].start.y,3*Math.sqrt(.175)*10);
 assert.deepEqual(regression.getControlPoints(view),handles);assert.equal(geometry.some(shape=>shape.type==='text'),false);
 const saved=regression.toJSON();assert.deepEqual(registry.createDrawing(saved.type,saved.id,saved.anchors,saved.style,saved.options).computeGeometry(view),geometry);
 regression.updateOptions({regressionDeviation:0});assert.equal(regression.computeGeometry(view).filter(shape=>shape.type==='line').length,1);
});

test('invalid persisted fields are removed before native constructor option copies are created',()=>{
 const bars=[2,4,5,8].map((close,index)=>({time:100+index*100,open:close,high:close+1,low:close-1,close,volume:1}));
 const registry=createChartDrawingRegistry(drawing,()=>bars);
 const regression=registry.createDrawing('regression-trend','bad-regression',[{time:100,price:1},{time:400,price:8}],{},{regressionDeviation:Infinity,opacity:NaN});
 assert.equal(regression.options.regressionDeviation,undefined);assert.equal(regression.options.opacity,undefined);
 assert.equal(regression.computeGeometry(viewport).filter(shape=>shape.type==='line').length,3);
 const fib=registry.createDrawing('fib-retracement','bad-fib',[{time:1,price:100},{time:3,price:200}],{},{levels:'malformed',reverseDirection:'yes'});
 assert.equal(fib.fibOptions.reverseDirection,false);assert.ok(Array.isArray(fib.fibOptions.levels));
 assert.ok(fib.computeGeometry(viewport).filter(shape=>shape.type==='line').every(line=>Number.isFinite(line.start.y)&&Number.isFinite(line.end.y)));
});
