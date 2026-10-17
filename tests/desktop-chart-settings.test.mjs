import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_DESKTOP_CHART_SETTINGS, MAX_CHART_TEMPLATES, normalizeDesktopChartSettings, normalizeChartTemplates, desktopChartOptions, desktopSeriesOptions, resolveDesktopChartColors } from '../lib/desktop-chart-settings.ts';
import { chartCanvasPalette } from '../lib/desktop-chart-theme.ts';

const scope={mediaMatches:true,platform:'web',section:'trade',native:false};
const light=chartCanvasPalette('light',scope),dark=chartCanvasPalette('neon',scope);
test('invalid saved preferences cannot inject colors or invalid chart geometry',()=>{
  for(const input of [null,[],undefined,'settings',42])assert.deepEqual(normalizeDesktopChartSettings(input),DEFAULT_DESKTOP_CHART_SETTINGS);
  const saved=normalizeDesktopChartSettings({upColor:'url(https://untrusted.invalid)',downColor:'#AaB1C2',backgroundColor:'red',invertScale:'false',autoScale:false,scaleMode:'unknown',lineWidth:99,scaleMarginTop:Infinity,scaleMarginBottom:999,rightOffset:-8,gridStyle:-2,crosshairStyle:99});
  assert.equal(saved.upColor,null);assert.equal(saved.downColor,'#aab1c2');assert.equal(saved.backgroundColor,null);
  assert.equal(saved.invertScale,false);assert.equal(saved.autoScale,false);assert.equal(saved.scaleMode,'normal');
  assert.equal(saved.lineWidth,4);assert.equal(saved.scaleMarginTop,10);assert.equal(saved.scaleMarginBottom,40);assert.equal(saved.rightOffset,0);
  assert.equal(saved.gridStyle,0);assert.equal(saved.crosshairStyle,3);
});
test('automatic candle colors follow theme while explicit wick and border colors remain independent',()=>{
  const saved=normalizeDesktopChartSettings({upColor:'#123456',wickUpColor:'#111111',borderDownColor:'#222222'});
  const colors=resolveDesktopChartColors(saved,dark,'#556677');
  assert.equal(colors.up,'#123456');assert.equal(colors.wickUp,'#111111');assert.equal(colors.borderUp,'#123456');
  assert.equal(colors.wickDown,dark.down);assert.equal(colors.borderDown,'#222222');assert.equal(colors.background,dark.background);assert.equal(colors.line,'#556677');
  assert.equal(resolveDesktopChartColors(saved,light).background,light.background);
});
test('chart settings produce actual independent grid, axis, time and crosshair options',()=>{
  const saved=normalizeDesktopChartSettings({scaleMode:'log',autoScale:false,invertScale:true,scaleMarginTop:27,scaleMarginBottom:3,verticalGrid:false,horizontalGrid:true,timeVisible:true,secondsVisible:true,rightOffset:18,gridStyle:1,crosshairVisible:false,crosshairStyle:3,backgroundColor:'#010203'});
  const options=desktopChartOptions(saved,dark);
  assert.equal(options.layout.background.color,'#010203');assert.equal(options.grid.vertLines.visible,false);assert.equal(options.grid.horzLines.visible,true);assert.equal(options.grid.horzLines.style,1);
  assert.deepEqual(options.rightPriceScale,{mode:1,autoScale:false,invertScale:true,scaleMargins:{top:.27,bottom:.03}});
  assert.deepEqual(options.timeScale,{timeVisible:true,secondsVisible:true,rightOffset:18});
  assert.equal(options.crosshair.vertLine.visible,false);assert.equal(options.crosshair.horzLine.style,3);
  assert.equal(desktopChartOptions(saved,dark,true).timeScale.timeVisible,false);assert.equal(desktopChartOptions(saved,dark,true).timeScale.secondsVisible,false);
  for(const [mode,expected] of [['normal',0],['log',1],['percent',2],['indexed',3]])assert.equal(desktopChartOptions({...saved,scaleMode:mode},light).rightPriceScale.mode,expected);
});
test('series options apply supported settings to candles, bars, lines, area and baseline',()=>{
  const saved=normalizeDesktopChartSettings({wickVisible:false,borderVisible:false,priceLineVisible:true,lastValueVisible:false,lineWidth:4,lineColor:'#abcdef'});
  const candle=desktopSeriesOptions(saved,light,'candlestick');
  assert.equal(candle.wickVisible,false);assert.equal(candle.borderVisible,false);assert.equal(candle.lastValueVisible,false);assert.equal(candle.priceLineVisible,true);
  const bar=desktopSeriesOptions(saved,light,'bar');assert.equal(bar.upColor,light.up);assert.equal('wickVisible' in bar,false);
  const line=desktopSeriesOptions(saved,light,'line');assert.equal(line.color,'#abcdef');assert.equal(line.lineWidth,4);assert.equal('upColor' in line,false);
  const area=desktopSeriesOptions(saved,light,'area');assert.equal(area.topColor,'#abcdef47');assert.equal(area.bottomColor,'#abcdef0a');
  const baseline=desktopSeriesOptions(saved,light,'baseline');assert.equal(baseline.topLineColor,light.up);assert.equal(baseline.bottomLineColor,light.down);
});
test('appearance templates cap imported data, remove duplicate ids, and sanitize independent snapshots',()=>{
  const values=Array.from({length:20},(_,index)=>({id:`chart-${index}`,name:` Look ${index} `,savedAt:123,settings:{upColor:'#123456'}}));
  values.unshift(null,{id:'bad id',name:'invalid'},{id:'chart-0',name:' Saved zero ',savedAt:Infinity,settings:{lineWidth:999}});
  const templates=normalizeChartTemplates(values);
  assert.equal(templates.length,MAX_CHART_TEMPLATES);assert.equal(templates[0].name,'Saved zero');assert.equal(templates[0].savedAt,0);assert.equal(templates[0].settings.lineWidth,4);
  assert.equal(templates.filter(item=>item.id==='chart-0').length,1);
  assert.notEqual(templates[1].settings,templates[2].settings);assert.equal(templates[1].settings.upColor,'#123456');
  assert.deepEqual(normalizeChartTemplates({}),[]);
});
