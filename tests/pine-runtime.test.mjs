import test from 'node:test';
import assert from 'node:assert/strict';
import {runAdvancedPineScript,validateAdvancedPineSource} from '../lib/pine-runtime.ts';
import {PINE_TEMPLATES} from '../lib/pine-workspace.ts';
const candles=Array.from({length:80},(_,i)=>({time:1700000000+i*60,open:100+i,high:102+i,low:99+i,close:101+i,volume:1000+i}));
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
const run=(body,inputs={},rows=candles)=>runAdvancedPineScript('//@version=6\nindicator("Advanced",overlay=true)\n'+body,rows,inputs,{symbol:'NSE_EQ|TEST',timeframe:'1m'});
test('real native parser executes functions, persistent arrays, loops and tuple TA',async()=>{
 const result=await run(`length = input.int(3,"Length",minval=1,maxval=100)
double(x) => x * 2
var samples = array.new_float(0)
array.push(samples, close)
if array.size(samples) > length
    array.shift(samples)
total = 0.0
for i = 0 to array.size(samples) - 1
    total += array.get(samples, i)
[basis, upper, lower] = ta.bb(close, length, 2)
[macd, signal, hist] = ta.macd(close, 3, 5, 2)
plot(double(total / array.size(samples)), "Array mean")
plot(basis,"Basis")
plot(upper,"Upper")
plot(hist,"Histogram",style=plot.style_histogram)`);
 assert.equal(result.error,null);assert.equal(result.title,'Advanced');assert.equal(result.overlay,true);assert.equal(result.inputs[0].id,'length');near(result.plots[0].values[2],204);near(result.plots[1].values[2],102);near(result.plots[2].values[2],102+2*Math.sqrt(2/3));assert.equal(result.plots[3].histogram,true);
 const updated=await run('n=input.int(2,"N")\nplot(ta.sma(close,n))',{n:4});assert.equal(updated.error,null);assert.ok(Number.isNaN(updated.plots[0].values[2]));near(updated.plots[0].values[3],102.5);
});
test('broker fills market entries and closes on subsequent opens with exact closed-trade P/L',async()=>{
 const result=await runAdvancedPineScript(`//@version=6
strategy("Actual broker",initial_capital=1000,overlay=true)
if bar_index == 1
    strategy.entry("Long",strategy.long,qty=2)
if bar_index == 5
    strategy.close("Long")`,candles.slice(0,10),{},{timeframe:'1m'});
 assert.equal(result.error,null);assert.ok(result.strategy);assert.equal(result.strategy.trades.length,1);const trade=result.strategy.trades[0];assert.equal(trade.entryTime,candles[2].time);assert.equal(trade.entryPrice,102);assert.equal(trade.exitTime,candles[6].time);assert.equal(trade.exitPrice,106);near(trade.profit,8);near(result.strategy.netProfit,8);assert.equal(result.strategy.equity.length,10);near(result.strategy.equity.at(-1).value,1008);assert.equal(result.plots.some(p=>p.name.includes('private_equity')),false);
});
test('broker limit/bracket orders are actually simulated, not merely logged',async()=>{
 const result=await runAdvancedPineScript(`//@version=5
strategy("Bracket",initial_capital=10000)
if bar_index == 1
    strategy.entry("L",strategy.long,qty=1,limit=101)
if strategy.position_size > 0
    strategy.exit("Exit","L",limit=strategy.position_avg_price+2,stop=strategy.position_avg_price-2)`,candles.slice(0,10),{},{timeframe:'1m'});
 assert.equal(result.error,null);assert.ok(result.strategy);assert.equal(result.strategy.trades.length,1);near(result.strategy.trades[0].entryPrice,101);assert.ok(Number.isFinite(result.strategy.trades[0].profit));
});
test('raw fills, drawings, tables and logs survive adapter without circular references',async()=>{
 const result=await run(`p=plot(close,"Price")
h=hline(105,"Level",color.red)
fill(p,h,color.new(color.blue,80))
bgcolor(close>150?color.new(color.green,90):na)
if barstate.islast
    label.new(bar_index,high,"Last")
    line.new(bar_index-1,low[1],bar_index,low)
    box.new(bar_index-2,high,bar_index,low)
    var t=table.new(position.top_right,2,1)
    table.cell(t,0,0,"Value")
    table.cell(t,1,0,str.tostring(close))
    log.info("Last close: {0}",close)`);
 assert.equal(result.error,null);assert.equal(result.logs.length,1);assert.match(result.logs[0].message,/180/);assert.equal(result.levelStyles[0].title,'Level');for(const key of ['__labels__','__lines__','__boxes__','__tables__'])assert.ok(result.visuals.find(p=>p.key===key)?.data[0].value.length>0,key);assert.ok(result.visuals.some(p=>p.options.style==='fill'));assert.doesNotThrow(()=>JSON.stringify(result));
});
test('prefix executions preserve causal calculations and never expose future bars',async()=>{
 const source='plot(ta.ema(close,5),"EMA")\nplot(ta.rsi(close,4),"RSI")';const full=await run(source),prefix=await run(source,{},candles.slice(0,20));assert.equal(full.error,null);assert.equal(prefix.error,null);full.plots.forEach((p,i)=>assert.deepEqual(p.values.slice(0,20),prefix.plots[i].values));
});
test('source gate rejects JavaScript, host access, imports, lookahead and remote requests',async()=>{
 for(const source of ['//@PineTS\nconst x = 1;','//@version=6\nindicator("x")\nfetch("https://example.com")','//@version=6\nindicator("x")\nx = globalThis','//@version=6\nimport a/b/1','//@version=6\nindicator("x")\nx=request.financial("X","Y","Q")','//@version=6\nindicator("x")\nx=request.security("X","D",close,lookahead=barmerge.lookahead_on)'])assert.throws(()=>validateAdvancedPineSource(source));
 assert.doesNotThrow(()=>validateAdvancedPineSource('//@version=6\nindicator("fetch;{https://example.com}")\nf(x) => x+1\nplot(f(close))'));
 for(const flag of ['lookahead=true','lookahead=enabled','barmerge.gaps_off,true'])assert.throws(()=>validateAdvancedPineSource(`//@version=6\nindicator("X")\nplot(request.security("X","D",close,${flag}))`),/lookahead/);
 const invalid=await run('plot(close)',{missing:2});assert.match(invalid.error,/Unknown input/);const data=await run('plot(close)',{},[candles[1],candles[0]]);assert.match(data.error,/strictly increasing/);
});
test('security requests fail closed when no dataset provider is supplied',async()=>{const result=await run('plot(request.security("OTHER","D",close))');assert.match(result.error,/Market data unavailable/);assert.deepEqual(result.plots,[]);});
test('array allocation and loop budgets fail with explicit runtime diagnostics',async()=>{
 const allocation=await run('var a=array.new_float(100001)\nplot(close)');assert.match(allocation.error,/element limit/);
 const loop=await run('n=0\nwhile true\n    n+=1\nplot(n)',{},candles.slice(0,1));assert.match(loop.error,/loop|iteration/i);assert.deepEqual(loop.plots,[]);
});
test('input overrides migrate variable, metadata ID and title keys and retain richer widgets',async()=>{
 for(const inputs of [{n:4},{in_0:4},{Length:4}]){const r=await run('n=input.int(2,"Length",minval=1,maxval=20)\nplot(ta.sma(close,n))',inputs);assert.equal(r.error,null);assert.equal(r.inputs[0].value,4);near(r.plots[0].values[3],102.5);}
 const r=await run('mode=input.string("A","Mode",options=["A","B"],group="Settings",tooltip="Choose")\nsource=input.source(close,"Source")\nplot(mode=="A"?source:open)',{Mode:'B'});assert.equal(r.error,null);assert.deepEqual(r.inputs[0].options,['A','B']);assert.equal(r.inputs[0].group,'Settings');near(r.plots[0].values[0],100);
 assert.match((await run('n=input.int(2,"N",minval=1)\nplot(n)',{n:0})).error,/Invalid input/);
});
test('same timeframe security equals chart while higher timeframe RPC exposes only completed buckets',async()=>{
 const start=1700000100,rows=Array.from({length:20},(_,i)=>({...candles[i],time:start+i*60})),higher=Array.from({length:4},(_,i)=>({time:start+i*300,open:1000+i*100,high:1010+i*100,low:990+i*100,close:1005+i*100,volume:500}));
 let calls=0;const r=await runAdvancedPineScript('//@version=6\nindicator("MTF")\nplot(request.security(syminfo.tickerid,"1",close),"Same")\nplot(request.security(syminfo.tickerid,"5",close),"Higher")',rows,{}, {symbol:'X',timeframe:'1'},async(symbol,tf)=>{assert.equal(symbol,'X');assert.equal(tf,'5');calls++;return higher;});
 assert.equal(r.error,null);assert.equal(calls,1);assert.deepEqual(r.plots[0].values,rows.map(c=>c.close));assert.ok(r.plots[1].values.slice(0,4).every(Number.isNaN));assert.deepEqual(r.plots[1].values.slice(4,10),[1005,1005,1005,1005,1005,1105]);
});
test('native v5 math and Wilder RSI warmups are numeric and barstate distinguishes last bar',async()=>{
 const r=await runAdvancedPineScript('//@version=5\nindicator("v5")\nplot(math.log(math.exp(2)),"Log")\nplot(ta.rsi(close,4),"RSI")\nplot(barstate.islast?1:0,"Last")\nplot(barstate.isrealtime?1:0,"Realtime")',candles,{}, {timeframe:'1'});assert.equal(r.error,null);near(r.plots[0].values[0],2);assert.ok(r.plots[1].values.slice(0,4).every(Number.isNaN));near(r.plots[1].values[4],100);assert.equal(r.plots[2].values.filter(v=>v===1).length,1);assert.equal(r.plots[2].values.at(-1),1);assert.deepEqual(r.plots[3].values.slice(0,-1),Array(candles.length-1).fill(0));assert.equal(r.plots[3].values.at(-1),1);assert.ok(r.warnings.some(w=>w.includes('last loaded bar as realtime')));
});
test('strategy broker accounts configured percent fees and tick slippage',async()=>{
 const r=await runAdvancedPineScript(`//@version=6
strategy("Costs",initial_capital=1000,commission_type=strategy.commission.percent,commission_value=1,slippage=2)
if bar_index==1
    strategy.entry("L",strategy.long,qty=2)
if bar_index==5
    strategy.close("L")`,candles.slice(0,10),{}, {timeframe:'1',tickSize:.05});assert.equal(r.error,null);const t=r.strategy.trades[0];near(t.entryPrice,102.1);near(t.exitPrice,105.9);near(t.commission,4.16);near(t.profit,3.44);near(r.strategy.netProfit,3.44);
});
test('long-to-short reversal closes lots and reports both closed trades',async()=>{
 const r=await runAdvancedPineScript(`//@version=6
strategy("Reversal",initial_capital=10000)
if bar_index==1
    strategy.entry("L",strategy.long,qty=1)
if bar_index==3
    strategy.entry("S",strategy.short,qty=1)
if bar_index==5
    strategy.close_all()`,candles.slice(0,10),{}, {timeframe:'1'});assert.equal(r.error,null);assert.deepEqual(r.strategy.trades.map(t=>t.direction),['long','short']);near(r.strategy.trades[0].profit,2);near(r.strategy.trades[1].profit,-2);near(r.strategy.netProfit,0);near(r.strategy.winRate,50);near(r.strategy.profitFactor,1);assert.ok(r.strategy.maxDrawdown>=0);
});
test('hidden plots and levels stay hidden, show_last is honored and fidelity limits are explicit',async()=>{
 const r=await run(`p=plot(close,"Hidden",display=display.none)
h=hline(105,"Hidden level",display=display.none)
fill(p,h,color.blue)
plot(close,"Step",style=plot.style_stepline,show_last=2,offset=1,trackprice=true,force_overlay=true)
plot(close,"Cross",style=plot.style_cross)
hline(100,"Custom line",linestyle=hline.style_dotted,linewidth=3)`);assert.equal(r.error,null);assert.deepEqual(r.plots.map(p=>p.name),['Step','Cross']);assert.deepEqual(r.levelStyles.map(l=>l.title),['Custom line']);assert.ok(r.plots[0].values.slice(0,-2).every(Number.isNaN));assert.deepEqual(r.plots[0].values.slice(-2),[179,180]);assert.ok(r.visuals.find(v=>v.title==='Hidden').data.length===80);for(const fragment of ['step','Cross','trackprice','offset','dash','force_overlay'])assert.ok(r.warnings.some(w=>w.toLowerCase().includes(fragment.toLowerCase())),fragment);
});
test('symbol metadata honors crypto currency, point value and session context',async()=>{
 const r=await runAdvancedPineScript('//@version=6\nindicator("Metadata")\nplot(syminfo.pointvalue,"Point value")\nif barstate.islast\n    log.info("{0}/{1}/{2}",syminfo.currency,syminfo.type,syminfo.basecurrency)',candles,{}, {symbol:'DELTA:BTCUSD',timeframe:'1',currency:'USD',baseCurrency:'BTC',type:'crypto',pointValue:10,timezone:'UTC',session:'24x7',tickSize:.5});assert.equal(r.error,null);assert.equal(r.plots[0].values[0],10);assert.equal(r.logs[0].message,'USD/crypto/BTC');
 const bad=await runAdvancedPineScript('//@version=6\nindicator("Metadata")\nplot(close)',candles,{}, {tickSize:0});assert.match(bad.error,/finite and positive/);
});
test('EMA template named alertcondition arguments normalize to strings when crossovers fire',async()=>{
 const oscillating=Array.from({length:200},(_,i)=>{const close=100+Math.sin(i/5)*10;return {time:1700000000+i*60,open:close,high:close+1,low:close-1,close,volume:1000};});
 const r=await runAdvancedPineScript(PINE_TEMPLATES[0].source,oscillating,{}, {timeframe:'1'});assert.equal(r.error,null);assert.ok(r.alerts.length>=2);for(const alert of r.alerts){assert.equal(typeof alert.title,'string');assert.equal(typeof alert.message,'string');assert.ok(alert.values.some(Boolean));}
 const bull=r.alerts.find(a=>a.title==='Bullish crossover');assert.ok(bull);assert.equal(bull.message,'Fast EMA crossed above slow EMA');assert.equal(r.alerts.find(a=>a.title==='Bearish crossover').message,'Fast EMA crossed below slow EMA');
});
test('broker monetary P/L honors contract point value and returns account currency',async()=>{
 const r=await runAdvancedPineScript(`//@version=6
strategy("Multiplier",initial_capital=10000,currency=currency.INR)
if bar_index==1
    strategy.entry("L",strategy.long,qty=2)
if bar_index==5
    strategy.close("L")`,candles.slice(0,10),{}, {timeframe:'1',currency:'INR',type:'futures',pointValue:10});assert.equal(r.error,null);near(r.strategy.netProfit,80);assert.equal(r.strategy.currency,'INR');
});

test('oscillator drawings do not falsely warn main-chart routing, while force_overlay warns script-pane routing',async()=>{
 const plain=await runAdvancedPineScript('//@version=6\nindicator("Pane",overlay=false)\nif barstate.islast\n    label.new(bar_index,5,"Oscillator")',candles,{}, {timeframe:'1'});
 assert.equal(plain.error,null);assert.equal(plain.overlay,false);assert.ok(plain.visuals.some(v=>v.options.style==='label'));
 assert.ok(!plain.warnings.some(w=>/main chart pane/i.test(w)));
 const forced=await runAdvancedPineScript('//@version=6\nindicator("Pane",overlay=false)\nplot(close,force_overlay=true)',candles,{}, {timeframe:'1'});
 assert.equal(forced.error,null);assert.ok(forced.warnings.some(w=>/force_overlay/.test(w)&&/script pane/.test(w)));
 assert.ok(!forced.warnings.some(w=>/main chart pane/i.test(w)));
});
