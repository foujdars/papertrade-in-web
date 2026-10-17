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
 const chart={all,timeScale:()=>scale,priceScale:()=>price,removeSeries(s){all.splice(all.indexOf(s),1);},addSeries(type,options,pane){const s={options:()=>options,pane,points:[],levels:[],primitives:[],setData(v){this.points=v;},createPriceLine(v){this.levels.push(v);},attachPrimitive(p){this.primitives.push(p);p.attached?.({chart,series:this,requestUpdate(){}});},detachPrimitive(p){p.detached?.();this.primitives=this.primitives.filter(item=>item!==p);},applyOptions(v){Object.assign(options,v);}};all.push(s);return s;}};
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

test('Pine area colors fill to histbase, steps keep their shape, and br styles preserve na gaps',()=>{
 const chart=mockChart(),r=new ChartStudyRenderer(chart,t=>t),values=[10,NaN,30,...Array(22).fill(35)];
 const plot=(name,style)=>({name,style,values,colors:values.map((_,i)=>i===0?'#2962ff80':'#f2364540'),histbase:7,width:2});
 r.sync({}, {}, '1m',candles,{result:result({levels:[],plots:[plot('Area','area'),plot('Broken area','areabr'),plot('Steps','stepline'),plot('Broken line','linebr')]})});
 const [area,brokenArea,steps,brokenLine]=r.bundles[0].series;
 assert.deepEqual(area.options().baseValue,{type:'price',price:7});
 assert.equal(area.options().topFillColor1,'#2962ff80');assert.equal(area.options().bottomFillColor2,'#2962ff80');
 assert.deepEqual(area.options().autoscaleInfoProvider(()=>({priceRange:{minValue:10,maxValue:35}})),{priceRange:{minValue:7,maxValue:35}},'area includes the explicit histbase in its scale');
 assert.equal(brokenArea.options().autoscaleInfoProvider,undefined,'areabr scales plotted values without the area baseline');
 assert.equal(area.points[1].topLineColor,'#f2364540');assert.equal(area.points[1].bottomFillColor1,'#f2364540');
 assert.equal(area.points.length,24);assert.equal(steps.points.length,24);
 assert.equal(brokenArea.points.length,25);assert.equal(brokenLine.points.length,25);
 assert.deepEqual(brokenLine.points[1],{time:candles[1].time});
 assert.equal(steps.options().lineType,1,'Lightweight Charts WithSteps enum');
});

test('force_overlay sends plots and objects to main price scale without moving the oscillator pane',()=>{
 const chart=mockChart(),r=new ChartStudyRenderer(chart,t=>t);
 const plot=(name,value,forceOverlay)=>({name,values:candles.map(()=>value),forceOverlay});
 const script=result({levels:[],plots:[plot('Oscillator',50,false),plot('Price EMA',110,true)],strategy:null,visuals:[
  {key:'labels',options:{style:'label'},data:[{time:0,value:[{x:1,y:55,text:'Pane'},{x:1,y:110,text:'Price',force_overlay:true}]}]},
  {key:'bg',options:{style:'background',force_overlay:true,color:'#2962ff20'},data:[{time:candles[0].time*1000,value:true}]}
 ]});
 r.sync({}, {},'1m',candles,{result:script});const bundle=r.bundles[0];
 assert.equal(bundle.pane,1);assert.deepEqual(bundle.seriesPanes,[1,0]);
 assert.deepEqual(bundle.pine.data.labels.map(v=>v.text),['Pane']);assert.deepEqual(bundle.pineOverlay.data.labels.map(v=>v.text),['Price']);
 assert.equal(bundle.pine.data.backgrounds.length,0);assert.equal(bundle.pineOverlay.data.backgrounds.length,1);
 const oldPane=bundle.pine,oldOverlay=bundle.pineOverlay;
 r.sync({}, {},'1m',candles,{result:{...script,plots:[plot('Oscillator',20,false)],visuals:[]}});
 assert.deepEqual(oldPane.data,{});assert.deepEqual(oldOverlay.data,{});assert.equal(oldOverlay.chart,undefined);
 assert.equal(r.bundles[0].pineOverlay.data.labels.length,0,'recompile must remove old main-pane objects');
});

test('Pine crosses are drawn as crosses; histogram baseline, tracking and show_last reach chart series',()=>{
 const chart=mockChart(),r=new ChartStudyRenderer(chart,t=>t);
 r.sync({}, {},'1m',candles,{result:result({levels:[],visuals:[],strategy:null,plots:[
  {name:'Cross',style:'cross',values:candles.map(()=>20),colors:candles.map(()=> '#f00'),points:true,width:3,showLast:2},
  {name:'Histogram',style:'histogram',histogram:true,histbase:12,trackPrice:true,values:candles.map(()=>30)}
 ]})});
 const bundle=r.bundles[0],cross=bundle.series[0],histogram=bundle.series[1];
 assert.equal(cross.options().lineVisible,false);assert.equal(cross.options().pointMarkersVisible,false);
 assert.equal(cross.points.length,2);assert.deepEqual(bundle.pine.data.shapes.map(s=>[s.style,s.x]),[['cross',23],['cross',24]]);
 assert.equal(histogram.options().base,12);assert.equal(histogram.options().priceLineVisible,true);
});

test('forced drawings alone scale the price pane without using transparent candle prices in script pane',()=>{
 const chart=mockChart(),r=new ChartStudyRenderer(chart,t=>t);
 r.sync({}, {},'1m',candles,{result:result({plots:[],levels:[],strategy:null,visuals:[{key:'boxes',options:{style:'drawing_box'},data:[{time:0,value:[{left:0,right:3,top:200,bottom:180,force_overlay:true}]}]}]})});
 const bundle=r.bundles[0];assert.equal(bundle.series[0].options().autoscaleInfoProvider(),null);
 assert.deepEqual(bundle.series[1].options().autoscaleInfoProvider(),{priceRange:{minValue:180,maxValue:200}});
});

test('Pine horizontal levels preserve their width and dash style',()=>{
 const chart=mockChart(),r=new ChartStudyRenderer(chart,t=>t);
 r.sync({}, {},'1m',candles,{result:result({plots:[],levels:[20,50],levelStyles:[{price:20,title:'Support',color:'#f00',width:3,style:'dotted'},{price:50,title:'Mid',color:'#00f',width:2,style:'solid'}]})});
 assert.deepEqual(r.bundles[0].series[0].levels.map(l=>[l.price,l.lineWidth,l.lineStyle]),[[20,3,1],[50,2,0]]);
});
