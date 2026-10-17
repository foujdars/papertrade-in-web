import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MarketChart, DEFAULT_CHART_INDICATORS } from '../../components/MarketChart';
import { ChartStudyRenderer } from '../../lib/chart-study-renderer';
const sync=ChartStudyRenderer.prototype.sync;
ChartStudyRenderer.prototype.sync=function(...args){const result=sync.apply(this,args);window.qaRenderer=this;return result;};
const instrument={symbol:'TEST',name:'Test Company',price:110,change:0,exchange:'NSE',instrumentKey:'NSE_EQ|INE002A01018',categories:[]};
const candles=Array.from({length:160},(_,i)=>{const close=100+i*.2+Math.sin(i/4)*6;return {time:1700000000+i*300,open:close-1,high:close+2,low:close-2,close,volume:1000};});
function App(){
  const [theme,setTheme]=useState('light'),[platform,setPlatform]=useState('web'),[bars,setBars]=useState(candles);
  window.qaTick=()=>setBars(previous=>previous.map((c,i)=>i===previous.length-1?{...c,close:c.close+.001,high:c.high+.001}:c));
  window.qaPlatform=setPlatform;
  return <main className="terminal-shell" data-platform={platform} data-section="trade" data-theme={theme}>
    <button onClick={()=>{const next=theme==='light'?'neon':'light';document.documentElement.dataset.theme=next;setTheme(next);}}>Theme</button>
    <MarketChart instrument={instrument} timeframe="5m" externalCandles={bars} activeTool="cursor" magnet={false} chartTheme={theme} indicators={{...DEFAULT_CHART_INDICATORS,ema21:true,rsi:true}} onFeedStatus={()=>{}}/>
  </main>;
}
createRoot(document.getElementById('root')).render(<App/>);
