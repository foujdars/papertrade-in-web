import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { DrawingManager } from 'lightweight-charts-drawing';
import { MarketChart } from '../../components/MarketChart';
const attach = DrawingManager.prototype.attach;
DrawingManager.prototype.attach = function (...args) { window.qaChart=args[0]; window.qaSeries=args[1]; window.qaManager=this; return attach.apply(this,args); };
const globalMode = new URLSearchParams(location.search).has('global');
const instrument = {symbol:globalMode?'BTCUSD':'TEST',name:'Chart verification',price:110,change:0,exchange:globalMode?'DELTA':'NSE',instrumentKey:globalMode?'DELTA|BTCUSD':'NSE_EQ|TEST',categories:[]};
function App() {
 const [theme,setTheme]=useState('light'),[external,setExternal]=useState(window.fixtureCandles),[alternate,setAlternate]=useState(false);
 window.refreshGlobal=()=>setExternal(window.fixtureCandles.map((c,i)=>i===window.fixtureCandles.length-1?{...c,close:c.close+.1}:c));
 return <main className="terminal-shell" data-theme={theme} style={{display:'block',height:'100dvh'}}>
  <header style={{height:48,display:'flex',gap:12,padding:8}}><button onClick={()=>setTheme(t=>t==='light'?'neon':'light')}>Theme</button><button onClick={()=>setAlternate(v=>!v)}>Switch symbol</button></header>
  <div style={{height:'calc(100dvh - 48px)'}}><MarketChart instrument={alternate?{...instrument,symbol:'ETHUSD',instrumentKey:'DELTA|ETHUSD'}:instrument} timeframe={globalMode?'5m':'1D'} chartTheme={theme} externalCandles={globalMode?(alternate?window.fixtureCandles.slice(-40).map(c=>({...c,time:c.time+86400,open:50,high:52,low:49,close:51})):external):undefined} indicators={{}} onFeedStatus={()=>{}} onPrice={()=>{}} /></div>
 </main>;
}
createRoot(document.getElementById('root')).render(<App />);
