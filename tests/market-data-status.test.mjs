import test from 'node:test';
import assert from 'node:assert/strict';
import {marketDataLabel,marketTimeLabel} from '../lib/market-data-status.ts';
const now=Date.parse('2026-10-12T05:00:00Z');
test('refresh failure and stale tabs retain truth about last available snapshots',()=>{
 const meta={status:'verified',marketOpen:true,fetchedAt:new Date(now).toISOString()};
 assert.equal(marketDataLabel(meta,false,now),'Broker-checked quotes');
 assert.match(marketDataLabel(meta,true,now),/Refresh failed/);
 assert.match(marketDataLabel({...meta,staleTabs:['gainers']},false,now,'gainers'),/Refresh failed/);
 assert.match(marketDataLabel(meta,false,now+65_000),/overdue/);
 assert.match(marketDataLabel({...meta,marketOpen:false},false,now+65_000),/Market closed/);
});
test('unknown or delayed timing cannot be described as current verified data',()=>{
 assert.match(marketDataLabel(null),/unavailable/);
 assert.match(marketDataLabel({status:'delayed'}),/Delayed scanner/);
 assert.match(marketDataLabel({status:'delayed',source:'upstox'}),/Delayed broker/);
 assert.match(marketTimeLabel(null),/unavailable/);
 assert.equal(marketTimeLabel('broken','Checked'),'');
 assert.match(marketTimeLabel(new Date(now).toISOString(),'Checked'),/10:30:00 IST/);
});
