import test from 'node:test';
import assert from 'node:assert/strict';
import { globalClosedTrades, deleteGlobalPnlTrades } from '../lib/global-pnl.ts';
import { readGlobalAccount } from '../lib/global-order-engine.ts';
const event=(id,kind,contracts,price,fee=1)=>({id,kind,contracts,price,fee,at:1800000000000+Number(id)*1000,symbol:'BTCUSD',pnl:10,detail:'Long'});
const account=()=>({...readGlobalAccount(null),events:[event('1','OPEN',2,100,4),event('2','CLOSE',1,110),event('3','CLOSE',1,120)],optionEvents:[{...event('4','OPEN',1,30),symbol:'C-BTC-84000-170127'},{...event('5','CLOSE',1,40),symbol:'C-BTC-84000-170127'}]});
test('multiple perpetual and option exits are hidden atomically, persisted and idempotent',()=>{
 const a=account(),next=deleteGlobalPnlTrades(a,['global:perp:2','global:option:5','global:perp:2']);
 assert.deepEqual(globalClosedTrades(next).map(t=>t.id),['global:perp:3']);
 assert.deepEqual(globalClosedTrades(readGlobalAccount(JSON.stringify(next))).map(t=>t.id),['global:perp:3']);
 assert.equal(next.revision,a.revision+1);
 assert.equal(deleteGlobalPnlTrades(next,['global:perp:2']),next);
 assert.equal(deleteGlobalPnlTrades(a,[]),a);
});
test('deleting reports does not alter FIFO fees, events, balance, positions or orders',()=>{
 const a=account(),before=globalClosedTrades(a),next=deleteGlobalPnlTrades(a,['global:perp:2']);
 assert.deepEqual(globalClosedTrades(next).find(t=>t.id==='global:perp:3'),before.find(t=>t.id==='global:perp:3'));
 for(const key of ['wallet','events','optionEvents','positions','orders','bots'])assert.equal(next[key],a[key]);
 assert.equal(globalClosedTrades(a).length,3);
});
test('invalid batches reject without changing the account and malformed saved IDs fail safely',()=>{
 const a=account();
 for(const id of ['global:perp:1','global:perp:missing','indian:1'])assert.throws(()=>deleteGlobalPnlTrades(a,['global:perp:2',id]),/no longer available/);
 assert.equal(a.deletedGlobalPnlTradeIds,undefined);
 for(const ids of [null,1,['wrong'],['global:perp:2','global:perp:2']])assert.throws(()=>readGlobalAccount(JSON.stringify({...a,deletedGlobalPnlTradeIds:ids})),/deletion settings/);
});
