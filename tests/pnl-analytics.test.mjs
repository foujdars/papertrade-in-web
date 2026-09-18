import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_PNL_SCOPE, pnlDay, pnlOutcome, pnlBounds, validPnlDate, tradeAsset, filterPnlTrades, summarisePnl, pnlCurve, rollingPnl, pnlDistribution, groupPnl } from '../lib/pnl-analytics.ts';

const now = Date.parse('2026-09-18T12:00:00+05:30');
const make = (netPnl, i = 0, extra = {}) => ({ id: `t${i}`, symbol: 'TEST', product: 'INTRADAY', quantity: 1, entryPrice: 100, exitPrice: 100 + netPnl + 10, grossPnl: netPnl + 10, charges: 10, netPnl, openedAt: Date.parse('2026-09-01T09:30:00+05:30') + i * 86400000, closedAt: Date.parse('2026-09-01T10:30:00+05:30') + i * 86400000, direction: 'LONG', sourceOrderIds: [`entry${i}`, `exit${i}`], ...extra });
const near = (a,b) => assert.ok(Math.abs(a-b) < 1e-8, `${a} != ${b}`);
test('after-cost summaries reconcile once, separate breakevens and identify cost reversals', () => {
  const trades = [make(90),make(-60,1),make(0,2),make(-5,3)], s = summarisePnl(trades);
  assert.equal(s.net,25); assert.equal(s.charges,40); assert.equal(s.count,4);
  assert.deepEqual([s.wins,s.losses,s.breakevens,s.winRate],[1,2,1,25]);
  near(s.profitFactor,90/65); assert.equal(s.average,6.25); assert.equal(s.averageWin,90); assert.equal(s.averageLoss,-32.5); assert.equal(s.median,-2.5);
  assert.equal(s.best.id,'t0'); assert.equal(s.worst.id,'t1'); assert.equal(s.costReversals,1);
  near(s.grossGains-s.grossLosses-s.charges,s.net);
});
test('empty, all-win, all-loss and flat samples never display fake win rates or invalid ratios', () => {
  const empty=summarisePnl([]); assert.equal(empty.winRate,null); assert.equal(empty.profitFactor,null); assert.equal(empty.average,null); assert.equal(empty.median,null); assert.equal(empty.best,null);
  assert.equal(summarisePnl([make(2)]).profitFactor,Infinity); assert.equal(summarisePnl([make(-2)]).profitFactor,0); assert.equal(summarisePnl([make(0)]).profitFactor,null);
  assert.equal(pnlOutcome(.00001),'breakeven'); assert.equal(pnlOutcome(-.00001),'breakeven'); assert.equal(pnlOutcome(-.01),'loss');
});
test('dates use IST at midnight and strictly validate calendar dates', () => {
  assert.equal(pnlDay(Date.parse('2026-09-17T18:30:00Z')),'2026-09-18'); assert.equal(pnlDay(Date.parse('2026-09-17T18:29:59Z')),'2026-09-17');
  assert.equal(pnlDay(NaN),''); assert.equal(pnlDay(0),'');
  assert.equal(validPnlDate('2026-02-30'),false); assert.equal(validPnlDate('2024-02-29'),true); assert.equal(validPnlDate('2026-9-1'),false);
  assert.deepEqual(pnlBounds({...DEFAULT_PNL_SCOPE,period:'30d'},now),{start:'2026-08-20',end:'2026-09-18',valid:true});
  assert.deepEqual(pnlBounds({...DEFAULT_PNL_SCOPE,period:'month'},now),{start:'2026-09-01',end:'2026-09-18',valid:true});
});
test('inclusive date, market, product and selected day filters intersect', () => {
  const trades=[make(1,0,{closedAt:Date.parse('2026-08-19T12:00:00+05:30')}),make(2,1,{closedAt:Date.parse('2026-08-20T00:00:00+05:30')}),make(3,2),make(4,3,{product:'DELIVERY'}),make(5,4,{closedAt:0})];
  const orders=[{id:'entry1',assetType:'EQUITY'},{id:'entry2',assetType:'OPTION'},{id:'entry3',assetType:'EQUITY'}];
  assert.deepEqual(filterPnlTrades(trades,orders,{...DEFAULT_PNL_SCOPE,period:'30d'},now).map(t=>t.id),['t1','t2','t3']);
  assert.deepEqual(filterPnlTrades(trades,orders,{...DEFAULT_PNL_SCOPE,period:'30d',asset:'stocks',product:'INTRADAY'},now).map(t=>t.id),['t1']);
  assert.deepEqual(filterPnlTrades(trades,orders,{...DEFAULT_PNL_SCOPE,day:'2026-09-03',asset:'fno'},now).map(t=>t.id),['t2']);
  assert.equal(filterPnlTrades(trades,orders,DEFAULT_PNL_SCOPE,now).length,5);
  assert.equal(filterPnlTrades(trades,orders,{...DEFAULT_PNL_SCOPE,period:'custom',start:'2026-09-10',end:'2026-09-01'},now).length,0);
});
test('legacy exchange segments classify safely and unknown records stay unclassified', () => {
  const t=make(1),lookup=new Map([['entry0',{instrumentKey:'NSE_EQ|TEST'}]]);
  assert.equal(tradeAsset(t,lookup),'stocks'); lookup.set('entry0',{instrumentKey:'NSE_FO|TEST'}); assert.equal(tradeAsset(t,lookup),'fno');
  lookup.set('entry0',{instrumentKey:'NSE_INDEX|Nifty 50'}); assert.equal(tradeAsset(t,lookup),'unknown');
  assert.equal(tradeAsset(t,new Map()),'unknown');
});
test('drawdown starts at zero and tracks worst peak, trough, recovery and current decline', () => {
  const trades=[100,-150,100,20,40,-5].map((n,i)=>make(n,i)), c=pnlCurve(trades);
  assert.deepEqual(c.points.map(p=>p.value),[100,-50,50,70,110,105]); assert.deepEqual(c.points.map(p=>p.drawdown),[0,150,50,30,0,5]);
  assert.equal(c.maxDrawdown,150); assert.equal(c.currentDrawdown,5); assert.equal(c.worstPeakAt,trades[0].closedAt); assert.equal(c.troughAt,trades[1].closedAt); assert.equal(c.recoveredAt,trades[4].closedAt);
  const loss=pnlCurve([make(-50),make(-20,1)]); assert.equal(loss.maxDrawdown,70); assert.equal(loss.worstPeakAt,null); assert.equal(loss.recoveredAt,null);
});
test('dated charts sort copies, report excluded legacy records and handle empty/all-win samples', () => {
  const trades=[make(5,2),make(10,0),make(99,1,{closedAt:0})], original=JSON.stringify(trades), c=pnlCurve(trades);
  assert.deepEqual(c.points.map(p=>p.trade.id),['t0','t2']); assert.equal(c.undated,1); assert.equal(c.maxDrawdown,0); assert.equal(c.troughAt,null); assert.equal(JSON.stringify(trades),original);
  assert.deepEqual(pnlCurve([]).points,[]); assert.equal(pnlCurve([]).currentDrawdown,0);
});
test('rolling averages require ten actual dated exits and retain exact drill-down IDs', () => {
  const trades=Array.from({length:12},(_,i)=>make(i+1,i)), r=rollingPnl([...trades].reverse());
  assert.equal(r.length,3); assert.deepEqual(r.map(p=>p.value),[5.5,6.5,7.5]); assert.deepEqual(r[2].ids,trades.slice(2).map(t=>t.id));
  assert.equal(rollingPnl(trades.slice(0,9)).length,0); assert.equal(rollingPnl(trades,0).length,0);
});
test('histogram uses equal bins and includes boundary values, zero and outliers once', () => {
  for(const values of [[-400,-200,-100,0,100,200,400],[0,0],[1,2,3],[-1,-2,-3],[-.01,.01],[1,1000000],[]]) {
    const trades=values.map((n,i)=>make(n,i)), d=pnlDistribution(trades), step=d.bins[0].to-d.bins[0].from;
    assert.equal(d.bins.length,8); d.bins.forEach(b=>near(b.to-b.from,step));
    assert.deepEqual(d.bins.flatMap(b=>b.trades.map(t=>t.id)).sort(),trades.map(t=>t.id).sort());
  }
  assert.equal(pnlDistribution([make(400)]).bins[7].trades.length,1);
});
test('strategy breakdown honours journal labels, mixed entries and missing metadata', () => {
  const a=make(2),b=make(-3,1,{sourceOrderIds:['e1','e2','exit1']}),c=make(0,2);
  const orders=[{id:'entry0',journalPlan:{strategy:'Breakout'}},{id:'e1',journalPlan:{strategy:'SMC'}},{id:'e2',journalPlan:{strategy:'Retest'}}];
  assert.deepEqual(groupPnl([a,b,c],orders,{},'Strategy').map(g=>g.label),['Breakout','Unclassified','Mixed entries']);
  const groups=groupPnl([a,b,c],orders,{t0:{strategy:'Journal override'}},'Strategy'); assert.equal(groups[0].label,'Journal override'); assert.equal(groups.reduce((s,g)=>s+g.net,0),-1);
});
test('entry-time groups use IST, isolate carry-forward trades and flag missing timestamps', () => {
  const trades=[make(1),make(2,1,{openedAt:Date.parse('2026-09-01T10:00:00+05:30')}),make(3,2,{product:'DELIVERY'}),make(4,3,{openedAt:0})];
  const labels=groupPnl(trades,[],{},'Entry time').map(g=>g.label);
  assert.deepEqual(new Set(labels),new Set(['09:15–10:00','10:00–11:00','Delivery / carry forward (separate)','Time unavailable']));
});
test('holding durations and direction groups preserve counts and net totals', () => {
  const t=make(10), trades=[t,make(-3,1,{direction:'SHORT',openedAt:0}),make(4,2,{openedAt:t.closedAt-20*60000,closedAt:t.closedAt}),make(5,3,{openedAt:t.closedAt-3*86400000,closedAt:t.closedAt})];
  assert.deepEqual(new Set(groupPnl(trades,[],{},'Holding duration').map(g=>g.label)),new Set(['30 minutes–2 hours','Duration unavailable','Under 30 minutes','1–7 days']));
  const groups=groupPnl(trades,[],{},'Direction'); assert.equal(groups[0].label,'Long'); assert.equal(groups.reduce((s,g)=>s+g.count,0),4); assert.equal(groups.reduce((s,g)=>s+g.net,0),16);
});
