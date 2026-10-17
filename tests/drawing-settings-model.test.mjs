import test from 'node:test';
import assert from 'node:assert/strict';
import {sanitizeAdvancedDrawingPresentation,fibonacciLevelPrice,extendedDrawingLine,formatFibonacciLabel,nextFibonacciLevel} from '../lib/drawing-editing.ts';
import {paintDrawingLabels} from '../lib/drawing-label-layout.ts';
test('advanced drawing options bound data, preserve library flags and accept zero deviations',()=>{
 const result=sanitizeAdvancedDrawingPresentation({visible:false,locked:true,levels:[0,.618,.618,Infinity,11,-.5,'1'],reverseDirection:'yes',regressionDeviation:99,fibLabels:'bad',fibShowPrices:true});
 assert.deepEqual(result,{visible:false,locked:true,levels:[0,.618,-.5],regressionDeviation:10,fibShowPrices:true});
 assert.equal(sanitizeAdvancedDrawingPresentation({regressionDeviation:0}).regressionDeviation,0);
 assert.equal(sanitizeAdvancedDrawingPresentation({regressionDeviation:NaN}).regressionDeviation,undefined);
 assert.equal(sanitizeAdvancedDrawingPresentation({levels:Array.from({length:30},(_,i)=>i/10)}).levels.length,24);
});
test('Fibonacci ratio prices are correct in both anchor directions and reversal',()=>{
 assert.equal(fibonacciLevelPrice(100,200,.618),161.8);
 assert.equal(fibonacciLevelPrice(200,100,.618),138.2);
 assert.equal(fibonacciLevelPrice(100,200,.618,true),138.2);
 assert.equal(fibonacciLevelPrice(100,200,1.618),261.8);
 assert.equal(fibonacciLevelPrice(100,200,-.5),50);
});
test('line extensions extrapolate slope and retain finite vertical-line geometry',()=>{
 assert.deepEqual(extendedDrawingLine({x:100,y:481},{x:400,y:424},600,true,true),{start:{x:0,y:500},end:{x:600,y:386}});
 assert.deepEqual(extendedDrawingLine({x:400,y:424},{x:100,y:481},600,false,true),{start:{x:100,y:481},end:{x:600,y:386}});
 assert.deepEqual(extendedDrawingLine({x:100,y:2},{x:100,y:7},600,true,true),{start:{x:100,y:2},end:{x:100,y:7}});
});
test('Fibonacci labels obey visibility and use chart price precision without hiding tiny prices',()=>{
 assert.equal(formatFibonacciLabel(.618,161.8),'0.618');
 assert.equal(formatFibonacciLabel(.618,161.8,{fibLabels:'percent',fibShowPrices:true},price=>price.toFixed(2)),'61.8% · 161.80');
 assert.equal(formatFibonacciLabel(1,.0000003,{fibLabels:'none',fibShowPrices:true}),'0.0000003');
 assert.equal(formatFibonacciLabel(1,100,{fibLabels:'none',fibShowPrices:false}),'');
});
test('canvas text actually paints with font size, weight, style and independent text opacity',()=>{
 const painted=[];
 const context={font:'',globalAlpha:1,save(){},restore(){},beginPath(){},rect(){},clip(){},measureText(text){return {width:text.length*10};},fillText(text){painted.push({text,font:this.font,opacity:this.globalAlpha});}};
 paintDrawingLabels(context,[{text:'Level',x:100,y:80,anchored:true,fontSize:24,bold:true,italic:true,opacity:35}],400,300);
 assert.deepEqual(painted,[{text:'Level',font:'italic bold 24px sans-serif',opacity:.35}]);
});

test('adding a Fibonacci level chooses an unused extension instead of duplicating a standard level',()=>{
 assert.equal(nextFibonacciLevel([0,.618,1,1.618,2.618]),1.272);
 assert.equal(nextFibonacciLevel([0,1,1.272]),1.414);
});
