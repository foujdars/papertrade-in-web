import test from 'node:test';
import assert from 'node:assert/strict';
import { STUDIES, studyDefaults } from '../lib/indicator-catalog.ts';
import { indicatorSearchRank, movingAverageWarmup } from '../lib/indicator-discovery.ts';
const results=q=>STUDIES.filter(s=>Number.isFinite(indicatorSearchRank(s,q))).sort((a,b)=>indicatorSearchRank(a,q)-indicatorSearchRank(b,q)||a.name.localeCompare(b.name));
test('exact indicator names precede prefix and substring matches',()=>{
 assert.equal(results('moving average')[0].id,'ma');
 assert.equal(results(' Moving   Average ')[0].id,'ma');
 assert.equal(results('ma')[0].id,'ma');
 assert.ok(results('moving average').findIndex(s=>s.id==='alma')>results('moving average').findIndex(s=>s.id==='ma-channel'));
 assert.equal(results('unknown study').length,0);
});
test('warmup follows configured lengths, hidden state and timeframe filters',()=>{
 const ma={...studyDefaults('ma'),inputs:{length:200}};
 assert.equal(movingAverageWarmup({ma:true},{ma},'1D'),199);
 assert.equal(movingAverageWarmup({ma:true},{ma:{...ma,hidden:true}},'1D'),0);
 assert.equal(movingAverageWarmup({ma:true},{ma:{...ma,timeframes:['5m']}},'1D'),0);
 assert.equal(movingAverageWarmup({sma200:true},{},'1D'),199);
 assert.equal(movingAverageWarmup({ma:false},{ma},'1D'),0);
 assert.equal(movingAverageWarmup({ma:true},{ma:{...ma,inputs:{length:500}}},'1D'),499);
});
