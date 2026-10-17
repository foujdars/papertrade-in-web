import test from 'node:test';
import assert from 'node:assert/strict';
import {buildBharatPicks,compareBharatBasket,BHARAT_RETROSPECTIVE_LABEL} from '../lib/bharat-outperformers.ts';
const start=Date.UTC(2026,0,1)/1000;
const bars=(factor=1,count=280)=>Array.from({length:count},(_,i)=>{const close=factor*(100+i);return {time:start+i*86400,open:close,high:close*1.01,low:close*.99,close,volume:1000000};});
const now=(start+280*86400)*1000;
const stock=(id,industry='Industry '+id,fundamental=80)=>({instrument:{instrumentKey:'NSE_EQ|'+id,name:id},result:{name:id,industry,isFinancial:false,gateStatus:'review',decision:'approved'},fundamentals:{total:fundamental,coverage:90},candles:bars(),entry:0,stop:0,stopPercent:0,atrPercent:0,turnover:0,asOf:''});
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
test('original score recomputes price factors, ranks deterministically and caps industries at four',()=>{
 const stocks=Array.from({length:25},(_,i)=>stock(String(i).padStart(2,'0'),i<10?'Shared':'Sector'+i,100-i));
 const result=buildBharatPicks(stocks,bars(),{now});assert.equal(result.picks.length,19);assert.equal(result.eligible,25);assert.equal(result.picks.filter(p=>p.result.industry==='Shared').length,4);assert.equal(result.picks[0].instrument.instrumentKey,'NSE_EQ|00');
 assert.equal(result.picks[0].rank,1);assert.equal(result.picks[0].momentumScore,50);assert.equal(result.picks[0].trend,100);assert.ok(result.picks[0].entry>0);assert.equal(result.picks[0].reasons.length,4);
 near(result.picks[0].score,100*.45+50*.35+100*.1+result.picks[0].riskScore*.1);
 assert.equal(result.label,BHARAT_RETROSPECTIVE_LABEL);assert.match(result.methodology,/45% fundamentals/);assert.equal(result.comparison.available,true);
 assert.deepEqual(buildBharatPicks(stocks.toReversed(),bars(),{now}).picks.map(p=>p.instrument.instrumentKey),result.picks.map(p=>p.instrument.instrumentKey));
});
test('selection fails closed for missing coverage, bad/duplicate/stale history, illiquidity and duplicate instruments',()=>{
 const good=stock('good'),coverage=stock('coverage');coverage.fundamentals.coverage=69;
 const bad=stock('bad');bad.candles[20].close=-1;
 const duplicate=stock('duplicate');duplicate.candles.push({...duplicate.candles[10]});
 const stale=stock('stale');stale.candles=stale.candles.slice(0,-10);
 const liquid=stock('illiquid');liquid.candles=liquid.candles.map(c=>({...c,volume:1}));
 const result=buildBharatPicks([good,good,coverage,bad,duplicate,stale,liquid],[],{now});assert.equal(result.picks.length,1);assert.equal(result.excluded.length,6);assert.equal(result.comparison.available,false);assert.match(result.comparison.reason,/Benchmark/);
});
test('equal-weight buy-and-hold NAV uses price relatives, not price levels or daily rebalancing',()=>{
 const a=bars(1),b=bars(10),benchmark=bars(3);a.at(-1).close*=1.1;a.at(-1).high=a.at(-1).close*1.01;
 const r=compareBharatBasket([{candles:a},{candles:b}],benchmark,'1M',200000,now);assert.equal(r.available,true);assert.equal(r.points.length,22);assert.equal(r.sessions,21);near(r.points[0].basket,200000);near(r.points[0].benchmark,200000);
 const base=100+258,last=379;near(r.points.at(-1).basket,200000*((last*1.1/base)+(last/base))/2);near(r.points.at(-1).benchmark,200000*last/base);near(r.basketReturn,(r.points.at(-1).basket/200000-1)*100);
});
test('only exact shared trading dates are plotted and no current constituent is dropped',()=>{
 const a=bars(),b=bars(2),benchmark=bars(3);b.splice(270,1);
 const r=compareBharatBasket([{candles:a},{candles:b}],benchmark,'1M',1000,now);assert.equal(r.available,true);assert.equal(r.points.length,22);assert.equal(r.constituents,2);assert.equal(r.points.some(p=>p.date===new Date((start+270*86400)*1000).toISOString().slice(0,10)),false);
 const short=compareBharatBasket([{candles:a},{candles:b.slice(-100)}],benchmark,'1Y',1000,now);assert.equal(short.available,false);assert.match(short.reason,/101?0 dates|100 dates/);assert.deepEqual(short.points,[]);
 const endpoint=compareBharatBasket([{candles:a},{candles:b.slice(0,-1)}],benchmark,'1M',1000,now);assert.equal(endpoint.available,false);assert.match(endpoint.reason,/endpoint/);
});
test('forming and future bars do not alter current completed returns or picks',()=>{
 const closingNow=(start+279*86400+3*3600)*1000;
 const a=bars(),base=compareBharatBasket([{candles:a}],bars(),'1M',1000,closingNow);
 const changed=a.map((c,i)=>i===279?{...c,close:1e9,high:1e9}:c);changed.push({...changed.at(-1),time:start+281*86400});
 assert.deepEqual(compareBharatBasket([{candles:changed}],bars(),'1M',1000,closingNow),base);
 const pick=stock('one');pick.candles=changed;const result=buildBharatPicks([pick],bars(),{now:closingNow});assert.equal(result.picks[0].entry,378);
});
test('period availability reflects bounded actual history; missing or corrupt benchmark is unavailable',()=>{
 const picks=[{candles:bars()}];assert.equal(compareBharatBasket(picks,bars(),'Max',1000,now).sessions,279);
 assert.equal(compareBharatBasket(picks,bars(),'1Y',1000,now).sessions,252);
 assert.equal(compareBharatBasket(picks,bars(),'5Y',1000,now).available,false);
 const benchmark=bars();benchmark.push({...benchmark[0]});const bad=compareBharatBasket(picks,benchmark,'1M',1000,now);assert.equal(bad.available,false);assert.match(bad.reason,/duplicate/);
 assert.equal(compareBharatBasket([],bars(),'1M',1000,now).available,false);assert.equal(compareBharatBasket(picks,bars(),'1M',-1,now).available,false);
});
