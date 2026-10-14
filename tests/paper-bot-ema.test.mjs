import test from 'node:test';
import assert from 'node:assert/strict';
import { botFrames, botPreset, botRuleConfig, configureBot, defaultBot, validateBotConfig } from '../lib/paper-bot-state.ts';
import { advancePaperBots, botOrderPlan, botSignal } from '../lib/paper-bot-engine.ts';
import { botEmaSetup } from '../lib/paper-bot-ema-setups.ts';
import { closePerp } from '../lib/global-markets.ts';
import { readGlobalAccount } from '../lib/global-order-engine.ts';

const end = Math.ceil(1800000000000 / 300000) * 300000, now = end + 6000;
const flat = {open:100, high:101, low:99, close:100};
const alert = {open:105, high:112, low:104, close:110};
const cross = {open:99, high:103, low:98, close:102};
const pullback = {open:102, high:104, low:100.5, close:101};
const mirror = c => ({...c, open:200-c.open, close:200-c.close, high:200-c.low, low:200-c.high});
function bars(tail, mirrored = false) {
  const rows = [...Array.from({length:24}, () => flat), ...tail];
  return rows.map((c,i) => ({...(mirrored ? mirror(c) : c), time:end/1000-(rows.length-i)*300, volume:100}));
}
const spec = {symbol:'BTCUSD', lot:.01, tick:.01, initial:.01, maintenance:.005, initialScale:0, maintenanceScale:0, scalingThreshold:100000, maxNotional:5000000, maker:.0002, taker:.0005, liquidation:.0005, fundingSeconds:28800, operational:true, fetchedAt:now};
const quote = (bid, ask = bid + .01, at = now) => ({symbol:'BTCUSD', last:bid, mark:bid, index:bid, bid, ask, bidSize:10000, askSize:10000, funding:0, at, operational:true});
const create = (strategy='ema5', fields={}) => configureBot(undefined, {...botPreset(defaultBot('BTCUSD'), strategy), ...fields}, true, end-600000);
const account = bot => ({...readGlobalAccount(null), bots:[bot]});
const run = (bot, candles, price, a=account(bot), at=now) => advancePaperBots(a, {BTCUSD:{quote:quote(price,price+.01,at),spec}}, {'BTCUSD:5m':{candles,fetchedAt:at}}, at);

test('EMA 5 is sell-only, needs strict whole-candle separation, accepts either colour and requires no prior touch', () => {
  const bot = create();
  for (const candle of [alert, {...alert,open:111}]) {
    const rows = bars([candle]);
    assert.equal(botSignal(bot, rows, now, '5m', quote(104)).side, null, 'touching the entry low is not a break');
    assert.equal(botSignal(bot, rows, now, '5m', quote(103.99)).side, 'SELL');
    assert.equal(botSignal(bot, rows, now).side, null, 'a completed alert alone is not an entry');
  }
  const touching = bars([{open:102,high:104,low:101,close:103}]);
  assert.equal(botSignal(bot,touching,now,'5m',quote(100)).side,null, 'wick touching EMA disqualifies alert');
  assert.equal(botSignal(bot,bars([alert],true),now,'5m',quote(90)).side,null, 'no mirrored long setup');
  assert.equal(botEmaSetup(bars([{open:102,high:103,low:101.5,close:102},alert]),'ema5').bar.close,110);
});

test('EMA 5 replaces the alert before entry and uses that alert high for SL and at least 3R', () => {
  const bot = create('ema5',{exitMode:'percent',riskReward:1,stopBufferTicks:99});
  const latest = {...alert,open:110,close:112,low:108,high:115};
  const signal = botSignal(bot,bars([alert,latest]),now,'5m',quote(107));
  assert.equal(signal.side,'SELL');
  assert.equal(signal.bar.high,115);
  const plan = botOrderPlan(bot,signal,quote(107),spec);
  assert.equal(plan.stop,115);
  assert.equal(plan.target,83);
  assert.ok((plan.entry-plan.target)/(plan.stop-plan.entry)>=3);
  const used = bars([alert,{open:110,high:111,low:103,close:105}]);
  assert.equal(botSignal(bot,used,now,'5m',quote(102)).side,null, 'a historical break cannot be replayed');
});

test('EMA 21 buys red pullbacks above EMA and sells green pullbacks below EMA; trigger colour is unrestricted', () => {
  const bot = create('ema21');
  for (const mirrored of [false,true]) {
    const rows=bars([cross,pullback],mirrored);
    const signal=botSignal(bot,rows,now,'5m',quote(mirrored?95.99:104,mirrored?96:104.01));
    assert.equal(signal.side,mirrored?'SELL':'BUY');
    assert.equal(signal.bar.time,rows.at(-1).time);
    const plan=botOrderPlan(bot,signal,quote(mirrored?95.99:104,mirrored?96:104.01),spec);
    assert.equal(plan.stop,mirrored?99.51:100.49);
    const sign=mirrored?-1:1;
    assert.ok(sign*(plan.target-plan.entry)/(sign*(plan.entry-plan.stop))>=1.5-1e-10);
    assert.equal(botSignal(bot,rows,now,'5m',quote(mirrored?96:103.99,mirrored?96.01:104)).side,null,'exact boundary is not a break');
  }
  assert.equal(botSignal(bot,bars([cross,{...pullback,open:100.6}]),now,'5m',quote(105)).side,null,'wrong pullback colour');
  assert.equal(botSignal(bot,bars([cross,{...pullback,low:100}]),now,'5m',quote(105)).side,null,'wick below EMA');
});

test('EMA 21 pullback must form within the next 1–3 candles after a genuine cross', () => {
  const bot=create('ema21'), filler={open:101,high:103,low:100.8,close:102};
  for(const offset of [1,2,3]) {
    const rows=bars([cross,...Array.from({length:offset-1},()=>filler),{...pullback,low:100.8}]);
    assert.equal(botSignal(bot,rows,now,'5m',quote(105)).side,'BUY');
  }
  assert.equal(botSignal(bot,bars([cross,filler,filler,filler,pullback]),now,'5m',quote(105)).side,null);
  assert.equal(botSignal(bot,bars([{...cross,low:101,open:101,close:102},pullback,{open:101,high:106,low:100.5,close:105}]),now,'5m',quote(106)).side,null,'historical break consumes pullback');
});

test('setups use completed contiguous 5-minute candles; intrabar price triggers remain evaluable', () => {
  const bot=create(),rows=bars([alert]);
  assert.equal(botSignal(bot,rows,end+120000,'5m',quote(103)).side,'SELL');
  assert.throws(()=>botSignal(bot,rows,now,'15m',quote(103)),/5-minute/);
  assert.equal(botSignal(bot,rows,end,'5m',quote(103)).side,'SELL','completed alerts become usable immediately at close');
  assert.equal(botSignal(bot,rows,end-1,'5m',quote(103)).side,null,'the alert must finish before it is usable');
  const forming=[...bars([]),{...rows.at(-1),time:end/1000}];
  assert.equal(botSignal(bot,forming,now,'5m',quote(103)).side,null);
  assert.throws(()=>botSignal(bot,rows.filter((_,i)=>i!==10),now,'5m',quote(103)),/gaps/);
});

test('waiting on a closed candle does not prevent an intrabar entry; persisted setup IDs prevent replay after exit', () => {
  const bot=create(),rows=bars([alert]);
  const waiting=run(bot,rows,110);
  assert.equal(waiting.positions.length,0);
  const opened=run(bot,rows,103.99,waiting,now+10000);
  assert.equal(opened.positions.length,1);
  assert.equal(opened.positions[0].side,'SELL');
  assert.equal(opened.positions[0].protection.stopLoss.trigger,112);
  assert.equal(opened.positions[0].protection.takeProfit.trigger,79.96);
  const closed=closePerp(readGlobalAccount(JSON.stringify(opened)),'BTCUSD',quote(103.99),opened.positions[0].contracts,now+10000);
  assert.equal(run(bot,rows,103.99,closed,now+11000).positions.length,0);
  assert.equal(opened.bots[0].lastSetupId,botSignal(bot,rows,now,'5m',quote(103.99)).setupId);
});

test('start/restart cannot replay a setup completed before enabling and stale prices/history never enter', () => {
  const rows=bars([alert]),bot=create();
  const restarted=configureBot(bot,bot,true,end+1000);
  assert.equal(run(restarted,rows,103).positions.length,0);
  assert.equal(advancePaperBots(account(bot),{BTCUSD:{quote:quote(103,103.01,now-31000),spec}},{'BTCUSD:5m':{candles:rows,fetchedAt:now}},now).positions.length,0);
  assert.equal(advancePaperBots(account(bot),{BTCUSD:{quote:quote(103),spec}},{'BTCUSD:5m':{candles:rows,fetchedAt:now-31000}},now).positions.length,0);
});

test('EMA presets and saved-rule normalization force 5m and minimum R/R without breaking other strategies', () => {
  for(const strategy of ['ema5','ema21']) {
    const preset=botPreset(defaultBot('BTCUSD'),strategy);
    assert.deepEqual(botFrames(preset),['5m']);
    assert.equal(preset.riskReward,strategy==='ema5'?3:1.5);
    assert.equal(preset.direction,strategy==='ema5'?'short':'both');
    const old={...preset,timeframe:'15m',timeframes:['5m','15m'],direction:'long',exitMode:'percent',riskReward:1};
    const normalized=botRuleConfig(old);
    assert.equal(normalized.timeframe,'5m');
    assert.equal(normalized.exitMode,'signal');
    assert.equal(normalized.direction,strategy==='ema5'?'short':'long');
    assert.deepEqual(botFrames(old),['5m']);
    validateBotConfig(configureBot(undefined,old,true,now));
  }
  assert.deepEqual(botFrames({...defaultBot('BTCUSD'),timeframes:['5m','15m']}),['5m','15m']);
});

test('risk sizing respects its budget/notional cap and outward target rounding cannot reduce R/R', () => {
  const bot=create('ema21',{sizing:'risk',riskUsd:5,notional:1000,riskReward:1.5});
  const signal=botSignal(bot,bars([cross,pullback]),now,'5m',quote(104));
  const plan=botOrderPlan(bot,signal,quote(104),spec);
  assert.ok(plan.plannedRisk<=5);
  assert.ok(plan.contracts*spec.lot*plan.entry<=1000);
  assert.ok((plan.target-plan.entry)/(plan.entry-plan.stop)>=1.5-1e-10);
  assert.throws(()=>botOrderPlan({...bot,riskUsd:.1},signal,quote(104),{...spec,lot:1}),/below one/);
  assert.throws(()=>botOrderPlan(bot,signal,quote(90),spec),/wrong side|not broken/);
});


test('EMA 21 engine fills both directions with pullback-based protection on live trigger prices', () => {
  for(const mirrored of [false,true]) {
    const bot=create('ema21'), rows=bars([cross,pullback],mirrored);
    const opened=run(bot,rows,mirrored?95.99:104);
    assert.equal(opened.positions.length,1);
    assert.equal(opened.positions[0].side,mirrored?'SELL':'BUY');
    assert.equal(opened.positions[0].protection.stopLoss.trigger,mirrored?99.51:100.49);
  }
});


test('an already-running legacy EMA 5 bot adopts SELL/5m/3R rules on its next evaluation', () => {
  const legacy={...create(),direction:'long',timeframe:'15m',timeframes:['5m','15m'],exitMode:'percent',riskReward:1,stopBufferTicks:99};
  const opened=run(legacy,bars([alert]),103.99);
  assert.equal(opened.positions.length,1);
  assert.equal(opened.bots[0].direction,'short');
  assert.deepEqual(opened.bots[0].timeframes,['5m']);
  assert.equal(opened.positions[0].protection.stopLoss.trigger,112);
  assert.equal(opened.positions[0].protection.takeProfit.trigger,79.96);
});
