import React, { useState, useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import { PnlAnalytics } from '../../components/PnlAnalytics';
import { DEFAULT_PNL_SCOPE, filterPnlTrades } from '../../lib/pnl-analytics';
const now=Date.parse('2026-09-18T12:00:00+05:30');
const values=[1100,-700,600,-1700,800,1600,-1000,900,-1500,400,-1100,1300,100,-1600,1200,-500,300,0,50,-75];
const trades=values.map((netPnl,i)=>({id:`t${i}`,symbol:i%2?'TATACHEM':'RELIANCE',product:i%3?'INTRADAY':'DELIVERY',direction:i%2?'SHORT':'LONG',quantity:10,entryPrice:100,exitPrice:100+netPnl/10,grossPnl:netPnl+40,charges:40,netPnl,openedAt:Date.parse('2026-08-29T09:30:00+05:30')+i*86400000,closedAt:Date.parse('2026-08-29T11:00:00+05:30')+i*86400000,sourceOrderIds:[`entry${i}`,`exit${i}`]}));
const orders=trades.map((t,i)=>({id:`entry${i}`,assetType:i%4?'EQUITY':'OPTION',journalPlan:{strategy:i%2?'SMC':'Breakout'}}));
function App(){
 const [scope,setScope]=useState(DEFAULT_PNL_SCOPE),[tab,setTab]=useState('overview'),[theme,setTheme]=useState('light'),[drill,setDrill]=useState(null),[empty,setEmpty]=useState(false);
 const source=empty?[]:trades;
 const filtered=useMemo(()=>filterPnlTrades(source,orders,scope,now),[source,scope]);
 const calendar=useMemo(()=>filterPnlTrades(source,orders,{...scope,day:null},now),[source,scope]);
 window.qaTheme=setTheme;window.qaEmpty=setEmpty;window.qaTrades=trades;window.qaScope=scope;
 return <main className="terminal-shell" data-theme={theme}><section className="pnl-modal">
 <PnlAnalytics trades={filtered} calendarTrades={calendar} orders={orders} scope={scope} onScope={s=>{setScope(s);setDrill(null)}} tab={tab} onTab={setTab} onSelect={(ids,label)=>{setDrill({ids,label});setTab('trades')}} now={now}/>
 {tab==='trades'&&<div data-testid="drill">{drill?.label}<output>{JSON.stringify(drill?.ids??filtered.map(t=>t.id))}</output></div>}
 </section></main>
}
createRoot(document.getElementById('root')).render(<App/>);
