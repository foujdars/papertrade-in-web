import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {MarketChart,DEFAULT_CHART_INDICATORS} from '../../components/MarketChart';
import {ChartStudyRenderer} from '../../lib/chart-study-renderer';
const sync=ChartStudyRenderer.prototype.sync;
ChartStudyRenderer.prototype.sync=function(...args){const result=sync.apply(this,args);window.qaRenderer=this;window.qaChart=this.chart;return result;};
const instrument={symbol:'TEST',name:'Test Company',price:110,change:0,exchange:'NSE',instrumentKey:'NSE_EQ|INE002A01018',categories:[]};
function App(){const [theme,setTheme]=useState('light');return <main className="terminal-shell" data-theme={theme}><button onClick={()=>{const next=theme==='light'?'neon':'light';document.documentElement.dataset.theme=next;setTheme(next);}}>Theme</button><MarketChart instrument={instrument} timeframe="1D" activeTool="cursor" magnet={false} chartTheme={theme} indicators={{...DEFAULT_CHART_INDICATORS,ema21:true,rsi:true}} onFeedStatus={()=>{}}/></main>;}
createRoot(document.getElementById('root')).render(<App/>);
