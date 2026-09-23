import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import { calculatePosition, paperOrderCapitalValue, validateDeliverySell } from '../lib/paper-trading.ts';
import { priceTaskError, priceTaskMatches, freshTaskQuote } from '../lib/price-actions.ts';
import { usableHomeQuote, quoteChangeText } from '../lib/home-quotes.ts';
const task = { instrument: { symbol: 'TEST', instrumentKey:'NSE_EQ|TEST', assetType:'EQUITY' }, kind:'order', price:100, quantity:2, status:'pending', side:'BUY', orderType:'Limit' };
test('limit and stop triggers use correct side and never fill beyond a limit', () => {
  assert.equal(priceTaskMatches(task,99),true); assert.equal(priceTaskMatches(task,101),false);
  assert.equal(priceTaskMatches({...task,side:'SELL'},101),true); assert.equal(priceTaskMatches({...task,side:'SELL'},99),false);
  assert.equal(priceTaskMatches({...task,orderType:'SL'},101),true); assert.equal(priceTaskMatches({...task,orderType:'SL'},99),false);
  assert.equal(priceTaskMatches({...task,orderType:'SL',side:'SELL'},99),true);
  assert.equal(priceTaskMatches({...task,status:'filled'},99),false);
});
test('queued market delivery waits for a positive fresh open-session quote', () => {
  assert.equal(priceTaskMatches({...task,orderType:'Market'},99),true);
  assert.equal(priceTaskMatches({...task,orderType:'Market'},101),true);
  assert.equal(priceTaskMatches({...task,orderType:'Market'},0),false);
  assert.equal(priceTaskMatches({...task,orderType:'Market',status:'cancelled'},99),false);
});
test('alert levels trigger independently of order side', () => {
  assert.equal(priceTaskMatches({...task,kind:'alert',condition:'above'},101),true);
  assert.equal(priceTaskMatches({...task,kind:'alert',condition:'below'},101),false);
});
test('order validates positive prices, whole quantities, derivative lots and tradable symbols', () => {
  assert.equal(priceTaskError(task),null);
  for(const quantity of [0,-1,1.5,NaN]) assert.ok(priceTaskError({...task,quantity}));
  assert.ok(priceTaskError({...task,price:0}));
  assert.ok(priceTaskError({...task,instrument:{...task.instrument,assetType:'INDEX'}}));
  assert.ok(priceTaskError({...task,instrument:{...task.instrument,lotSize:25}}));
  assert.equal(priceTaskError({...task,quantity:50,instrument:{...task.instrument,lotSize:25}}),null);
});
test('stale, future, missing and invalid quotes cannot trigger orders', () => {
  const now=Date.now(); const q={lastPrice:100,lastTradeAt:new Date(now).toISOString()};
  assert.equal(freshTaskQuote(q,now),true);
  assert.equal(freshTaskQuote(q,now+91000),false);
  assert.equal(freshTaskQuote(q,now-10000),false);
  assert.equal(freshTaskQuote({lastPrice:100},now),false);
  assert.equal(freshTaskQuote({...q,lastPrice:0},now),false);
});
test('missing home quotes never become fabricated zero-percent changes', () => {
  assert.equal(usableHomeQuote(undefined),null); assert.equal(usableHomeQuote({lastPrice:0}),null);
  assert.equal(quoteChangeText(null),'—'); assert.equal(quoteChangeText(0),'+0.00%');
  assert.equal(quoteChangeText(usableHomeQuote({lastPrice:110,previousClose:100}).changePercent),'+10.00%');
  assert.equal(usableHomeQuote({lastPrice:110}).changePercent,null);
});
test('the dashboard fill path rechecks funds and holdings, records actual price and is idempotent', async () => {
  const dashboard = await readFile(new URL('../components/TradingDashboard.tsx', import.meta.url), 'utf8');
  const source = dashboard.slice(dashboard.indexOf('  function fillPriceOrder('), dashboard.indexOf('  function validateQueuedPriceOrder('));
  const javascript = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  let orders=[], cash=1000;
  const bindings={ paperDataReady:true, priceTaskError, getNseMarketStatus:()=>({isOpen:true}), exchangeSession:null, intradayOrdersAllowed:true, readPaperOrders:()=>orders, localStorage:{getItem:()=>String(cash),setItem:(_key,value)=>{cash=Number(value)}}, balance:1000, calculatePosition, tradingLimitStatus:{blocked:false}, validateDeliverySell, calculateInstrumentCharges:()=>({total:1}),paperOrderCapitalValue,setOrders:value=>{orders=value},setBalance:value=>{cash=value},writePaperOrders:value=>{orders=value},saveProtection:()=>{} };
  bindings.isGlobalInstrumentKey = (await import('../lib/global-markets.ts')).isGlobalInstrumentKey;
  const fill = new Function(...Object.keys(bindings), javascript+';return fillPriceOrder;')(...Object.values(bindings));
  const buy={...task,id:'buy',product:'DELIVERY',quantity:3};
  assert.match(fill({...buy,instrument:{...buy.instrument,instrumentKey:'DELTA|BTCUSD'}},81000), /Global USD/);
  assert.equal(cash,1000); assert.equal(orders.length,0);
  assert.equal(fill(buy,99),null); assert.equal(orders[0].price,99); assert.equal(cash,702);
  assert.equal(fill(buy,99),null); assert.equal(orders.length,1); assert.equal(cash,702);
  assert.match(fill({...buy,id:'unfunded',quantity:10},99),/Insufficient/); assert.equal(orders.length,1);
  assert.match(fill({...buy,id:'oversell',side:'SELL',quantity:4},99),/only 3/); assert.equal(orders.length,1);
  assert.equal(fill({...buy,id:'sell',side:'SELL'},101),null); assert.equal(cash,1004); assert.equal(orders.length,2);
});
