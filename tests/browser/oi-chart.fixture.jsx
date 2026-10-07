import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { OpenInterestChart } from '../../components/OpenInterestChart';
import { oiSummary } from '../../lib/home-derivatives';
import { oiLevels, nearbyOiStrikes } from '../../lib/oi-chart';
function App() {
  const [symbol,setSymbol]=useState('NIFTY'),[change,setChange]=useState(false),[negative,setNegative]=useState(false);
  const spot={NIFTY:22603.05,BANKNIFTY:55055.55,MIDCPNIFTY:13757.2}[symbol], gap=symbol==='BANKNIFTY'?100:50;
  const rows=Array.from({length:31},(_,i)=>{
    const strike=Math.round(spot/gap)*gap+(i-15)*gap,oi=i===15?9e6:1e5+Math.abs(Math.sin(i))*2e6;
    const side=(v,put)=>({marketData:{oi:v,prevOi:v*(negative||put||i%2?1.4:.7)}});
    return {strikePrice:strike,call:side(oi,false),put:side(oi*.9,true)};
  });
  const summary=oiSummary(rows);
  return <main className="terminal-shell" data-theme="light"><header>{['NIFTY','BANKNIFTY','MIDCPNIFTY'].map(s=><button key={s} onClick={()=>setSymbol(s)}>{s}</button>)}<button onClick={()=>setChange(v=>!v)}>Change</button><button onClick={()=>setNegative(v=>!v)}>Negative only</button></header><section className="home-section home-option-pulse"><OpenInterestChart rows={nearbyOiStrikes(summary.strikes,spot)} change={change} spot={spot} symbol={symbol} levels={oiLevels(summary.strikes,spot)}/></section></main>;
}
createRoot(document.getElementById('root')).render(<App/>);
