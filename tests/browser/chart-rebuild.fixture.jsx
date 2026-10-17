import React,{useState} from 'react';
import {Capacitor} from '@capacitor/core';
import {createRoot} from 'react-dom/client';
import {DrawingManager} from 'lightweight-charts-drawing';
import {MarketChart,DEFAULT_CHART_INDICATORS} from '../../components/MarketChart';
import {ChartFunctionMenu} from '../../components/ChartFunctionMenu';
import {ChartStudyRenderer} from '../../lib/chart-study-renderer';
import {useChartPreference} from '../../lib/chart-view-preferences';
const attach=DrawingManager.prototype.attach;DrawingManager.prototype.attach=function(...args){window.qaChart=args[0];window.qaSeries=args[1];window.qaManager=this;return attach.apply(this,args);};
const sync=ChartStudyRenderer.prototype.sync;ChartStudyRenderer.prototype.sync=function(...args){const value=sync.apply(this,args);window.qaRenderer=this;return value;};
const instrument={symbol:'TEST',name:'Chart workspace test',price:130,change:0,exchange:'NSE',instrumentKey:'NSE_EQ|CHART_REBUILD',categories:[]};
const candles=Array.from({length:180},(_,i)=>{const close=100+i*.2+Math.sin(i/4)*6;return {time:1700000000+i*300,open:close-1,high:close+2,low:close-2,close,volume:1000+i*20};});
function App(){
 const [theme,setTheme]=useState('light'),[platform,setPlatform]=useState('web'),[functions,setFunctions]=useState(false),[action,setAction]=useState(),[indicators,setIndicators]=useState({...DEFAULT_CHART_INDICATORS,ema21:true,rsi:true}),[bars,setBars]=useState(candles);
 const [,setStyle]=useChartPreference('chartStyle');window.qaStyle=setStyle;window.qaPlatform=setPlatform;window.qaNative=platform=>{Capacitor.isNativePlatform=()=>platform!=='web';Capacitor.getPlatform=()=>platform;setPlatform(platform);};window.qaTick=()=>setBars(old=>old.map((c,i)=>i===old.length-1?{...c,close:c.close+.01,high:c.high+.01}:c));
 return <main className="terminal-shell" data-platform={platform} data-section="trade" data-theme={theme}><header className="qa-controls"><button onClick={()=>setFunctions(true)}>Functions</button><button onClick={()=>{const next=theme==='light'?'neon':'light';document.documentElement.dataset.theme=next;setTheme(next);}}>Theme</button></header><MarketChart instrument={instrument} timeframe="5m" externalCandles={bars} activeTool="cursor" chartTheme={theme} indicators={indicators} chartAction={action} onRemoveIndicator={id=>setIndicators(current=>({...current,[id]:false}))} onFeedStatus={()=>{}}/>{functions&&<ChartFunctionMenu indicators={indicators} onToggleIndicator={id=>setIndicators(current=>({...current,[id]:!current[id]}))} onAction={type=>setAction({type,token:Date.now()})} onClose={()=>setFunctions(false)}/>}</main>;
}
createRoot(document.getElementById('root')).render(<App/>);
