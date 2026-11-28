import test from "node:test";
import assert from "node:assert/strict";
import { gzipSync } from "node:zlib";
import { build } from "esbuild";
import { isListedFuture, futuresRootKey, compareFutures } from "../lib/listed-futures.ts";
import { futureToInstrument } from "../lib/fno.ts";
import { futuresExchange, indianInstrumentStatus } from "../lib/mcx.ts";
import { normalizeDeltaCatalogue, normalizeDeltaFutureSpec, normalizePerpQuote, deltaSymbolFromInstrumentKey, availablePerpCash } from "../lib/global-markets.ts";
import { readGlobalAccount, advanceGlobalAccount, submitGlobalOrder } from "../lib/global-order-engine.ts";
import { fillDeltaBasket } from "../lib/option-basket-orders.ts";
import { calculateUpstoxTradingCharges } from "../lib/trading-charges.ts";
import { futureFillCashDelta } from "../lib/paper-trading.ts";
import { globalClosedTrades } from "../lib/global-pnl.ts";

const today = "2098-11-28", now = Date.parse(today + "T05:30:00Z");
const expiry = Date.parse("2098-12-26T12:00:00Z");
const symbol = "BTCUSD_261298";
const product = { symbol, contract_type:"futures", notional_type:"vanilla", is_quanto:false, contract_unit_currency:"BTC",
  quoting_asset:{symbol:"USD"}, settling_asset:{symbol:"USD"}, state:"live", trading_status:"operational", settlement_time:new Date(expiry).toISOString(),
  contract_value:"0.001", tick_size:"0.5", initial_margin:"4", maintenance_margin:"2", initial_margin_scaling_factor:"0", maintenance_margin_scaling_factor:"0",
  max_leverage_notional:"100000", position_notional_limit:"1000000", maker_commission_rate:"0.0002", taker_commission_rate:"0.0005",
  product_specs:{isolated_liq_penalty_factor:"0.005"} };
const spec = normalizeDeltaFutureSpec(product, symbol, now);
const quote = normalizePerpQuote({symbol, close:"60000", mark_price:"60000", quotes:{best_bid:"59999",best_ask:"60000",bid_size:20,ask_size:20},
  product_trading_status:"operational", timestamp:now*1000, ltp_change_24h:0}, symbol);
const entry = {type:"Market",side:"BUY",leverage:5,contracts:2};

test("NSE and BSE masters load independently, retain every verified expiry and never substitute a spot or a guessed lot", async t => {
  const {outputFiles} = await build({entryPoints:["app/api/upstox/fno-underlyings/route.ts"],bundle:true,write:false,platform:"node",format:"esm"});
  const {GET} = await import("data:text/javascript;base64," + Buffer.from(outputFiles[0].text).toString("base64"));
  let bseAvailable = false;
  const calls = {NSE:0,BSE:0};
  const futures = (exchange,root,key,type) => ["2098-12-26","2099-01-27"].map((date,i)=>({
    segment:exchange+"_FO", instrument_type:"FUT", underlying_key:key, underlying_symbol:root, underlying_type:type,
    instrument_key:exchange+"_FO|"+(100+i+(type==="INDEX"?20:0)), trading_symbol:root+" "+date+" FUT", expiry:date, lot_size:i?20:25}));
  t.mock.method(globalThis,"fetch",async url => {
    const exchange = String(url).includes("BSE.json") ? "BSE" : "NSE";
    calls[exchange]++;
    if (exchange === "BSE" && !bseAvailable) return new Response(null,{status:503});
    const rows = exchange === "NSE" ? [...futures("NSE","RELIANCE","NSE_EQ|INE002A01018","EQUITY"), ...futures("NSE","NIFTY","NSE_INDEX|Nifty 50","INDEX")] :
      futures("BSE","SENSEX","BSE_INDEX|SENSEX","INDEX");
    rows.push({...rows[0],expiry:"2020-01-01"}, {...rows[0],lot_size:0}, {...rows[0],lot_size:undefined}, {...rows[0],instrument_key:"NSE_EQ|INE002A01018"});
    return new Response(gzipSync(JSON.stringify(rows)));
  });
  const partial = await (await GET()).json();
  assert.deepEqual(partial.unavailableExchanges,["BSE"]);
  assert.equal(partial.underlyings.length,2);
  bseAvailable = true;
  const full = await (await GET()).json();
  assert.deepEqual(full.unavailableExchanges,[]);
  assert.deepEqual(calls,{NSE:1,BSE:2});
  for (const root of full.underlyings) {
    assert.equal(root.futureContracts,2);
    const listed = root.futures.map(contract=>futureToInstrument(contract,root)).sort(compareFutures);
    assert.deepEqual(listed.map(item=>item.lotSize),[25,20]);
    assert.ok(listed.every(item=>item.exchange===futuresExchange(item) && futuresRootKey(item)===root.instrumentKey && isListedFuture(item,today,now)));
    assert.equal(isListedFuture({...listed[0],expiry:"2020-01-01"},today,now),false);
    assert.equal(isListedFuture({...listed[0],instrumentKey:root.instrumentKey},today,now),false);
  }
});

test("BSE futures respect their own session, charge schedule, isolated paper margin and opening side", () => {
  const instrument = {instrumentKey:"BSE_FO|123",categories:[]};
  const open = {date:today,checkedAt:now,status:"NORMAL_OPEN",sessions:[{start:now-1000,end:now+3600000}]};
  const closed = {...open,status:"NORMAL_CLOSE"};
  assert.equal(indianInstrumentStatus(instrument,new Date(now),open,open,closed).isOpen,false);
  assert.equal(indianInstrumentStatus(instrument,new Date(now),closed,closed,open).isOpen,true);
  const trade = { ...instrument,id:"1",assetType:"FUTURE",product:"DELIVERY",symbol:"SENSEX DEC FUT",side:"SELL",quantity:20,price:80000,status:"COMPLETE",createdAt:now};
  const charges = calculateUpstoxTradingCharges("FUTURE",trade,trade.instrumentKey);
  assert.equal(charges.transactionCharges,0);
  assert.equal(charges.ipftCharges,0);
  assert.ok(charges.stt>0);
  const cash = futureFillCashDelta([], {...trade,charges});
  assert.equal(cash.marginAfter,320000);
  assert.equal(cash.cashDelta,-320000-charges.total);
  const cover = {...trade,id:"2",createdAt:now+1000,side:"BUY",price:79900};
  const closedCash = futureFillCashDelta([{...trade,charges}],cover);
  assert.equal(closedCash.realisedPnl,2000);
  assert.equal(closedCash.marginAfter,0);
});

test("Delta dated contracts trade under their own symbol, lot and maturity and settle once at the published price", () => {
  const [listed] = normalizeDeltaCatalogue([product,{...product,symbol:"BTCUSD",settlement_time:null},{...product,symbol:"BADUSD_261298"},{...product,contract_value:0}]);
  assert.equal(listed.symbol,symbol);
  assert.equal(listed.contractMultiplier,.001);
  assert.equal(deltaSymbolFromInstrumentKey(listed.instrumentKey),symbol);
  assert.equal(isListedFuture(listed,today,now),true);
  assert.equal(isListedFuture(listed,today,expiry),false);
  assert.equal(isListedFuture({...listed,contractMultiplier:Infinity},today,now),false);
  assert.equal(isListedFuture({...listed,assetType:"OPTION"},today,now),false);
  const account = readGlobalAccount(null);
  const order = {market:"crypto",root:"BTC",expiry:new Date(expiry-86400000).toISOString(),legs:[]};
  const leg = {contract:{id:symbol,kind:"FUT",series:order.expiry,futureExpiry:new Date(expiry).toISOString(),multiplier:.001},lots:2,side:"BUY",premium:quote.ask};
  const snapshots = {[symbol]:{spec,quote}};
  const hedge = fillDeltaBasket(account,{...order,legs:[leg]},snapshots,now);
  assert.equal(hedge.positions[0].spec.expiry,expiry);
  assert.throws(()=>fillDeltaBasket(account,{...order,root:"ETH",legs:[leg]},snapshots,now),/underlying/);
  assert.throws(()=>fillDeltaBasket(account,{...order,legs:[{...leg,contract:{...leg.contract,futureExpiry:null}}]},snapshots,now),/underlying/);
  let a = submitGlobalOrder(account,spec,quote,entry,now);
  a = submitGlobalOrder(a,spec,quote,{...entry,type:"Limit",limit:59000},now);
  a = readGlobalAccount(JSON.stringify(a));
  assert.equal(a.positions[0].nextFunding,0);
  assert.equal(a.orders[0].expiry,expiry);
  const locked = availablePerpCash(a);
  a = advanceGlobalAccount(a,{}, {},expiry);
  assert.equal(a.orders.length,0);
  assert.ok(availablePerpCash(a)>locked);
  assert.equal(a.positions.length,1);
  assert.equal(a.fundingGap,false);
  assert.throws(()=>submitGlobalOrder(a,spec,{...quote,at:expiry},entry,expiry),/expired/);
  const wrong = advanceGlobalAccount(a,{}, {},expiry+1,{}, {[symbol]:{expiry:expiry+1,price:65000}});
  assert.equal(wrong.positions.length,1);
  const settlement = {[symbol]:{expiry,price:65000}};
  const done = advanceGlobalAccount(a,{}, {},expiry+2,{},settlement);
  assert.equal(done.positions.length,0);
  const fill = done.events.at(-1);
  assert.equal(fill.kind,"SETTLEMENT");
  assert.equal(fill.price,65000);
  assert.ok(Math.abs(fill.pnl-10)<1e-8);
  assert.ok(Math.abs(fill.fee-65000*.002*spec.taker*1.18)<1e-8);
  assert.equal(globalClosedTrades(done).length,1);
  assert.equal(readGlobalAccount(JSON.stringify(done)).wallet,done.wallet);
  assert.equal(advanceGlobalAccount(done,{}, {},expiry+3,{},settlement).wallet,done.wallet);
});

test("a Delta futures contract that enters reduce-only mode still allows a position to close", () => {
  const restricted = normalizeDeltaFutureSpec({...product,product_specs:{...product.product_specs,only_reduce_only_orders_allowed:true}},symbol,now);
  assert.equal(restricted.reduceOnly,true);
  const a = submitGlobalOrder(readGlobalAccount(null),spec,quote,entry,now);
  assert.throws(()=>submitGlobalOrder(a,restricted,quote,entry,now),/reductions/);
  const reduced = submitGlobalOrder(a,restricted,quote,{...entry,side:"SELL",reduceOnly:true},now);
  assert.equal(reduced.positions.length,0);
});

test("an Indian option chain offers every covering expiry with each future's own book and contract lot", async t => {
  const {outputFiles} = await build({entryPoints:["lib/spread-chain-client.ts"],bundle:true,write:false,platform:"node",format:"esm"});
  const {loadSpreadChain} = await import("data:text/javascript;base64," + Buffer.from(outputFiles[0].text).toString("base64"));
  const underlying = {symbol:"NIFTY",instrumentKey:"NSE_INDEX|Nifty 50",futures:[
    {expiry:"2098-12-19",instrumentKey:"NSE_FO|1",tradingSymbol:"NIFTY EARLIER",lotSizeVerified:true,lotSize:25},
    {expiry:"2098-12-26",instrumentKey:"NSE_FO|2",tradingSymbol:"NIFTY DEC FUT",lotSizeVerified:true,lotSize:25},
    {expiry:"2099-01-27",instrumentKey:"NSE_FO|3",tradingSymbol:"NIFTY JAN FUT",lotSizeVerified:true,lotSize:20},
    {expiry:"2099-02-24",instrumentKey:"NSE_FO|4",tradingSymbol:"NIFTY UNVERIFIED",lotSizeVerified:false,lotSize:1},
  ]};
  t.mock.method(globalThis,"fetch",async path => {
    const url = new URL(path,"http://localhost");
    if (url.pathname.endsWith("/option-chain")) return Response.json({ok:true,rows:[]});
    assert.equal(url.searchParams.get("depth"),"1");
    assert.deepEqual(url.searchParams.get("keys").split(","),["NSE_FO|2","NSE_FO|3"]);
    return Response.json({ok:true,books:{"NSE_FO|2":{bid:99,ask:100,bidSize:50,askSize:50},"NSE_FO|3":{bid:105,ask:107,bidSize:40,askSize:40}}});
  });
  const chain = await loadSpreadChain("india",underlying.instrumentKey,underlying,"2098-12-26",new AbortController().signal);
  assert.equal(chain.future.id,"NSE_FO|2");
  assert.deepEqual(chain.futures.map(f=>[f.id,f.bid,f.ask,f.exchangeLot]),[["NSE_FO|2",99,100,25],["NSE_FO|3",105,107,20]]);
});
