import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {DrawingManager} from 'lightweight-charts-drawing';
import {MarketChart,DEFAULT_CHART_INDICATORS} from '../../components/MarketChart';
import {useChartPreference} from '../../lib/chart-view-preferences';
import {useDesktopChartSettings} from '../../lib/desktop-chart-preferences';
const attach=DrawingManager.prototype.attach;DrawingManager.prototype.attach=function(...args){window.qaChart=args[0];window.qaSeries=args[1];return attach.apply(this,args);};
const instrument={symbol:'TEST',name:'Appearance regression',price:130,change:0,exchange:'NSE',instrumentKey:'NSE_EQ|CHART_APPEARANCE',categories:[]};
const candles=Array.from({length:180},(_,i)=>{const close=100+i*.2+Math.sin(i/4)*6;return {time:1700000000+i*300,open:close+(i%2?1:-1),high:close+2,low:close-2,close,volume:1000+i*20};});
function App(){
 const [platform,setPlatform]=useState('web'),[bars,setBars]=useState(candles),[order,setOrder]=useState(false);
 const [,setStyle]=useChartPreference('chartStyle'),[,setPrimary]=useChartPreference('primaryLineColor'),[,setCompared]=useChartPreference('comparedSymbols'),[,setAppearance]=useDesktopChartSettings();
 window.qaStyle=setStyle;window.qaPrimary=setPrimary;window.qaPlatform=setPlatform;window.qaOrder=setOrder;
 window.qaAppearance=patch=>setAppearance(previous=>({...previous,...patch}));
 window.qaCompare=enabled=>setCompared(enabled?[{instrumentKey:'NSE_INDEX|Nifty 50',symbol:'NIFTY',name:'Nifty 50',exchange:'NSE'}]:[]);
 window.qaTick=()=>setBars(old=>old.map((c,i)=>i===old.length-1?{...c,close:c.close+.01,high:c.high+.01}:c));
 return <main className="terminal-shell" data-platform={platform} data-section="trade" data-theme="light"><MarketChart instrument={instrument} timeframe="5m" externalCandles={bars} activeTool="cursor" indicators={DEFAULT_CHART_INDICATORS} onFeedStatus={()=>{}} orderTool={{enabled:order,side:'BUY',entryPrice:110,targetPrice:150,stopLossPrice:90,quantity:1,referencePrice:bars.at(-1).close}} /></main>;
}
createRoot(document.getElementById('root')).render(<App/>);
