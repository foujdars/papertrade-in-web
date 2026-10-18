import test from 'node:test';
import assert from 'node:assert/strict';
import {readVisibleTimeRange} from '../lib/chart-visible-range.ts';
test('visible time ranges retain the library values and empty-state contract',()=>{
 const range={from:100,to:200};
 assert.equal(readVisibleTimeRange({getVisibleRange:()=>range}),range);
 assert.equal(readVisibleTimeRange({getVisibleRange:()=>null}),null);
});
test('temporary missing time points tolerate redraws without hiding other errors',()=>{
 let ready=false;
 const scale={getVisibleRange(){if(!ready)throw new Error('Value is null');return {from:100,to:200};}};
 assert.equal(readVisibleTimeRange(scale),null);ready=true;
 assert.deepEqual(readVisibleTimeRange(scale),{from:100,to:200});
 assert.throws(()=>readVisibleTimeRange({getVisibleRange(){throw new Error('Unexpected failure');}}),/Unexpected failure/);
});
