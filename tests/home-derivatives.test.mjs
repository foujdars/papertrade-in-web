import assert from 'node:assert/strict';
import test from 'node:test';
import { completedFutureClose, oiSummary } from '../lib/home-derivatives.ts';
const side = (oi,prevOi) => ({ marketData: { oi, prevOi } });
const rows = [{strikePrice:22000,call:side(100,150),put:side(200,100)}, {strikePrice:22100,call:side(100,120),put:side(100,140)}];
test('PCR and OI totals cover the full chain, with signed previous-OI changes', () => {
  const s=oiSummary(rows); assert.equal(s.pcr,1.5); assert.equal(s.callOi,200); assert.equal(s.putOi,300);
  assert.equal(s.callChange,-70); assert.equal(s.putChange,60); assert.equal(s.strikes[0].put.change,100);
});
test('unavailable OI is not silently turned into zero or a partial PCR', () => {
  assert.equal(oiSummary([]).pcr,null);
  assert.equal(oiSummary([{strikePrice:22000,call:null,put:side(200,100)}]).callOi,null);
  assert.equal(oiSummary([{strikePrice:22000,call:side(0,0),put:side(200,100)}]).pcr,null);
  assert.equal(oiSummary([{strikePrice:22000,call:side(100,null),put:side(200,undefined)}]).callChange,null);
  assert.equal(oiSummary([{strikePrice:22000,call:{marketData:{oi:0,oiAvailable:false}},put:side(200,100)}]).pcr,null);
});
const candle=(date,close)=>[date+'T09:15:00+05:30',close,close,close,close,10];
const session={date:'2026-10-07',sessions:[{start:Date.parse('2026-10-07T09:15:00+05:30'),end:Date.parse('2026-10-07T15:30:00+05:30')}]};
test('the comparison uses yesterday before close and today only after its dated session ends',()=>{
  const candles=[candle('2026-10-06',22500),candle('2026-10-07',22618.4)];
  assert.deepEqual(completedFutureClose(candles,new Date('2026-10-07T14:00:00+05:30'),session),{price:22500,date:'2026-10-06'});
  assert.deepEqual(completedFutureClose(candles,new Date('2026-10-07T18:00:00+05:30'),session),{price:22618.4,date:'2026-10-07'});
  assert.equal(completedFutureClose(candles,new Date('2026-10-07T18:00:00+05:30'),null).date,'2026-10-06');
});
test('special sessions, holidays and absent closes do not fabricate a futures baseline',()=>{
  const extended={...session,sessions:[{...session.sessions[0],end:Date.parse('2026-10-07T19:30:00+05:30')}]};
  assert.equal(completedFutureClose([candle('2026-10-07',22618.4)],new Date('2026-10-07T18:00:00+05:30'),extended),null);
  assert.deepEqual(completedFutureClose([candle('2026-10-05',22000)],new Date('2026-10-07T18:00:00+05:30'),{...session,sessions:[]}),{price:22000,date:'2026-10-05'});
  assert.equal(completedFutureClose([candle('2026-10-07',NaN)],new Date('2026-10-07T18:00:00+05:30'),session),null);
});
