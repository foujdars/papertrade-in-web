import test from 'node:test';
import assert from 'node:assert/strict';
import {chartCanvasPalette,isDesktopWebChart,DESKTOP_CHART_MEDIA} from '../lib/desktop-chart-theme.ts';
import {MARKET_GREEN,MARKET_RED} from '../lib/market-colours.ts';
const desktop={mediaMatches:true,platform:'web',section:'trade',native:false};
test('desktop scope requires wide fine pointer web trade/F&O and rejects native regardless of width',()=>{
 assert.equal(DESKTOP_CHART_MEDIA,'(min-width: 941px) and (hover: hover) and (pointer: fine)');
 assert.equal(isDesktopWebChart(desktop),true);assert.equal(isDesktopWebChart({...desktop,section:'fno'}),true);
 for(const override of [{mediaMatches:false},{platform:'android'},{platform:null},{native:true},{section:'home'},{section:'research'},{section:null}])assert.equal(isDesktopWebChart({...desktop,...override}),false);
});
test('desktop dark and light tokens match requested chart colors without changing global market colors',()=>{
 const dark=chartCanvasPalette('neon',desktop),light=chartCanvasPalette('light',desktop);
 assert.equal(dark.background,'#0f0f0f');assert.equal(dark.grid,'#2e2e2e');assert.equal(dark.text,'#b2b5be');assert.equal(dark.border,'#2e2e2e');
 assert.equal(light.background,'#ffffff');assert.equal(light.grid,'#f0f3fa');assert.equal(light.text,'#787b86');assert.equal(light.border,'#ebebeb');
 for(const palette of [dark,light]){assert.equal(palette.accent,'#2962ff');assert.equal(palette.up,'#089981');assert.equal(palette.down,'#f23645');}
 assert.notEqual(MARKET_GREEN,dark.up);assert.notEqual(MARKET_RED,dark.down);
});
test('mobile coarse pointer native large-screen and unrelated sections retain exact baseline palettes',()=>{
 const baseline={
  neon:{desktop:false,accent:'#bf9aff',background:'#0c142b',text:'#a4adc7',grid:'#19233c',border:'#2c3859',separator:'#2c3859',separatorHover:'#bf9aff',crosshair:'#bf9aff',crosshairLabel:'#342353',up:MARKET_GREEN,down:MARKET_RED},
  light:{desktop:false,accent:'#8054da',background:'#ffffff',text:'#65708a',grid:'#edf0f6',border:'#dfe3ec',separator:'#e3e6ee',separatorHover:'#d8d3ff',crosshair:'#8c96aa',crosshairLabel:'#252b3d',up:MARKET_GREEN,down:MARKET_RED},
 };
 for(const theme of ['light','neon'])for(const override of [{mediaMatches:false},{platform:'android'},{native:true},{section:'home'},{platform:null}])assert.deepEqual(chartCanvasPalette(theme,{...desktop,...override}),baseline[theme]);
 // Leaving the media boundary restores the same tokens rather than retaining desktop colors.
 chartCanvasPalette('neon',desktop);assert.deepEqual(chartCanvasPalette('neon',{...desktop,mediaMatches:false}),baseline.neon);
});
