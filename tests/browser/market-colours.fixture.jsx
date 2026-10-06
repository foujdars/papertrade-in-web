import React, {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {DrawingManager} from 'lightweight-charts-drawing';
import {MarketChart} from '../../components/MarketChart';
import {IndiaPulse} from '../../components/IndiaPulse';
const attach=DrawingManager.prototype.attach;
DrawingManager.prototype.attach=function(...args){window.qaChart=args[0];window.qaSeries=args[1];return attach.apply(this,args);};
const instrument={symbol:'BTCUSD',name:'Bitcoin perpetual',price:106,change:0,exchange:'DELTA',instrumentKey:'DELTA|BTCUSD',categories:[]};
function App(){
 const [theme,setTheme]=useState('light');
 return <main className="terminal-shell" data-theme={theme} style={{display:'block',minHeight:'100dvh'}}>
  <header style={{padding:8}}><button onClick={()=>setTheme(t=>t==='light'?'neon':'light')}>Theme</button></header>
  <div style={{height:420}}><MarketChart instrument={instrument} timeframe="5m" chartTheme={theme} externalCandles={window.fixtureCandles} indicators={{volume:true}} onFeedStatus={()=>{}} onPrice={()=>{}}/></div>
  <div className="chart-order-buttons" style={{display:'flex',gap:8,padding:12}}><button className="compact-sell">SELL</button><button className="compact-buy">BUY</button></div>
  <div style={{padding:12}}><IndiaPulse/></div>
  <section id="colour-contracts" style={{display:'flex',flexWrap:'wrap',gap:8,padding:12}}>
   <div className="chart-trade-buttons"><button className="buy">Buy stock</button><button className="sell">Sell stock</button></div>
   <div className="fno-focus-workspace" style={{position:'static',display:'block',padding:8}}><div className="fno-trade-actions"><button className="buy">Buy F&O</button><button className="sell">Sell F&O</button></div><b className="positive">Gain</b><b className="negative">Loss</b></div>
   <div className="order-ticket"><div className="side-switch"><button className="buy-active">Buy side</button><button className="sell-active">Sell side</button></div><button className="place-order buy">Place buy</button><button className="place-order sell">Place sell</button></div>
   <div className="bar-replay"><b className="up">Advance</b><b className="down">Decline</b></div>
   <div className="coach-modal"><b className="positive">Reward</b><b className="negative">Risk</b></div>
   <div className="option-sheet-backdrop"><div className="option-chain-sheet"><b className="up">Up</b><b className="down">Down</b></div></div>
   <div className="home-market-card-v2"><b className="up">Rising index</b><b className="down">Falling index</b></div>
   <div className="india-flows"><b className="up">FII net</b><b className="down">DII net</b><svg width="60" height="30" className="india-flow-chart"><rect className="fii up" width="10" height="20"/><rect className="fii down" x="20" width="10" height="20"/><rect className="dii down" x="40" width="10" height="20"/></svg></div>
   <b className="news-positive">Positive</b><b className="news-negative">Negative</b><b className="fa-badge review">Approved</b><b className="fa-badge rejected">Rejected</b>
   <button className="chart-buy-button">Quick buy</button><button className="chart-sell-button">Quick sell</button><button className="advanced-buy">Buy quote</button><button className="advanced-sell">Sell quote</button>
   <div className="pnl-calendar-day profit">Profit</div><div className="pnl-calendar-day loss">Loss</div><div className="heat-3">Strong gain</div><div className="heat--3">Strong loss</div>
  </section>
 </main>;
}
createRoot(document.getElementById('root')).render(<App/>);
