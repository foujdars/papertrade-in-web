import test from "node:test";
import assert from "node:assert/strict";
import { basketPayoff, selectBasketLeg } from "../lib/option-basket.ts";
import { calculateSpread, SPREADS } from "../lib/vertical-spread.ts";
import { fillIndianBasket, fillDeltaBasket } from "../lib/option-basket-orders.ts";
import { readGlobalAccount } from "../lib/global-order-engine.ts";

const series = "2030-12-27";
const contract = (strike, kind = "CE", multiplier = 1) => ({id: kind + strike, kind, strike, series, multiplier, bid: 2, ask: 3, last: 2.5});
const leg = (c, side, premium, lots = 1) => ({contract: c, side, premium, lots});

test("selecting a new call, put or side preserves other strikes and quantities", () => {
  const first = [{id:"CE100",side:"BUY",lots:"3",manual:"1.5"}];
  const second = selectBasketLeg(first,"PE100","SELL");
  const reversed = selectBasketLeg(second,"PE100","BUY");
  assert.deepEqual(reversed.map(l => [l.id,l.side,l.lots]), [["CE100","BUY","3"],["PE100","BUY","1"]]);
  assert.deepEqual(selectBasketLeg(reversed,"PE100","BUY"),first);
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
  const id=orders[1].contract.id, second=snapshots[id];
  for(const changed of [{...second,quote:{...second.quote,bid:98}},{...second,quote:{...second.quote,bidSize:0}},{...second,spec:{...second.spec,strike:123}}])
    assert.throws(()=>fillDeltaBasket(wallet,order,{...snapshots,[id]:changed},now));
  assert.equal(JSON.stringify(wallet),serialized);
});
