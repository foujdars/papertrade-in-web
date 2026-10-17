import test from 'node:test';
import assert from 'node:assert/strict';
import { averageCandleVolume, desktopVolumeCandleColors } from '../lib/desktop-volume-candles.ts';
import { volumeCandleColor } from '../lib/chart-style.ts';
import { MARKET_GREEN, MARKET_RED } from '../lib/market-colours.ts';

const candle=(volume,up=true)=>({time:1700000000,open:10,close:up?11:9,high:12,low:8,volume});
const baseline={up:MARKET_GREEN,down:MARKET_RED,wickUp:MARKET_GREEN,wickDown:MARKET_RED,borderUp:MARKET_GREEN,borderDown:MARKET_RED};
test('volume tint retains the legacy weighting for both candle directions',()=>{
  const bars=[candle(100),candle(500,false),candle(2500),candle(0,false)];
  const average=averageCandleVolume(bars);
  assert.equal(average,3100/3);
  for(const bar of bars){const expected=volumeCandleColor(bar,bars);assert.deepEqual(desktopVolumeCandleColors(bar,average,baseline),{color:expected,wickColor:expected,borderColor:expected});}
});
test('custom body wick and border colors tint correctly even when low volume blends to a different hex string',()=>{
  const colors={up:'#0000ff',down:'#ff0000',wickUp:'#00ff00',wickDown:'#000000',borderUp:'#ff00ff',borderDown:'#00ffff'};
  const low=desktopVolumeCandleColors(candle(1),1000,colors);
  assert.deepEqual(low,{color:'#b8b8ff',wickColor:'#b8ffb8',borderColor:'#ffb8ff'});
  assert.equal(low.color.startsWith(colors.up),false);
  assert.deepEqual(desktopVolumeCandleColors(candle(2000,false),1000,colors),{color:'#ff0000',wickColor:'#000000',borderColor:'#00ffff'});
});
test('missing volume stays finite and does not count invalid or zero values toward the average',()=>{
  assert.equal(averageCandleVolume([candle(0),candle(NaN),candle(-2)]),1);
  assert.equal(averageCandleVolume([candle(0),candle(10),candle(30)]),20);
  const result=desktopVolumeCandleColors(candle(0),1,baseline);
  for(const value of Object.values(result))assert.match(value,/^#[a-f0-9]{6}$/);
});
