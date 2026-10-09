import test from 'node:test';
import assert from 'node:assert/strict';
import {priceRangeWithoutZeroAnchor as fit} from '../lib/chart-price-range.ts';
test('zero anchor cannot flatten positive NIFTY candles while valid high levels remain',()=>{
 assert.deepEqual(fit({minValue:0,maxValue:24800},[{low:22200,high:24000},{low:22300,high:22800}]),{minValue:22200,maxValue:24800});
});
test('valid ranges, negative/zero-price instruments and unloaded data retain their scale',()=>{
 for(const bars of [[],[{low:-5,high:10}],[{low:0,high:2}],[{low:NaN,high:3}]])assert.deepEqual(fit({minValue:0,maxValue:10},bars),{minValue:0,maxValue:10});
 assert.deepEqual(fit({minValue:80,maxValue:130},[{low:100,high:110}]),{minValue:80,maxValue:130});
});
