import test from "node:test";
import assert from "node:assert/strict";
import { basketPayoff, legGreek, presetLegs, priceBasket, selectBasketLeg, targetPayoff } from "../lib/option-basket.ts";
import { optionBuilderContext } from "../lib/option-builder-context.ts";
import { calculateSpread, SPREADS } from "../lib/vertical-spread.ts";
import { fillIndianBasket, fillDeltaBasket } from "../lib/option-basket-orders.ts";
import { readGlobalAccount } from "../lib/global-order-engine.ts";

const series = "2030-12-27";
const contract = (strike, kind = "CE", multiplier = 1) => ({id: kind + strike, kind, strike, series, multiplier, bid: 2, ask: 3, last: 2.5});
const leg = (c, side, premium, lots = 1) => ({contract: c, side, premium, lots});
const future = { id:"NSE_FO|123", symbol:"NIFTY DEC FUT", kind:"FUT", series, futureExpiry:series, multiplier:25, exchangeLot:25, bid:99, ask:100, last:100 };

test("chart context preserves the exact listing across NSE, MCX, crypto and token options", () => {
  const nse = {exchange:"NSE", instrumentKey:"NSE_FO|1", underlyingKey:"NSE_INDEX|Nifty 50", optionType:"PE", strikePrice:100, expiry:series};
  assert.equal(optionBuilderContext(nse).initialRoot, nse.underlyingKey);
  const metal = optionBuilderContext({...nse, exchange:"MCX", instrumentKey:"MCX_FO|2", underlyingSymbol:"GOLDM", underlyingKey:"MCX_FO|3"});
  assert.deepEqual([metal.initialMarket,metal.initialRoot,metal.initialExpiry,metal.initialContract],["metals","GOLDM",series+"~MCX_FO|3","MCX_FO|2"]);
  for (const root of ["BTC","ETH","SOL","XAUT"]) {
    const symbol = "P-"+root+"-100-271230";
    const c = optionBuilderContext({symbol,instrumentKey:"DELTA|"+symbol,exchange:"DELTA",categories:["GLOBAL","OPTION"]});
    assert.deepEqual([c.initialMarket,c.initialContract,c.initialExpiry,c.initialKind,c.initialStrike],[root === "XAUT" ? "tokens" : "crypto",symbol,series,"PE",100]);
  }
});

test("a futures hedge offsets call tail risk without adding its notional to net premium", () => {
  const legs = [leg(future,"BUY",100),leg(contract(110,"CE",25),"SELL",3)];
  const payoff = basketPayoff(legs);
  assert.deepEqual([payoff.debit,payoff.maxProfit,payoff.maxLoss,payoff.breakEvens],[-75,325,2425,[97]]);
  assert.equal(payoff.payoff(1_000_000),325);
  assert.equal(basketPayoff([leg(future,"SELL",100)]).maxLoss,Infinity);
  assert.equal(legGreek(legs[0],"delta"),25);
  assert.equal(legGreek(legs[0],"vega"),0);
  assert.equal(legGreek(legs[1],"gamma"),null);
  assert.equal(legGreek(leg({...contract(110,"CE",25),greeks:{delta:.4}},"SELL",3,2),"delta"),-20);
});

test("one set of enabled, scaled lots drives the review and the payoff", () => {
  const contracts = new Map([[future.id,future]]);
  const rows = [{id:future.id,side:"BUY",lots:"2",manual:"86"},{id:"delisted",enabled:false,lots:"",side:"SELL",manual:""}];
  const priced = priceBasket(rows,contracts,"manual",3);
  assert.equal(priced.length,1);
  assert.equal(priced[0].lots,6);
  assert.equal(basketPayoff(priced).payoff(87),150);
  assert.throws(()=>priceBasket(rows,contracts,"market",0));
  assert.throws(()=>priceBasket([{...rows[0],lots:"0.5"}],contracts,"market",2));
  assert.throws(()=>basketPayoff(priceBasket(rows,contracts,"market",100000)));
});

test("volatility presets use listed equal-size legs surrounding the reference", () => {
  const contracts = [80,90,100,110,120].flatMap(k => [contract(k),contract(k,"PE")]);
  const ids = preset => presetLegs(contracts,preset,100,"market").map(l=>[l.id,l.side]);
  assert.deepEqual(ids("straddle"),[["CE100","BUY"],["PE100","BUY"]]);
  assert.deepEqual(ids("strangle"),[["PE90","BUY"],["CE110","BUY"]]);
  assert.deepEqual(ids("condor"),[["PE80","BUY"],["PE90","SELL"],["CE110","SELL"],["CE120","BUY"]]);
  assert.throws(()=>presetLegs(contracts.slice(0,3),"condor",100,"market"));
});

test("target values converge at expiry and require IV for each option before expiry", () => {
  const call = leg({...contract(100),iv:.2},"BUY",0);
  assert.ok(Math.abs(targetPayoff([call],100,1)-7.965567) < .00002);
  const put = leg({...contract(100,"PE"),iv:.2},"BUY",0);
  assert.ok(Math.abs(targetPayoff([call],105,.5)-targetPayoff([put],105,.5)-5) < 1e-8);
  const mixed = [leg(future,"SELL",102),call,put];
  for (const spot of [0,95,100,150]) assert.equal(targetPayoff(mixed,spot,0),basketPayoff(mixed).payoff(spot));
  assert.equal(targetPayoff([leg(contract(100),"BUY",2)],100,1),null);
});

test("INR hedge fills release the prior futures margin when closed", () => {
  const now = Date.parse("2030-12-01T06:00:00Z");
  const order = {market:"india",root:"NSE_INDEX|Nifty 50",rootLabel:"NIFTY",expiry:series,legs:[leg(future,"BUY",100)]};
  const books = {[future.id]:{bid:99,ask:100,bidSize:25,askSize:25,at:new Date(now).toISOString()}};
  const first = fillIndianBasket(order,books,2000,now,"one");
  assert.equal(first.fills[0].assetType,"FUTURE");
  assert.ok(first.fills[0].cashDelta < -500);
  const second = fillIndianBasket({...order,legs:[leg(future,"SELL",99)]},books,first.balance,now+1000,"two",first.fills);
  assert.ok(second.fills[0].cashDelta > 400);
  assert.ok(Math.abs(2000-second.balance-25-first.fills[0].charges.total-second.fills[0].charges.total) < 1e-8);
  assert.throws(()=>fillIndianBasket({...order,legs:[leg({...future,futureExpiry:"2029-01-01"},"BUY",100)]},books,2000,now,"three"));
});

test("selecting a new call, put or side preserves other strikes and quantities", () => {
  const first = [{id:"CE100",side:"BUY",lots:"3",manual:"1.5"}];
  const second = selectBasketLeg(first,"PE100","SELL");
  const reversed = selectBasketLeg(second,"PE100","BUY");
  assert.deepEqual(reversed.map(l => [l.id,l.side,l.lots]), [["CE100","BUY","3"],["PE100","BUY","1"]]);
  assert.deepEqual(selectBasketLeg(reversed,"PE100","BUY"),first);
  assert.deepEqual(selectBasketLeg([{...first[0],enabled:false}],"CE100","BUY"),[{...first[0],enabled:true}]);
});

for (const [id,p] of Object.entries(SPREADS)) test(id + " expiry P&L matches the vertical spread model", () => {
  const buy = contract(p.buyLower ? 100 : 110,p.kind,25), sell = contract(p.buyLower ? 110 : 100,p.kind,25);
  const [ask,bid] = p.flow === "Debit" ? [6,2] : [2,6];
  const expected = calculateSpread(id,buy,sell,ask,bid,3);
  const actual = basketPayoff([leg(buy,"BUY",ask,3), leg(sell,"SELL",bid,3)]);
  assert.equal(actual.maxProfit,expected.maxProfit); assert.equal(actual.maxLoss,expected.maxLoss);
  assert.deepEqual(actual.breakEvens,[expected.breakEven]);
  for (const price of [0,98,105,115,500]) assert.equal(actual.payoff(price),expected.payoff(price));
});

test("fractional crypto straddle has two break-evens and an unlimited call tail", () => {
  const result = basketPayoff([leg(contract(100,"CE",0.001),"BUY",4,2),leg(contract(100,"PE",0.001),"BUY",6,2)]);
  assert.equal(result.breakEvens.length,2); assert.ok(Math.abs(result.breakEvens[0]-90) < 1e-10 && Math.abs(result.breakEvens[1]-110) < 1e-10); assert.equal(result.maxProfit,Infinity);
  assert.equal(result.maxLoss,0.02); assert.equal(result.payoff(100),-0.02);
  const short = basketPayoff([leg(contract(100),"SELL",4)]);
  assert.deepEqual(short.breakEvens,[104]); assert.equal(short.maxLoss,Infinity);
});

test("butterfly keeps its two break-evens and flat tails with unequal lots", () => {
  const result = basketPayoff([leg(contract(90),"BUY",13),leg(contract(100),"SELL",7,2),leg(contract(110),"BUY",3)]);
  assert.equal(result.maxProfit,8); assert.equal(result.maxLoss,2); assert.deepEqual(result.breakEvens,[92,108]);
});
test("invalid or missing multiplier, premium, quantity, series and duplicate IDs are rejected", () => {
  const a=leg(contract(100),"BUY",2), pair=b=>[a,b];
  for(const b of [a,leg({...contract(110),series:"other"},"SELL",2),leg(contract(110,"CE",null),"SELL",4),leg(contract(110),"SELL",NaN),leg(contract(110),"SELL",1,1.5)])
    assert.throws(()=>basketPayoff(pair(b)));
});

test("INR fills use the reviewed book, lot units, liquidity, provider time and total account cash", () => {
  const now = Date.parse("2030-12-01T06:00:00Z");
  const make = (n,side,premium) => leg({...contract(100+n),id:"NSE_FO|"+n,symbol:"OPT"+n,multiplier:25,exchangeLot:25},side,premium,2);
  const order = {market:"india",root:"NSE_INDEX|Nifty 50",rootLabel:"NIFTY",expiry:series,legs:[make(1,"BUY",3),make(2,"SELL",2)]};
  const q={bid:2,ask:3,bidSize:50,askSize:50,at:new Date(now).toISOString()};
  const books = {"NSE_FO|1":q,"NSE_FO|2":q};
  const filled=fillIndianBasket(order,books,1000,now,"basket");
  assert.deepEqual(filled.fills.map(x=>[x.id,x.quantity,x.price]),[["basket-0",50,3],["basket-1",50,2]]);
  for(const bad of [{...q,bid:1},{...q,bidSize:49},{...q,bid:4},{...q,at:new Date(now-31000).toISOString()}])
    assert.throws(()=>fillIndianBasket(order,{...books,"NSE_FO|2":bad},1000,now,"basket"));
  assert.throws(()=>fillIndianBasket(order,books,0,now,"basket"));
  assert.deepEqual(books["NSE_FO|2"],q);
});

test("Delta commits all legs together and leaves the input wallet untouched when the second leg fails", () => {
  const now = 1800000000000, expiry=new Date(now+86400000).toISOString();
  const mk=(strike,side,premium)=>leg({...contract(strike,"CE",.001),id:"C-BTC-"+strike+"-170127",series:expiry},side,premium);
  const orders=[mk(84000,"BUY",101),mk(85000,"SELL",99)];
  const order={market:"crypto",root:"BTC",rootLabel:"BTC",expiry,legs:orders};
  const snapshots=Object.fromEntries(orders.map(({contract:c})=>[c.id,{
    spec:{symbol:c.id,underlying:"BTC",expiry:Date.parse(expiry),strike:c.strike,lot:.001,contractType:"call_options",tick:.1,maker:.0001,taker:.0001,premiumFeeCap:.035,operational:true,fetchedAt:now},
    quote:{symbol:c.id,bid:99,ask:101,index:85000,last:100,mark:100,bidSize:3,askSize:3,funding:0,change:0,at:now,operational:true},
  }]));
  const wallet=readGlobalAccount(null), serialized=JSON.stringify(wallet);
  const result=fillDeltaBasket(wallet,order,snapshots,now);
  assert.equal(result.optionPositions.length,2);
  const perp = {...future, id:"BTCUSD",symbol:"BTCUSD",futureExpiry:null,series:expiry,multiplier:.001};
  const perpSnapshot = {
    spec:{symbol:"BTCUSD",lot:.001,tick:.5,initial:.005,maintenance:.0025,initialScale:0,maintenanceScale:0,scalingThreshold:100000,maxNotional:5000000,maker:.0002,taker:.0005,liquidation:.0005,fundingSeconds:28800,operational:true,fetchedAt:now},
    quote:{...snapshots[orders[0].contract.id].quote,symbol:"BTCUSD",bid:84999,ask:85000,last:85000,mark:85000},
  };
  const hedged = {...order,legs:[leg(perp,"BUY",85000),...orders]};
  const hedgedResult = fillDeltaBasket(wallet,hedged,{...snapshots,BTCUSD:perpSnapshot},now);
  assert.equal(hedgedResult.positions[0].entry,85000);
  assert.equal(hedgedResult.optionPositions.length,2);
  assert.throws(()=>fillDeltaBasket(wallet,hedged,{...snapshots,BTCUSD:{...perpSnapshot,quote:{...perpSnapshot.quote,askSize:0}}},now));
  const id=orders[1].contract.id, second=snapshots[id];
  for(const changed of [{...second,quote:{...second.quote,bid:98}},{...second,quote:{...second.quote,bidSize:0}},{...second,spec:{...second.spec,strike:123}}])
    assert.throws(()=>fillDeltaBasket(wallet,order,{...snapshots,[id]:changed},now));
  assert.equal(JSON.stringify(wallet),serialized);
});
