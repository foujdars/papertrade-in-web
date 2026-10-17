import test from 'node:test';
import assert from 'node:assert/strict';
import * as drawing from 'lightweight-charts-drawing';
import {createChartDrawingRegistry} from '../lib/chart-drawing-tools.ts';
import {sanitizeDrawingPresentation,drawingVisibleOnTimeframe} from '../lib/study-pane-drawings.ts';
import {layoutDrawingLabels} from '../lib/drawing-label-layout.ts';
test('presentation sanitizes numeric values while preserving drawing library flags',()=>{
 const value=sanitizeDrawingPresentation({visible:false,locked:true,opacity:150,textOpacity:-4,fontSize:40,lineWidth:NaN,bold:true,italic:'yes',textColor:'url(x)',timeframes:['1D','1D','<script>','15m']});
 assert.deepEqual(value,{visible:false,locked:true,opacity:100,textOpacity:0,fontSize:32,bold:true,timeframes:['1D','15m']});
});
test('restored native ray retains styled text and hidden timeframe has no geometry, controls or hit',()=>{
 const frame={timeframe:'1D',calendarOffset:0};
 const registry=createChartDrawingRegistry(drawing,()=>[],undefined,undefined,frame);
 const ray=registry.createDrawing('horizontal-ray','r',[{time:1,price:100}],{}, {visible:true,text:'Level',opacity:35,textColor:'#abcdef',textOpacity:80,fontSize:24,bold:true,italic:true,timeframes:['1D']});
 const viewport={width:400,height:300,timeScale:{timeToCoordinate:()=>100},priceScale:{priceToCoordinate:()=>120}};
 assert.ok(ray.computeGeometry(viewport).some(g=>g.type==='text'));
 const saved=ray.toJSON(),restored=registry.createDrawing(saved.type,saved.id,saved.anchors,saved.style,saved.options);
 assert.equal(restored.options.fontSize,24); assert.equal(restored.options.opacity,35); assert.equal(restored.options.bold,true);
 frame.timeframe='15m';
 assert.deepEqual(restored.computeGeometry(viewport),[]);assert.deepEqual(restored.getControlPoints(viewport),[]);assert.equal(restored.testHit({x:200,y:120},viewport),false);assert.equal(restored.hitTest(200,120),null);
 restored.updateOptions({timeframes:[],textEnabled:false});assert.ok(restored.computeGeometry(viewport).length);assert.equal(restored.computeGeometry(viewport).some(g=>g.type==='text'&&g.text==='Level'),false);
});
test('label measurement uses the same font weight and size that will be painted',()=>{
 let measured;
 const [box]=layoutDrawingLabels([{text:'Bold',x:100,y:100,anchored:true,fontSize:24,bold:true,italic:true,opacity:60}],400,300,(text,size,label)=>{measured=label;return size*text.length;});
 assert.equal(measured.bold,true);assert.equal(measured.italic,true);assert.equal(box.width,96);assert.equal(box.fontSize,24);assert.equal(box.opacity,60);
});

test('explicit selected empty timeframes hides while legacy empty shows all',()=>{assert.equal(drawingVisibleOnTimeframe({visibilityMode:'selected',timeframes:[]},'1D'),false);assert.equal(drawingVisibleOnTimeframe({timeframes:[]},'1D'),true);assert.equal(drawingVisibleOnTimeframe({visibilityMode:'all',timeframes:['15m']},'1D'),true);});

test('hour timeframe visibility and zero opacity survive native ray serialization',()=>{
 const registry=createChartDrawingRegistry(drawing,()=>[],undefined,undefined,{timeframe:'1H',calendarOffset:0});
 const options=sanitizeDrawingPresentation({visible:true,visibilityMode:'selected',timeframes:['1H','2H','4H','1h','99H'],opacity:0,textOpacity:0});
 assert.deepEqual(options.timeframes,['1H','2H','4H']);
 const ray=registry.createDrawing('horizontal-ray','hour',[{time:1,price:100}],{},options);
 const saved=ray.toJSON(),restored=registry.createDrawing(saved.type,saved.id,saved.anchors,saved.style,saved.options);
 assert.equal(restored.options.opacity,0);assert.equal(restored.options.textOpacity,0);
 assert.equal(drawingVisibleOnTimeframe(restored.options,'1H'),true);
 assert.equal(drawingVisibleOnTimeframe(restored.options,'15m'),false);
});
