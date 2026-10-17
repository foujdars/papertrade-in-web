import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateCompanyJson } from '../lib/fundamental-analysis.ts';
import { evaluateScreenerCsv } from '../lib/fundamental-screener.ts';
import { bharatCandidates, bharatStrategyRule } from '../lib/bharat-strategies.ts';
import { buildBharatPicks } from '../lib/bharat-outperformers.ts';
import { analyseDiscovery } from '../lib/stock-discovery.ts';
const now=Date.parse('2026-10-17T04:00:00Z');
const record={Name:'Example','NSE Code':'TEST','BSE Code':'500001','ISIN Code':'INE002A01018',Industry:'Engineering','Pledged percentage':0,'Return on equity':22,'Average return on equity 3Years':23,'Average return on equity 5Years':21,'Return on capital employed':25,'Average return on capital employed 3Years':24,'Average return on capital employed 5Years':22,'Debt to equity':.2,'Net Profit':500,'Price to Earning':18,'Industry PE':20,'Profit growth 3Years':20,'Profit growth 5Years':18,'Sales growth 3Years':16,'Sales growth 5Years':15,OPM:18,'PEG Ratio':1,'Current ratio':2,'Quick ratio':1.5,'YOY Quarterly profit growth':20,'YOY Quarterly sales growth':18,Sales:1000,'Sales last year':900,'Net Profit last year':400,'Market Capitalization':1500};
const company=(overrides={})=>evaluateCompanyJson(JSON.stringify({...record,...overrides})).result;
const dates=[];let t=Date.parse('2026-10-16T03:45:00Z');while(dates.length<280){if(![0,6].includes(new Date(t).getUTCDay()))dates.unshift(t/1000);t-=86400000;}
const candles=dates.map((time,i)=>({time,open:100+i*.2,high:102+i*.2,low:99+i*.2,close:101+i*.2,volume:1000000}));
test('market capitalization is optional and imported in INR crore without changing gates',()=>{
 const a=company(),b=company({'Market Capitalization':null});assert.equal(a.metrics.marketCapCr,1500);assert.equal(b.metrics.marketCapCr,null);assert.equal(a.gateStatus,b.gateStatus);
 for(const header of ['Market Capitalization','Market Capitalization (Rs. Cr.)','Mar Cap Rs.Cr.'])assert.equal(evaluateScreenerCsv(`Name,${header}\nExample,1234`).results[0].metrics.marketCapCr,1234);
 assert.equal(evaluateScreenerCsv('Name,Market Cap USD\nExample,1234').results[0].metrics.marketCapCr,null);
});
test('Bargains requires valid relative valuation, PEG and quality',()=>{
 assert.equal(bharatStrategyRule(company(),'bargains'),null);
 for(const patch of [{'Price to Earning':0},{'Price to Earning':25},{'Industry PE':null},{'PEG Ratio':2},{'Return on equity':10}])assert.ok(bharatStrategyRule(company(patch),'bargains'));
 assert.equal(bharatStrategyRule(company({'Price to Earning':25}),'outperformers'),null);
});
test('Small Cap Gems rejects missing/out-of-band caps and weak growth before pool truncation',()=>{
 assert.equal(bharatStrategyRule(company(),'smallcap'),null);
 for(const cap of [null,0,499,5001])assert.match(bharatStrategyRule(company({'Market Capitalization':cap}),'smallcap'),/Capitalization/);
 for(const cap of [500,5000])assert.equal(bharatStrategyRule(company({'Market Capitalization':cap}),'smallcap'),null);
 assert.match(bharatStrategyRule(company({'Sales growth 3Years':9}),'smallcap'),/growth/);
 const pool=bharatCandidates([company(),company({Name:'Large','Market Capitalization':100000,'ISIN Code':'INE001A01018'})],[],'smallcap');assert.equal(pool.selected.length,1);assert.equal(pool.excluded.length,1);
});
test('strategy scores and basket caps are distinct and reproducible',()=>{
 const rows=Array.from({length:25},(_,i)=>company({Name:'Company '+i,'ISIN Code':`INE${String(i).padStart(3,'0')}A01018`,'NSE Code':'TEST'+i,Industry:'Sector '+i}));
 const stocks=bharatCandidates(rows,[],'bargains').selected.map(c=>analyseDiscovery(c,candles,now));
 const value=buildBharatPicks(stocks,candles,{now,strategy:'bargains'}),growth=buildBharatPicks(stocks,candles,{now,strategy:'smallcap'});
 assert.equal(value.picks.length,15);assert.equal(growth.picks.length,20);const v=value.picks[0],g=growth.picks[0];
 assert.equal(v.score,v.fundamentals.valuation*.45+v.fundamentals.quality*.35+v.fundamentals.balance*.1+v.riskScore*.1);
 assert.equal(g.score,g.fundamentals.growth*.4+g.fundamentals.quality*.25+g.momentumScore*.2+g.riskScore*.15);
 assert.match(v.reasons[0],/P\/E.*industry/);assert.match(g.reasons[0],/Market cap/);assert.equal(value.comparison.available,true);
});
