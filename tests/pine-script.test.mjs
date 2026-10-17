import test from 'node:test';
import assert from 'node:assert/strict';
import { runPineScript } from '../lib/pine-script.ts';
const candles=[1,2,3,2,5,4,7,8].map((close,i)=>({time:100+i*60,open:close-.5,high:close+1,low:close-1,close,volume:100+i}));
const run=(body,bars=candles,overrides={})=>runPineScript(`//@version=6\nindicator("Test", overlay=true)\n${body}`,bars,overrides);
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-9,`${a} != ${b}`);
test('input metadata, overrides, multiline calls, source and dynamic colors',()=>{
 const r=run(`length = input.int(3, "Length", minval=1, maxval=20)
src = input.source(close, "Source")
enabled = input.bool(true, "Enabled")
factor = input.float(2.0, "Factor", step=0.5)
line = ta.sma(src, length)
plot(enabled ? line * factor : na,
 title="Mean", color=close > close[1] ? color.green : color.new(color.red, 50))
hline(10, title="Level")`,candles,{length:2,src:'high'});
 assert.equal(r.error,null);assert.equal(r.title,'Test');assert.equal(r.overlay,true);assert.equal(r.inputs.length,4);
 assert.equal(r.inputs[0].id,'length');assert.equal(r.inputs[0].value,2);assert.equal(r.inputs[1].defaultValue,'close');
 assert.ok(Number.isNaN(r.plots[0].values[0]));near(r.plots[0].values[1],5);assert.equal(r.plots[0].colors[1],'#4caf50');assert.equal(r.plots[0].colors[3],'#f2364580');assert.deepEqual(r.levels,[10]);
});
test('EMA is seeded on first valid sample, RMA uses Wilder SMA seed',()=>{
 const r=run('plot(ta.ema(close, 3))\nplot(ta.rma(close, 3))\nplot(ta.ema(ta.sma(close, 3), 2))');assert.equal(r.error,null);
 assert.deepEqual(r.plots[0].values.slice(0,4),[1,1.5,2.25,2.125]);assert.ok(Number.isNaN(r.plots[1].values[1]));near(r.plots[1].values[2],2);near(r.plots[1].values[4],3);near(r.plots[2].values[2],2);
});
test('ATR and RSI use Wilder smoothing with correct warmup',()=>{
 const r=run('plot(ta.atr(3))\nplot(ta.rsi(close, 3))');assert.equal(r.error,null);near(r.plots[0].values[2],2);near(r.plots[0].values[4],8/3);assert.ok(Number.isNaN(r.plots[1].values[2]));near(r.plots[1].values[3],100-100/(1+2));near(r.plots[1].values[4],100-100/(1+(13/9)/(2/9)));
});
test('rolling statistics, history, arithmetic, logic and crossings are causal',()=>{
 const body=`m = ta.sma(close, 2)
plot(ta.stdev(close, 3))
plot(ta.highest(high, 2) - ta.lowest(low, 2))
plot(math.max(close, 3) + math.abs(-2) % 2)
plot(nz(close[1], 0))
alertcondition(ta.crossover(close, m) and not (close < 0), title="Cross up", message="Price crossed")
alertcondition(ta.crossunder(close, m), title="Cross down")`;
 const full=run(body),prefix=run(body,candles.slice(0,5));assert.equal(full.error,null);near(full.plots[0].values[2],Math.sqrt(2/3));near(full.plots[1].values[1],3);assert.deepEqual(full.plots[3].values.slice(0,3),[0,1,2]);
 assert.equal(full.alerts[0].values[4],true);assert.equal(full.alerts[1].values[3],true);assert.equal(full.alerts[0].message,'Price crossed');
 full.plots.forEach((p,i)=>assert.deepEqual(p.values.slice(0,5),prefix.plots[i].values));full.alerts.forEach((a,i)=>assert.deepEqual(a.values.slice(0,5),prefix.alerts[i].values));
});
test('named argument ordering and quoted comments are parsed without executing text',()=>{
 const r=run(`plot(series=math.pow(number2=3, number1=2), title="https://site//title")`);assert.equal(r.error,null);assert.equal(r.plots[0].name,'https://site//title');assert.equal(r.plots[0].values[0],8);
});
test('rolling missing values count observations while extrema use bar windows',()=>{
 const r=run('x = bar_index == 1 ? na : close\nplot(ta.sma(x,2))\nplot(ta.stdev(x,2))\nplot(ta.highest(x,2))');assert.equal(r.error,null);
 assert.ok(Number.isNaN(r.plots[0].values[1]));near(r.plots[0].values[2],2);near(r.plots[1].values[2],1);near(r.plots[2].values[0],1);near(r.plots[2].values[1],1);
});
test('EMA and Wilder RMA retain state across na and ignore na in seed',()=>{
 const r=run('x = bar_index == 1 or bar_index == 4 ? na : close\nplot(ta.ema(x,3))\nplot(ta.rma(x,2))');assert.equal(r.error,null);
 assert.deepEqual(r.plots[0].values.slice(0,6),[1,1,2,2,2,3]);
 assert.ok(Number.isNaN(r.plots[1].values[0]));assert.ok(Number.isNaN(r.plots[1].values[1]));assert.deepEqual(r.plots[1].values.slice(2,6),[2,2,2,3]);
});
test('Pine time is epoch milliseconds',()=>{const r=run('plot(time)');assert.equal(r.error,null);assert.equal(r.plots[0].values[0],100000);});
test('plot width and horizontal level styles survive interpretation',()=>{
 const r=run('plot(close, linewidth=3)\nhline(4, title="Threshold", color=color.new(color.blue,20))');assert.equal(r.error,null);assert.equal(r.plots[0].width,3);assert.deepEqual(r.levelStyles,[{price:4,title:'Threshold',color:'#2196f3cc'}]);
 assert.match(run('hline(1,color="bad")').error,/Invalid hline color/);assert.match(run('hline(1,title=close)').error,/Expected a constant/);
});
test('declarations and visual side effects cannot be hidden inside expressions',()=>{
 for(const body of ['plot(indicator("Nested"))','p = plot(close)','plot(close > 0 ? hline(10) : close)','plot(input.int(2))','x = 2 + input.int(2)\nplot(x)','plot(close + alertcondition(true))','x = input.int(input.int(2))\nplot(x)']){
  const r=run(body);assert.match(r.error,/only supported as a standalone statement|Inputs must be directly assigned/);assert.deepEqual(r.plots,[]);assert.deepEqual(r.alerts,[]);assert.deepEqual(r.inputs,[]);
 }
 assert.equal(run('n = input.int(2)\nplot(ta.ema(ta.sma(close,n),n))').error,null);
});
test('unknown named arguments fail explicitly instead of changing meanings silently',()=>{
 for(const body of ['plot(close, display="all")','hline(1, linestyle="dashed")','n = input.int(2, confirm=true)\nplot(n)','plot(ta.ema(close,2, magic=true))','alertcondition(true, frequency=1)\nplot(close)'])assert.match(run(body).error,/Unsupported or duplicate argument/);
});
test('unsupported syntax is rejected with precise source lines and no partial plots',()=>{
 for(const [body,line] of [['plot(close)\nstrategy.entry("x", true)',4],['x = request.security("X", "D", close)\nplot(x)',3],['x = close[-1]\nplot(x)',3],['plot(close, evil=true)',3],['x = close\nx := 2\nplot(x)',4],['for i = 1 to 10\nplot(close)',3],['plot(close)\nprocess.exit()',4],['plot(close); globalThis.x = 1',3]]){
  const r=run(body);assert.match(r.error,new RegExp(`^Line ${line}:`),body);assert.deepEqual(r.plots,[]);
 }
 assert.match(run('plot(close)',candles,{unused:'x'}).error??'ok',/ok/);
 assert.match(run('n = input.int(3, minval=1)\nplot(ta.sma(close,n))',candles,{n:0}).error,/Invalid value/);
});
test('resource limits fail closed before excessive allocation or rolling work',()=>{
 assert.match(runPineScript('x'.repeat(32001),[]).error,/Source exceeds/);
 assert.match(run('plot(close)',Array(20001).fill(candles[0])).error,/Candle limit/);
 assert.match(run(`plot(${'('.repeat(70)}close${')'.repeat(70)})`).error,/Nesting limit/);
 assert.match(run('plot(ta.stdev(close,5000))',Array(2000).fill(candles[0])).error,/operation budget/);
});
