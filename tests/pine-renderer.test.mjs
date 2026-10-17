import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'vite';
const server=await createServer({configFile:false,server:{middlewareMode:true},appType:'custom'});
const {ChartStudyRenderer}=await server.ssrLoadModule('/lib/chart-study-renderer.ts');
test.after(()=>server.close());
function mockChart(){
 const all=[];
 const scale={getVisibleLogicalRange:()=>({from:0,to:4}),setVisibleLogicalRange(){}};
 const price={options:()=>({autoScale:true}),getVisibleRange:()=>null,applyOptions(){}};
 return {all,timeScale:()=>scale,priceScale:()=>price,removeSeries(s){all.splice(all.indexOf(s),1);},addSeries(type,options,pane){const s={options:()=>options,pane,points:[],levels:[],setData(v){this.points=v;},createPriceLine(v){this.levels.push(v);},attachPrimitive(){},applyOptions(v){Object.assign(options,v);}};all.push(s);return s;}};
}
const candles=Array.from({length:25},(_,i)=>({time:1700000000+i*60,open:100+i,high:102+i,low:99+i,close:101+i,volume:100}));
const result=(override={})=>({title:'Custom',overlay:false,plots:[{name:'Custom',values:candles.map(c=>c.close),colors:candles.map(()=> '#f2364580'),width:3}],levels:[110],levelStyles:[{price:110,title:'Threshold',color:'#00897b'}],inputs:[],alerts:[],error:null,...override});
test('Pine overlays and panes retain builtins and custom width, colors and hline settings',()=>{
 const chart=mockChart(),r=new ChartStudyRenderer(chart,t=>t);
 r.sync({ema21:true,rsi:true},{},'1m',candles,{result:result()});
 assert.deepEqual(r.bundles.map(b=>[b.id,b.pane]),[['ema21',0],['rsi',1],['script',2]]);
 const script=r.bundles.find(b=>b.id==='script').series[0];
 assert.equal(script.options().lineWidth,3);assert.equal(script.points[0].color,'#f2364580');assert.equal(script.levels[0].title,'Threshold');assert.equal(script.levels[0].color,'#00897b');
 r.sync({ema21:true,rsi:true},{},'1m',candles,{result:result({overlay:true})});
 assert.deepEqual(r.bundles.map(b=>[b.id,b.pane]),[['ema21',0],['rsi',1],['script',0]]);
});
test('same-schema Pine results update in place and errors clear stale plot only',()=>{
 const chart=mockChart(),r=new ChartStudyRenderer(chart,t=>t);
 r.sync({ema21:true},{},'1m',candles,{result:result()});
 const script=r.bundles.find(b=>b.id==='script').series[0];
 r.sync({ema21:true},{},'1m',candles,{result:result({plots:[{name:'Custom',values:candles.map(()=>250),colors:candles.map(()=> '#f2364580'),width:3}]})});
 assert.equal(r.bundles.find(b=>b.id==='script').series[0],script);assert.equal(script.points[0].value,250);
 r.sync({ema21:true},{},'1m',candles,{result:result({error:'Bad script'})});assert.deepEqual(r.bundles.map(b=>b.id),['ema21']);
 r.sync({ema21:true},{},'1m',candles);assert.deepEqual(r.bundles.map(b=>b.id),['ema21']);
});
test('a horizontal-level-only script creates an autoscaled pane',()=>{
 const chart=mockChart(),r=new ChartStudyRenderer(chart,t=>t);
 r.sync({}, {}, '1m', candles, {result:result({plots:[]})});
 assert.equal(r.bundles[0].id,'script');assert.equal(r.bundles[0].series[0].levels[0].price,110);
 assert.deepEqual(r.bundles[0].series[0].options().autoscaleInfoProvider().priceRange,{minValue:109,maxValue:111});
});
