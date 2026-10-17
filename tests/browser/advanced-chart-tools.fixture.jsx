import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {DrawingManager} from 'lightweight-charts-drawing';
import {MarketChart} from '../../components/MarketChart';
import {ChartFunctionMenu} from '../../components/ChartFunctionMenu';
import {ChartStudyRenderer} from '../../lib/chart-study-renderer';
import {AnchoredVwapOverlay} from '../../lib/anchored-vwap-overlay';
import {IchimokuCloud} from '../../lib/ichimoku-cloud';
const attach=DrawingManager.prototype.attach;DrawingManager.prototype.attach=function(...args){window.qaChart=args[0];window.qaCandles=args[1];window.qaManager=this;return attach.apply(this,args);};
for(const [Type,key] of [[AnchoredVwapOverlay,'qaVwap'],[IchimokuCloud,'qaCloud']]){const update=Type.prototype.update;Type.prototype.update=function(...args){window[key]=this;return update.apply(this,args);};}
const sync=ChartStudyRenderer.prototype.sync;ChartStudyRenderer.prototype.sync=function(...args){window.qaStudies=this;return sync.apply(this,args);};
const instrument={symbol:'TEST',name:'Advanced chart test',price:110,change:0,exchange:'NSE',instrumentKey:'NSE_EQ|TEST',categories:[]};
const start=Date.parse('2026-09-18T09:15:00+05:30')/1000;
const candles=Array.from({length:330},(_,i)=>{const close=100+i*.03+4*Math.sin(i/9);return {time:start+i*300,open:close-.3,high:close+1,low:close-1,close,volume:1000+i*7};});
function App(){
 const [indicators,setIndicators]=useState({ichimoku:true,macd:true,'anchored-vwap':true}),[open,setOpen]=useState(false),[theme,setTheme]=useState('light'),[host,setHost]=useState(null),[replay,setReplay]=useState(false),[count,setCount]=useState(330),[hidden,setHidden]=useState(false),[timeframe,setTimeframe]=useState('5m');
 window.qaSetIndicators=setIndicators;window.qaSetReplay=setReplay;window.qaSetCount=setCount;window.qaSetTimeframe=setTimeframe;
 return <main className="terminal-shell" data-theme={theme} style={{display:'block',height:'100dvh'}}><header style={{height:45,display:'flex',gap:10}}><button onClick={()=>setOpen(true)}>Functions</button><button onClick={()=>setTheme(t=>t==='light'?'neon':'light')}>Theme</button><button onClick={()=>setHidden(v=>!v)}>Hide drawings</button></header><div style={{height:'calc(100dvh - 75px)'}}><MarketChart instrument={instrument} timeframe={timeframe} activeTool="cursor" magnet={false} hiddenDrawings={hidden} externalCandles={candles.slice(0,count)} replayCandles={replay?candles.slice(0,count):undefined} indicators={indicators} indicatorHost={host} chartTheme={theme} onFeedStatus={()=>{}} onRemoveIndicator={id=>setIndicators(v=>({...v,[id]:false}))}/></div><div className="chart-statusbar"><div className="chart-indicator-slot" ref={setHost}/></div>{open&&<ChartFunctionMenu indicators={indicators} onToggleIndicator={id=>setIndicators(v=>({...v,[id]:!v[id]}))} onAction={()=>{}} onClose={()=>setOpen(false)}/>}</main>;
}
createRoot(document.getElementById('root')).render(<App/>);
