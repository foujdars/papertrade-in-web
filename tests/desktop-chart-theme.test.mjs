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
function luminance(hex){
 const channels=hex.slice(1).match(/../g).map(v=>parseInt(v,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);
 return channels[0]*.2126+channels[1]*.7152+channels[2]*.0722;
}

test('both chart themes have darker surfaces than their app canvas and readable axis text',()=>{
 for(const [theme,canvas] of [['neon','#202d40'],['light','#fafbff']]){
  const palette=chartCanvasPalette(theme,desktop);
  assert.ok(luminance(palette.background)<luminance(canvas));
  const levels=[luminance(palette.background),luminance(palette.text)].sort((a,b)=>b-a);
  assert.ok((levels[0]+.05)/(levels[1]+.05)>=4.5);
  assert.equal(palette.up,'#089981');assert.equal(palette.down,'#f23645');
 }
});

test('all platforms share theme surfaces while mobile retains semantic market candle colors',()=>{
 for(const theme of ['light','neon'])for(const override of [{mediaMatches:false},{platform:'android'},{native:true},{section:'home'},{platform:null}]){
  const palette=chartCanvasPalette(theme,{...desktop,...override});
  const expected=chartCanvasPalette(theme,desktop);
  assert.equal(palette.desktop,false);
  for(const key of ['accent','background','text','grid','border','separator','separatorHover','crosshair','crosshairLabel'])assert.equal(palette[key],expected[key]);
  assert.equal(palette.up,MARKET_GREEN);assert.equal(palette.down,MARKET_RED);
 }
});
