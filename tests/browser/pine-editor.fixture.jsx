import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {MarketChart,DEFAULT_CHART_INDICATORS} from '../../components/MarketChart';
import {ChartFunctionMenu} from '../../components/ChartFunctionMenu';
import {ChartStudyRenderer} from '../../lib/chart-study-renderer';
const sync=ChartStudyRenderer.prototype.sync;
ChartStudyRenderer.prototype.sync=function(...args){const result=sync.apply(this,args);window.qaRenderer=this;window.qaChart=this.chart;return result;};
const instrument={symbol:'TEST',name:'Test Company',price:110,change:0,exchange:'NSE',instrumentKey:'NSE_EQ|INE002A01018',categories:[]};
function App(){const [theme,setTheme]=useState('light'),[functions,setFunctions]=useState(false),[action,setAction]=useState(),[secondary,setSecondary]=useState(false);window.qaMountSecondary=()=>setSecondary(true);return <main className="terminal-shell" data-theme={theme}><button onClick={()=>setFunctions(true)}>Functions</button>{functions&&<ChartFunctionMenu indicators={DEFAULT_CHART_INDICATORS} onToggleIndicator={()=>{}} onAction={type=>setAction(current=>({type,token:(current?.token??0)+1,instrumentKey:instrument.instrumentKey,timeframe:"1D"}))} onClose={()=>setFunctions(false)}/>}<button onClick={()=>{const next=theme==='light'?'neon':'light';document.documentElement.dataset.theme=next;setTheme(next);}}>Theme</button><MarketChart chartAction={action} instrument={instrument} timeframe="1D" activeTool="cursor" magnet={false} chartTheme={theme} indicators={{...DEFAULT_CHART_INDICATORS,ema21:true,rsi:true}} onFeedStatus={()=>{}}/>{secondary&&<MarketChart chartAction={action} instrument={{...instrument,instrumentKey:"NSE_EQ|INE001A01018",symbol:"SECOND"}} timeframe="1D" activeTool="cursor" magnet={false} chartTheme={theme} indicators={DEFAULT_CHART_INDICATORS} onFeedStatus={()=>{}}/>}</main>;}
createRoot(document.getElementById('root')).render(<App/>);
