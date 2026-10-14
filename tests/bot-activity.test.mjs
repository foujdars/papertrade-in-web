import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { deleteBotActivity, visibleBotActivity } from '../lib/bot-activity.ts';
import { readGlobalAccount } from '../lib/global-order-engine.ts';
import { botDailyStats } from '../lib/paper-bot-engine.ts';

const now=1800000000000;
const row=(id,botId,kind='OPEN')=>({id,botId,kind,symbol:'BTCUSD',at:now,contracts:1,price:100,pnl:0,fee:1,detail:'Paper trade'});
const account=()=>({...readGlobalAccount(null),events:[row('bot-open','BTCUSD'),row('manual',undefined),row('bot-close','BTCUSD','CLOSE')]});

test('deletion persists and removes only the selected Bot activity row',()=>{
  const original=account(), next=deleteBotActivity(original,'bot-open');
  assert.deepEqual(visibleBotActivity(original).map(e=>e.id),['bot-open','bot-close']);
  assert.deepEqual(visibleBotActivity(next).map(e=>e.id),['bot-close']);
  assert.deepEqual(visibleBotActivity(readGlobalAccount(JSON.stringify(next))).map(e=>e.id),['bot-close']);
  assert.equal(next.revision,original.revision+1);
  assert.equal(deleteBotActivity(next,'bot-open'),next);
  assert.throws(()=>deleteBotActivity(original,'manual'),/no longer available/);
});

test('deleting activity cannot erase accounting records, balances or daily entry/loss limits',()=>{
  const original=account(), before=botDailyStats(original,'BTCUSD',now), next=deleteBotActivity(original,'bot-open');
  assert.equal(next.events,original.events);
  assert.equal(next.wallet,original.wallet);
  assert.equal(next.positions,original.positions);
  assert.deepEqual(botDailyStats(next,'BTCUSD',now),before);
  assert.equal(before.entries,1);
});

test('new activity remains visible, deletion IDs are validated, and the section starts collapsed',()=>{
  const next=deleteBotActivity(account(),'bot-open');
  next.events=[...next.events,row('new-open','BTCUSD')];
  assert.deepEqual(visibleBotActivity(next).map(e=>e.id),['bot-close','new-open']);
  for(const ids of [1,[null],[''],['same','same']])assert.throws(()=>readGlobalAccount(JSON.stringify({...next,deletedBotActivityIds:ids})),/activity settings/);
  const source=readFileSync(new URL('../components/BotActivity.tsx',import.meta.url),'utf8');
  assert.match(source,/<details className="bot-card bot-activity">/);
  assert.doesNotMatch(source,/<details[^>]*\bopen\b/);
});
