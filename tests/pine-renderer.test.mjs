import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'vite';
const server=await createServer({configFile:false,server:{middlewareMode:true},appType:'custom',optimizeDeps:{noDiscovery:true,entries:[]}});
const {ChartStudyRenderer}=await server.ssrLoadModule('/lib/chart-study-renderer.ts');
test.after(()=>server.close());
function mockChart(){
 const all=[];
 const scale={getVisibleLogicalRange:()=>({from:0,to:4}),setVisibleLogicalRange(){}};
 const price={options:()=>({autoScale:true}),getVisibleRange:()=>null,applyOptions(){}};
 const chart={all,timeScale:()=>scale,priceScale:()=>price,removeSeries(s){for(const p of s.primitives)p.detached?.();all.splice(all.indexOf(s),1);},addSeries(type,options,pane){const s={options:()=>options,pane,points:[],levels:[],primitives:[],setData(v){this.points=v;},createPriceLine(v){this.levels.push(v);},attachPrimitive(p){this.primitives.push(p);p.attached?.({chart,series:this,requestUpdate(){}});},applyOptions(v){Object.assign(options,v);}};all.push(s);return s;}};
 scale.timeToCoordinate=t=>(t-1700000000)/60*20;scale.logicalToCoordinate=i=>i*20;scale.coordinateToLogical=x=>x/20;
 return chart;
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
 assert.ok(r.bundles[0].series[0].points.some(p=>Number.isFinite(p.value)));assert.equal(r.bundles[0].series[0].points[0].color,'transparent');
 assert.deepEqual(r.bundles[0].series[0].options().autoscaleInfoProvider().priceRange,{minValue:109,maxValue:111});
});

test('visual-only oscillator panes scale drawing prices without transparent candle-close anchors',()=>{
 const chart=mockChart(),r=new ChartStudyRenderer(chart,t=>t);
 const visual=(price)=>result({plots:[],levels:[],levelStyles:[],visuals:[{key:'__labels__',title:'Labels',options:{style:'label'},data:[{time:candles[0].time*1000,value:[{x:1,y:price,xloc:'bi',yloc:'pr',text:'oscillator'}]}]}],strategy:null});
 r.sync({}, {}, '1m', candles,{result:visual(5)});
 const bundle=r.bundles[0],anchor=bundle.series[0];
 assert.equal(bundle.pane,1);assert.ok(bundle.pine);assert.equal(anchor.primitives[0],bundle.pine);
 assert.ok(anchor.points.every(p=>p.color==='transparent'));
 assert.deepEqual(anchor.options().autoscaleInfoProvider().priceRange,{minValue:4,maxValue:6});
 assert.ok(anchor.points[0].value>100,'market-price anchors remain time carriers but do not enter pane range');
 r.sync({}, {}, '1m',candles,{result:visual(20)});
 assert.equal(r.bundles[0].series[0],anchor);assert.deepEqual(anchor.options().autoscaleInfoProvider().priceRange,{minValue:19,maxValue:21});
});

test('hline-only advanced panes combine levels and outlying drawings, while screen-only tables add no price range',()=>{
 const chart=mockChart(),r=new ChartStudyRenderer(chart,t=>t);
 const advanced=result({plots:[],levels:[12],levelStyles:[],visuals:[{key:'__boxes__',title:'Boxes',options:{style:'drawing_box'},data:[{time:candles[0].time*1000,value:[{left:0,right:2,top:40,bottom:30,xloc:'bi'}]}]}],strategy:null});
 r.sync({}, {}, '1m',candles,{result:advanced});
 assert.deepEqual(r.bundles[0].series[0].options().autoscaleInfoProvider().priceRange,{minValue:12,maxValue:40});
 const screenOnly={...advanced,levels:[],visuals:[{key:'__tables__',title:'Table',options:{style:'table'},data:[{time:candles[0].time*1000,value:[{columns:1,rows:1,cells:[[{text:'Header'}]],position:'top_right'}]}]}]};
 r.sync({}, {}, '1m',candles,{result:screenOnly});
 assert.equal(r.bundles[0].series[0].options().autoscaleInfoProvider(),null);
 const fillOnly={...screenOnly,visuals:[{key:'A',title:'A',options:{display:'none'},data:candles.map(c=>({time:c.time*1000,value:5}))},{key:'B',title:'B',options:{display:'none'},data:candles.map(c=>({time:c.time*1000,value:15}))},{key:'F',title:'Fill',options:{style:'fill',plot1:'A',plot2:'B',color:'#f00'},data:[]}]};
 r.sync({}, {}, '1m',candles,{result:fillOnly});
 assert.deepEqual(r.bundles[0].series[0].options().autoscaleInfoProvider().priceRange,{minValue:5,maxValue:15},'hidden source plots still provide fill-only price extents');
});
