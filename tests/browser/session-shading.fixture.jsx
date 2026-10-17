import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { DrawingManager } from 'lightweight-charts-drawing';
import { ChartTimeframeMenu } from '../../components/CompactSelectors';
import { MarketChart } from '../../components/MarketChart';
const attach=DrawingManager.prototype.attach;
DrawingManager.prototype.attach=function(...args){window.qaChart=args[0];window.qaSeries=args[1];return attach.apply(this,args);};
function App(){
 const [picker,setPicker]=useState(false);
 const [theme,setTheme]=useState('light'),[frame,setFrame]=useState('5m'),[bars,setBars]=useState([]);
 window.loadSessionBars=()=>setBars(window.fixtureCandles);
 const global=new URLSearchParams(location.search).has('global');
 return <main className="terminal-shell" data-theme={theme} style={{height:'100vh'}}><button onClick={()=>setPicker(true)}>Timeframe picker</button>{picker&&<ChartTimeframeMenu current={frame} onSelect={value=>{setFrame(value);setPicker(false);}} onClose={()=>setPicker(false)}/>}<button onClick={()=>setTheme(v=>v==='light'?'neon':'light')}>Theme</button><button onClick={()=>setFrame(v=>v==='5m'?'1D':'5m')}>Frame</button>{["1m","15m","30m","1H","4H","5m"].map(v=><button key={v} onClick={()=>setFrame(v)}>{v}</button>)}<div style={{height:'calc(100vh - 30px)'}}><MarketChart instrument={{symbol:global?'BTCUSD':'NIFTY',name:'Session test',exchange:global?'DELTA':'NSE',instrumentKey:global?'DELTA|BTCUSD':'NSE_INDEX|Nifty 50',price:100,change:0,categories:[]}} timeframe={frame} externalCandles={bars} indicators={{}} /></div></main>;
}
createRoot(document.getElementById('root')).render(<App/>);
