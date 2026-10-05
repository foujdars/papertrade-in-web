import React, {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {HomeWorkspace} from '../../components/HomeWorkspace';
function App(){
 const [theme,setTheme]=useState('light');
 const [indices,setIndices]=useState([
  {symbol:'NIFTY',label:'NIFTY 50',price:24781.65,points:182.45,changePercent:.74,live:true},
  {symbol:'BANKNIFTY',label:'BANK NIFTY',price:56247.2,points:-218.3,changePercent:-.39,live:true},
  {symbol:'SENSEX',label:'SENSEX',price:81245.88,points:485.28,changePercent:.60,live:true},
 ]);window.qaIndices=setIndices;
 const open=symbol=>{window.qaOpened=symbol;};const noop=()=>{};
 return <main className="terminal-shell" data-theme={theme} style={{height:'100dvh',display:'flex',flexDirection:'column'}}><header className="topbar" style={{flex:'0 0 56px'}}><span className="brand">PaperTrade <b>IN</b></span><button onClick={()=>setTheme(t=>t==='light'?'neon':'light')}>Theme</button></header><HomeWorkspace indices={indices} feedLive={true} balance={1000000} globalWallet={100000} globalWalletError="" globalAvailable={100000} globalPositions={[]} globalOpenOrders={0} globalOpenPnl={0} globalPnlComplete={true} onAddCash={noop} todayPnl={0} holdingsCount={0} openPositionsCount={0} closedTradesCount={0} stockOptions={[]} cards={{market:true,portfolio:true,recent:true}} riskSummary={{exposure:0,topSymbol:'',topConcentration:0,label:'Low'}} onOpenBot={()=>{window.qaBot=true;}} onOpenNews={()=>{window.qaNews=true;}} onOpenWatchlist={()=>{window.qaWatchlists=true;}} onOpenHoldings={noop} onOpenPositions={noop} onOpenTradeHistory={noop} onOpenPnl={noop} onOpenStock={open}/></main>;
}createRoot(document.getElementById('root')).render(<App/>);
