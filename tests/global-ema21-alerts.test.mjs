import assert from 'node:assert/strict';
import test from 'node:test';
import { ema21EntrySignal, ema21EntryAt, evaluateGlobalAlert, globalAlertError } from '../lib/global-alerts.ts';
import { average } from '../lib/study-calculations.ts';

function scenario(seconds, { redDelay = 1, entryDelay = 1, bearish = false } = {}) {
  const closes = Array.from({length: 24}, () => ({open:100, high:101, low:99, close:100}));
  closes.push({open:99, high:103, low:98, close:102});
  for (let i = 1; i < redDelay; i++) closes.push({open:101, high:102, low:100.5, close:101});
  closes.push({open:102, high:104, low:100.5, close:101});
  for (let i = 1; i < entryDelay; i++) closes.push({open:101, high:102, low:100.5, close:101});
  closes.push({open:101, high:106, low:100, close:105});
  const currentTime = Math.floor(1800000000 / seconds) * seconds;
  const bars = closes.map((c, index) => ({...c, time:currentTime - (closes.length - 1 - index) * seconds, volume:10}));
  const reflect = c => ({...c, open:200-c.open, high:200-c.low, low:200-c.high, close:200-c.close});
  const candles = bearish ? bars.map(reflect) : bars;
  const at = (currentTime + 60) * 1000;
  const quote = {symbol:'BTCUSD', at, last:bearish ? 95 : 105, mark:100, bid:99, ask:101, bidSize:1, askSize:1, funding:0, operational:true};
  const rule = {id:'entry', symbol:'BTCUSD', kind:bearish?'ema21-entry-bearish':'ema21-entry-bullish', value:0,
    length:21, timeframe:seconds === 300?'5m':'15m', createdAt:at - 120000, expiresAt:at + 86400000};
  return {candles, quote, rule, now:at+1000};
}

for (const seconds of [300,900]) for (const bearish of [false,true]) {
  test(`${seconds/60}m ${bearish?'bearish':'bullish'} EMA entry requires the pullback and live break`, () => {
    const {candles,quote,rule,now} = scenario(seconds,{bearish});
    assert.equal(globalAlertError(rule),null);
    assert.equal(ema21EntrySignal(candles,quote,rule.timeframe,now),bearish?'bearish':'bullish');
    for (const symbol of ['BTCUSD','ETHUSD','XAUTUSD']) {
      assert.equal(evaluateGlobalAlert({...rule,symbol}, {...quote,symbol},candles,now),true);
    }
    assert.equal(evaluateGlobalAlert({...rule,kind:'ema21-entry-either'},quote,candles,now),true);
    assert.equal(evaluateGlobalAlert({...rule,kind:bearish?'ema21-entry-bullish':'ema21-entry-bearish'},quote,candles,now),false);
    assert.equal(evaluateGlobalAlert({...rule,createdAt:quote.at},quote,candles,now),false);
    assert.equal(evaluateGlobalAlert({...rule,triggeredAt:now},quote,candles,now),false);
    assert.equal(evaluateGlobalAlert(rule,{...quote,at:quote.at-60000},candles,now),false);
    assert.equal(evaluateGlobalAlert(rule,quote,candles.filter(c=>c.time!==candles.at(-1).time),now),false);
    assert.ok(globalAlertError({...rule,symbol:'BRENT'}));
    assert.ok(globalAlertError({...rule,length:20}));
    assert.ok(globalAlertError({...rule,timeframe:'1m'}));
  });
}

test('red/green reference can be either of the first two bars; trigger must be within the next three', () => {
  for (const redDelay of [1,2]) for (const entryDelay of [1,2,3]) {
    const {candles,quote,rule,now}=scenario(300,{redDelay,entryDelay});
    assert.equal(evaluateGlobalAlert(rule,quote,candles,now),true,`${redDelay}/${entryDelay}`);
  }
  for (const choice of [{redDelay:3},{entryDelay:4}]) {
    const {candles,quote,rule,now}=scenario(300,choice);
    assert.equal(evaluateGlobalAlert(rule,quote,candles,now),false,JSON.stringify(choice));
  }
});

test('EMA wick touches, wrong candle colour, stale quotes and missed first entries do not alert', () => {
  const {candles,quote,rule,now}=scenario(300);
  const cross=candles.at(-3), red=candles.at(-2), current=candles.at(-1);
  assert.equal(evaluateGlobalAlert(rule,quote,candles.map(c=>c===cross?{...c,close:100}:c),now),false);
  assert.equal(evaluateGlobalAlert(rule,quote,candles.map(c=>c===red?{...c,close:100}:c),now),false);
  assert.equal(evaluateGlobalAlert(rule,{...quote,last:103},candles,now),false);
  assert.equal(evaluateGlobalAlert(rule,quote,candles.map(c=>c===current?{...c,open:106}:c),now),false);
  const later=scenario(300,{entryDelay:2});
  const first=later.candles.at(-2);
  assert.equal(evaluateGlobalAlert(later.rule,later.quote,later.candles.map(c=>c===first?{...c,open:101,close:105,high:105}:c),later.now),false);
});

test('EMA 21 chart arrow marks the green candle that breaks the red candle high, even if it closes below that high', () => {
  const {candles}=scenario(300);
  const last=candles.length-1;
  const values=average(candles.map(c=>c.close),21,'EMA');
  const trigger={...candles[last],close:103,high:105};
  const rows=[...candles.slice(0,-1),trigger];
  assert.equal(ema21EntryAt(rows,last,values,300,trigger.high,trigger.low,trigger.close),'bullish');
  assert.equal(ema21EntryAt(rows,last,values,300,103,103,103),null,'forming candle waits for a live break');
  assert.equal(ema21EntryAt(rows,last,values,300,105,105,105),'bullish','forming green candle shows an arrow at the entry');
});
