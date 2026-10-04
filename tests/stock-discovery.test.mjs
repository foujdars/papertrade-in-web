import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateCompanyJson } from '../lib/fundamental-analysis.ts';
import { HORIZON_KEYS, STOCK_HORIZONS, discoveryFundamentals, discoveryCandidates, researchCandles, analyseDiscovery, rankDiscovery, researchTradePlan, researchExecutionError, indiaDay } from '../lib/stock-discovery.ts';
import { PEER_METRICS, peerMetricSummary, peerValue, samePeerGroup } from '../lib/peer-comparison.ts';
const now = Date.parse('2026-10-04T10:00:00Z');
const record = { Name:'Alpha Industries', 'NSE Code':'ALPHA', 'BSE Code':'500001', 'ISIN Code':'INE002A01018', Industry:'Engineering', 'Pledged percentage':0, 'Return on equity':18, 'Average return on equity 3Years':19, 'Average return on equity 5Years':18, 'Return on capital employed':22, 'Average return on capital employed 3Years':21, 'Average return on capital employed 5Years':20, 'Debt to equity':.2, 'Net Profit':500, 'Price to Earning':18, 'Industry PE':20, 'Profit growth 3Years':15, 'Profit growth 5Years':12, 'Sales growth 3Years':11, 'Sales growth 5Years':10, OPM:16, 'PEG Ratio':1, 'Current ratio':2, 'Quick ratio':1.5, 'YOY Quarterly profit growth':20, 'YOY Quarterly sales growth':18, Sales:1000, 'Sales last year':900, 'Net Profit last year':400 };
const company = overrides => evaluateCompanyJson(JSON.stringify({...record,...overrides})).result;
const candidate = () => discoveryCandidates([company({})],[]).selected[0];
function candles(n=280, slope=.2, volume=200000) {
  const dates=[]; let t=Date.parse('2026-10-01T03:45:00Z');
  while(dates.length<n) { if(![0,6].includes(new Date(t).getUTCDay())) dates.unshift(t/1000); t-=86400000; }
  return dates.map((time,i)=>{const close=100+i*slope;return {time,open:close-.2,high:close+1,low:close-1,close,volume};});
}
const stock = (rows=candles()) => analyseDiscovery(candidate(), rows, now);
const options = {minTurnover:1e7,industryCap:3,trendOnly:true};
test('pool excludes failed gates, declined reviews, financials, missing scoring data and duplicate securities',()=>{
  const good=company({}), declined={...good,id:'declined',decision:'rejected'}, bank=company({Name:'Bank',Industry:'Banks'}), missing=company({Name:'Unknown'});
  for(const key of Object.keys(missing.metrics)) missing.metrics[key]=null;
  const otherExchange={...good,id:'bse',nseCode:''};
  const pool=discoveryCandidates([good,declined,bank,missing,otherExchange],[]);
  assert.equal(pool.selected.length,1);assert.equal(pool.excluded.length,4);
  assert.ok(pool.excluded.some(e=>/Duplicate/.test(e.reason)));
  assert.equal(discoveryFundamentals(missing).total,0);
  assert.equal(discoveryFundamentals(good).coverage,100);
});
test('candidate pool is deterministic and capped to six per industry',()=>{
  const rows=Array.from({length:9},(_,i)=>({...company({Name:`Company ${i}`,'NSE Code':`CODE${i}`,'ISIN Code':`INE000A010${i}1`}),id:String(i)}));
  assert.equal(discoveryCandidates(rows,[],60).selected.length,6);
  assert.equal(discoveryCandidates(rows,[],3).notScanned,6);
});
test('forming daily session is excluded through 15:34 IST; stale, duplicate and invalid bars reject',()=>{
  const rows=candles();const today={...rows.at(-1),time:Date.parse('2026-10-05T03:45:00Z')/1000};
  assert.equal(researchCandles([...rows,today],Date.parse('2026-10-05T10:04:00Z')).length,rows.length);
  assert.equal(researchCandles([...rows,today],Date.parse('2026-10-05T10:05:00Z')).at(-1).time,today.time);
  assert.throws(()=>researchCandles(rows,now+10*86400000),/seven days/);
  assert.throws(()=>researchCandles([...rows,rows.at(-1)],now),/duplicate/);
  assert.throws(()=>researchCandles(rows.map((c,i)=>i===250?{...c,low:c.high+10}:c),now),/Invalid/);
  assert.throws(()=>researchCandles(rows.slice(-30),now),/50/);
  assert.throws(()=>researchCandles(rows.filter((_,i)=>i<200||i>219),now),/gap/);
});
for(const horizon of HORIZON_KEYS) test(`${horizon} requires its entire lookback and uses visible weights`,()=>{
  const s=stock();const r=rankDiscovery([s],horizon,options,candles());assert.equal(r.picks.length,1);
  const p=r.picks[0],weights=STOCK_HORIZONS[horizon].weights;
  assert.equal(p.score,[p.fundamentals.total,p.momentumScore,p.trend,p.riskScore].reduce((t,v,i)=>t+v*weights[i]/100,0));
  assert.equal(p.excess,0);assert.equal(p.momentumScore,50);
  if(STOCK_HORIZONS[horizon].sessions>=50) { const short={...s,candles:s.candles.slice(-STOCK_HORIZONS[horizon].sessions)};assert.equal(rankDiscovery([short],horizon,options).picks.length,0); }
});
test('volatility, liquidity, trend, and mismatched dates produce explicit exclusion reasons',()=>{
  const s=stock();
  for(const bad of [{...s,stopPercent:10.01},{...s,turnover:100},{...s,asOf:'2026-09-30'},{...s,entry:1}]) {const r=rankDiscovery([s,{...bad,instrument:{...s.instrument,instrumentKey:'other'}}],'3M',options);assert.equal(r.picks.length,1);assert.equal(r.excluded.length,1);}
  const r=rankDiscovery([{...s,turnover:0}],'3M',{...options,minTurnover:0});assert.equal(r.picks.length,1);
});
test('diversification retains true score ordering and tied momentum receives equal percentiles',()=>{
  const s=stock(), rows=Array.from({length:8},(_,i)=>({...s,result:{...s.result,id:String(i),industry:i<5?'Engineering':'Technology'},instrument:{...s.instrument,instrumentKey:String(i)}}));
  const r=rankDiscovery(rows,'3M',options);assert.equal(r.picks.length,6);assert.equal(r.diversificationOmissions,2);
  assert.ok(r.picks.every(p=>p.momentumScore===50));assert.deepEqual(r.picks.map(p=>p.instrument.instrumentKey),['0','1','2','5','6','7']);
});
test('benchmark is omitted when either endpoint date differs or its history is insufficient',()=>{
  const s=stock();
  for(const b of [candles(30),candles().slice(0,-1),candles().map((c,i)=>i===216?{...c,time:c.time-86400}:c)]) assert.equal(rankDiscovery([s],'3M',options,b).picks[0].excess,null);
});
test('simulation uses whole shares, includes existing charge model, and respects both budgets',()=>{
  const p=researchTradePlan(100,95,10000,500,2);
  assert.ok(Number.isSafeInteger(p.quantity)&&p.quantity>0);assert.ok(p.cost<=10000);assert.ok(p.stopLoss<=500);assert.equal(p.target,110);
  assert.ok(p.pnlAt(100)<0);assert.ok(Math.abs(p.pnlAt(95)+p.stopLoss)<1e-8);assert.ok(Math.abs(p.pnlAt(110)-p.targetProfit)<1e-8);
  assert.equal(researchTradePlan(100,95,50,500,2).quantity,0);
  assert.equal(researchTradePlan(100,95,10000,.01,2).quantity,0);
  for(const args of [[100,101,1000,50,2],[100,95,NaN,50,2],[100,95,1000,50,20]]) assert.throws(()=>researchTradePlan(...args));
});
test('live entry guard rejects budget/risk drift and missing or crossed protections',()=>{
  const plan=researchTradePlan(100,95,10000,500,2),draft={budget:10000,riskBudget:500};
  assert.equal(researchExecutionError(draft,plan.quantity,100,95,110),null);
  assert.match(researchExecutionError(draft,plan.quantity,109,95,120),/budget/);
  assert.match(researchExecutionError({...draft,budget:20000},plan.quantity,109,95,120),/risk budget/);
  assert.match(researchExecutionError(draft,plan.quantity,100,101,110),/stop and target/);
  assert.match(researchExecutionError(draft,plan.quantity,100,95,0),/stop and target/);
  assert.match(researchExecutionError(draft,1.5,100,95,110),/whole-share/);
});
test('peer medians count actual values; negative P/E never wins; financial context has no winner',()=>{
  const a=company({}),b=company({'Price to Earning':-2,'Return on equity':22}),c=company({'Price to Earning':10,'Return on equity':null});
  const pe=PEER_METRICS.find(f=>f.key==='pe'),roe=PEER_METRICS.find(f=>f.key==='roe');
  assert.equal(peerValue(b,pe),null);assert.deepEqual(peerMetricSummary([a,b,c],[a,b,c],pe),{median:14,count:2,best:10});
  assert.deepEqual(peerMetricSummary([a,b,c],[a,b],roe),{median:20,count:2,best:22});
  const debt=PEER_METRICS.find(f=>f.key==='debtEquity');assert.equal(peerMetricSummary([a,b],[{...a,isFinancial:true},b],debt).best,null);
  assert.equal(samePeerGroup(a,{...a,industry:' ENGINEERING '}),true);assert.equal(samePeerGroup(a,{...a,isFinancial:true}),false);
  assert.equal(indiaDay(Date.parse('2026-10-01T20:00:00Z')),'2026-10-02');
});
