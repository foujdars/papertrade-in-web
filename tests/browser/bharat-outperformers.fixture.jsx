import React from 'react';
import {createRoot} from 'react-dom/client';
import {FundamentalWorkspace} from '../../components/FundamentalWorkspace';
import {evaluateCompanyJson} from '../../lib/fundamental-analysis';
const record={Name:'Test Industries','NSE Code':'TEST','BSE Code':'500001','ISIN Code':'INE002A01018',Industry:'Engineering','Pledged percentage':0,'Return on equity':22,'Average return on equity 3Years':23,'Average return on equity 5Years':21,'Return on capital employed':25,'Average return on capital employed 3Years':24,'Average return on capital employed 5Years':22,'Debt to equity':.2,'Net Profit':500,'Price to Earning':18,'Industry PE':20,'Profit growth 3Years':20,'Profit growth 5Years':18,'Sales growth 3Years':16,'Sales growth 5Years':15,OPM:18,'PEG Ratio':1,'Current ratio':2,'Quick ratio':1.5,'YOY Quarterly profit growth':20,'YOY Quarterly sales growth':18,Sales:1000,'Sales last year':900,'Net Profit last year':400};
const results=Array.from({length:28},(_,i)=>evaluateCompanyJson(JSON.stringify({...record,Name:`Research Company ${String(i+1).padStart(2,'0')}`,'NSE Code':`TEST${i+1}`,'ISIN Code':`INE${String(i).padStart(3,'0')}A01018`,Industry:`Sector ${i%7+1}`,'Market Capitalization':i<22?1000+i*100:10000})).result);
window.qaRun={fileName:'deterministic-browser-fixture.csv',importedAt:'2026-10-17T04:00:00Z',dataAsOf:'2026-09-30',sourceVersion:'qa-v1',results,missingColumns:[]};
const instruments=results.map(r=>({instrumentKey:`NSE_EQ|${r.isin}`,symbol:r.nseCode,name:r.name,exchange:'NSE',price:110,change:0,categories:[]}));
window.qaKeys=instruments.map(i=>i.instrumentKey);
function App(){return <main className="terminal-shell" data-theme="light"><button aria-label="Toggle test theme" onClick={e=>{const host=e.currentTarget.closest('main');host.dataset.theme=host.dataset.theme==='light'?'neon':'light';}}>Theme</button><FundamentalWorkspace ownerId="qa" instruments={instruments} balance={100000} onSimulate={()=>{throw Error('No order expected');}} onClose={()=>{}} onOpenChart={instrument=>{window.qaOpenedChart=instrument.symbol;}}/></main>;}
createRoot(document.getElementById('root')).render(<App/>);
