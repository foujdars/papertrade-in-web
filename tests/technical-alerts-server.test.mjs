import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
const bundle = await build({ entryPoints: ['lib/technical-alerts-server-model.ts'], bundle: true, write: false, platform: 'node', format: 'esm' });
const api = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const { applyTechnicalCommand: apply, readServerTechnicalStore: read } = api;
const now = Date.parse('2026-09-18T11:00:00+05:30');
const config = { family: 'volume', timeframe: '5m', condition: 'spike', period: 20, slow: 50, signal: 9, threshold: 70, multiplier: 2, repeat: 'once', cooldown: 0, days: 7 };
const instrument = { symbol: 'RELIANCE', name: 'Reliance', instrumentKey: 'NSE_EQ|INE002A01018', exchange: 'NSE', assetType: 'EQUITY' };
const create = overrides => ({ action: 'save', config, instrument, ...overrides });
test('server strips untrusted IDs, times, status and price; sets server-owned fields', () => {
  const store = apply(read(null), create({ config: { ...config, armedAt: 1, status: 'completed', lastBar: 9999999999 }, instrument: { ...instrument, price: 99999, hidden: 'secret' } }), now, 'id-1');
  const rule = store.rules[0]; assert.equal(rule.delivery, 'server'); assert.equal(rule.status, 'active'); assert.equal(rule.armedAt, now); assert.equal(rule.lastBar, undefined); assert.equal(rule.instrument.price, 0); assert.equal(rule.instrument.hidden, undefined);
});
test('concurrent edits require exact revision, deletion cannot target another account', () => {
  const store = apply(read(null), create(), now, 'id-1');
  assert.throws(() => apply(store, create({ id: 'id-1', revision: 'wrong' }), now, 'id-2'), e => e.status === 409);
  assert.throws(() => apply(read(null), { action: 'delete', id: 'id-1', revision: 'id-1' }, now, 'id-2'), e => e.status === 409);
  const next = apply(store, create({ id: 'id-1', revision: 'id-1' }), now + 1000, 'id-2');
  assert.equal(next.rules.length, 1); assert.equal(next.rules[0].revision, 'id-2');
});
test('pause/resume changes revision and fresh-watch timestamp; expired rules cannot resume', () => {
  const store = apply(read(null), create(), now, 'id-1');
  const paused = apply(store, { action: 'pause', id: 'id-1', revision: 'id-1' }, now + 1000, 'id-2');
  assert.equal(paused.rules[0].status, 'paused');
  const resumed = apply(paused, { action: 'resume', id: 'id-1', revision: 'id-2' }, now + 2000, 'id-3');
  assert.equal(resumed.rules[0].armedAt, now + 2000); assert.equal(resumed.rules[0].status, 'active');
  assert.throws(() => apply(paused, { action: 'resume', id: 'id-1', revision: 'id-2' }, now + 8 * 86400000, 'id-4'), /expired/);
});
test('invalid and index volume rules are rejected; SMC is deliberately unsupported', () => {
  for (const settings of [{ ...config, family: 'smc' }, { ...config, condition: 'bad' }, { ...config, period: NaN }]) assert.throws(() => apply(read(null), create({ config: settings }), now, 'id'));
  assert.throws(() => apply(read(null), create({ instrument: { ...instrument, instrumentKey: 'NSE_INDEX|Nifty 50' } }), now, 'id'), /volume/);
  assert.throws(() => apply(read(null), create({ instrument: { ...instrument, instrumentKey: '../../another-account' } }), now, 'id'), /instrument/);
});
test('deleting a rule retains its event history', () => {
  const store = apply(read(null), create(), now, 'id-1'); store.events = [{ id: 'event' }];
  const next = apply(store, { action: 'delete', id: 'id-1', revision: 'id-1' }, now, 'id-2');
  assert.equal(next.rules.length, 0); assert.equal(next.events.length, 1);
});


test('drawing alert metadata is retained and edit/resume clears quote baseline', () => {
 const price={...config,family:'price',timeframe:'1m',condition:'crossingUp',repeat:'repeat',threshold:100,delivery:'server',alertName:'My ray',message:'Watch level'};
 let store=apply(read(null),create({config:price}),now,'ray-1');
 assert.equal(store.rules[0].alertName,'My ray');assert.equal(store.rules[0].message,'Watch level');
 store.rules[0]={...store.rules[0],lastBar:123,lastQuoteAt:now+1000,lastQuotePrice:99};
 store=apply(store,{action:'pause',id:'ray-1',revision:'ray-1'},now+2000,'pause-1');
 store=apply(store,{action:'resume',id:'ray-1',revision:'pause-1'},now+3000,'resume-1');
 assert.equal(store.rules[0].lastQuoteAt,undefined);assert.equal(store.rules[0].lastQuotePrice,undefined);assert.equal(store.rules[0].lastBar,undefined);
 store.rules[0]={...store.rules[0],lastQuoteAt:now+4000,lastQuotePrice:99};
 store=apply(store,create({id:'ray-1',revision:'resume-1',config:price}),now+5000,'edit-1');
 assert.equal(store.rules[0].lastQuoteAt,undefined);assert.equal(store.rules[0].armedAt,now+5000);
});
