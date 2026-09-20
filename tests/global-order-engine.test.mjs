import test from "node:test";
import assert from "node:assert/strict";
import { readGlobalAccount, sizeToContracts, affordableContracts, submitGlobalOrder, advanceGlobalAccount, setGlobalProtection } from "../lib/global-order-engine.ts";
import { openPerp, newPerpAccount, closePerp, positionPnl, availablePerpCash, cancelPerpOrder } from "../lib/global-markets.ts";
const now = 1800000000000;
const spec = { symbol: "BTCUSD", lot: .001, tick: .5, initial: .005, maintenance: .0025, initialScale: .000000025, maintenanceScale: .0000000125, scalingThreshold: 100000, maxNotional: 5000000, maker: .0002, taker: .0005, liquidation: .0005, fundingSeconds: 28800, operational: true, fetchedAt: now };
const quote = { symbol: "BTCUSD", last: 100000, mark: 100000, index: 100010, bid: 99999.5, ask: 100000, bidSize: 100000, askSize: 100000, funding: .0001, change: 1, at: now, operational: true };
const draft = { type: "Market", side: "BUY", contracts: 10, leverage: 10 };
const fresh = (price, elapsed = 1000, overrides = {}) => ({ ...quote, at: now + elapsed, bid: price - .5, ask: price, last: price, mark: price, index: price, ...overrides });
const submit = (d = {}, a = readGlobalAccount(null)) => submitGlobalOrder(a, spec, quote, { ...draft, ...d }, now);
const advance = (a, q) => advanceGlobalAccount(a, { BTCUSD: q }, { BTCUSD: spec }, q.at);

test("new global accounts, margin, fees and P&L are all USD", () => {
  const a = submit();
  assert.equal(a.currency, "USD"); assert.equal(a.positions[0].currency, "USD");
  assert.equal(a.positions[0].margin, 100);
  assert.equal(a.wallet, 10000 - .59);
  assert.equal(positionPnl(a.positions[0], 101000), 10);
  const b = closePerp(a, "BTCUSD", fresh(101000), 5, now + 1000);
  assert.equal(b.positions[0].margin, 50);
  assert.ok(b.wallet > a.wallet);
});
test("legacy wallet conversion preserves equity and is idempotent", () => {
  const old = openPerp(newPerpAccount(), spec, quote, "BUY", 10, 10, now);
  const usd = readGlobalAccount(JSON.stringify(old));
  assert.equal(usd.wallet, old.wallet / 85);
  assert.equal(usd.positions[0].margin, old.positions[0].margin / 85);
  assert.equal(usd.events[0].fee, old.events[0].fee / 85);
  assert.deepEqual(readGlobalAccount(JSON.stringify(usd)), usd);
});
test("fractional BTC and gold are exact lot multiples; dollar notional rounds down", () => {
  assert.equal(sizeToContracts(.007, "asset", spec, 100000), 7);
  assert.equal(sizeToContracts(350, "USD", spec, 100000), 3);
  assert.equal(sizeToContracts(99, "USD", spec, 100000), 0);
  assert.throws(() => sizeToContracts(.0005, "asset", spec, 100000), /increments/);
  assert.throws(() => sizeToContracts(1.1, "lots", spec, 100000), /whole/);
  assert.equal(sizeToContracts(.03, "asset", { ...spec, lot: .01, symbol: "XAUTUSD" }, 3500), 3);
});
test("legacy pending entries keep their dollar-priced TP/SL after migration", () => {
  const old = openPerp(newPerpAccount(), spec, quote, "BUY", 2, 10, now, 97000, 101000, 99000);
  const a = readGlobalAccount(JSON.stringify(old));
  const filled = advance(a, fresh(99000));
  assert.equal(filled.positions[0].protection.stopLoss.trigger, 97000);
  assert.equal(filled.positions[0].protection.takeProfit.trigger, 101000);
});
test("allocation presets include fees and respect margin scaling", () => {
  const a = readGlobalAccount(null);
  const qty = affordableContracts(a, spec, quote.ask, 100, 1);
  const b = submit({ contracts: qty, leverage: 100 }, a);
  assert.ok(availablePerpCash(b) >= 0);
  assert.ok(qty > 0);
  assert.throws(() => submit({ contracts: 1001, leverage: 200 }), /leverage/);
});
test("all pending order types survive persisted dollar wallet validation", () => {
  for (const d of [
    { type: "Limit", limit: 99000 }, { type: "Maker only", limit: 99000 },
    { type: "Stop market", trigger: 101000 }, { type: "Stop limit", trigger: 101000, limit: 101000.5 },
    { type: "Take profit market", trigger: 99000 }, { type: "Take profit limit", trigger: 99000, limit: 99000 },
    { type: "Trailing stop", trail: 500 },
  ]) {
    const a = submit(d);
    assert.equal(a.orders.length, 1, d.type);
    assert.deepEqual(readGlobalAccount(JSON.stringify(a)), JSON.parse(JSON.stringify(a)));
    assert.ok(availablePerpCash(a) < a.wallet);
  }
});
test("marketable limit fills now; passive limit reserves and releases on cancellation", () => {
  assert.equal(submit({ type: "Limit", limit: 100001 }).positions[0].entry, 100000);
  const a = submit({ type: "Limit", limit: 99000 });
  assert.equal(a.positions.length, 0);
  const cancelled = cancelPerpOrder(a, a.orders[0].id, now + 1000);
  assert.equal(availablePerpCash(cancelled), cancelled.wallet);
  const b = advance(a, fresh(99000)); assert.equal(b.positions[0].entry, 99000);
});
test("maker only rejects crossing quotes and charges maker fee after passive order crosses", () => {
  assert.throws(() => submit({ type: "Maker only", limit: 100000 }), /immediately/);
  const b = advance(submit({ type: "Maker only", limit: 99000 }), fresh(99000));
  assert.ok(Math.abs(b.events[0].fee - 990 * .0002 * 1.18) < 1e-9);
});
test("stop market uses chosen source; stale observations never trigger", () => {
  const a = submit({ type: "Stop market", trigger: 100500, source: "index" });
  const b = advance(a, fresh(100600, 1000, { index: 100400 })); assert.equal(b.positions.length, 0);
  assert.equal(advance(b, fresh(100600, 2000)).positions.length, 1);
  assert.equal(advanceGlobalAccount(a, { BTCUSD: quote }, { BTCUSD: spec }, now + 40000).positions.length, 0);
});
test("stop limit latches trigger and waits for executable price after a gap", () => {
  const a = submit({ type: "Stop limit", trigger: 101000, limit: 101000 });
  const b = advance(a, fresh(101500)); assert.equal(b.orders[0].triggered, true); assert.equal(b.positions.length, 0);
  const c = advance(b, fresh(100900, 2000)); assert.equal(c.orders.length, 0); assert.equal(c.positions[0].entry, 100900);
});
test("take profit market and limit use the reverse trigger direction", () => {
  for (const type of ["Take profit market", "Take profit limit"]) {
    const a = submit({ type, trigger: 99000, limit: 99000 });
    assert.equal(advance(a, fresh(99500)).positions.length, 0);
    assert.equal(advance(a, fresh(98900)).positions[0].entry, 98900);
  }
});
test("trailing buy follows lows and triggers on reversal", () => {
  const a = submit({ type: "Trailing stop", trail: 500 });
  const b = advance(a, fresh(99000)); assert.equal(b.orders[0].anchor, 99000); assert.equal(b.orders[0].trigger, 99500);
  const c = advance(b, fresh(99400, 2000)); assert.equal(c.positions.length, 0);
  assert.equal(advance(c, fresh(99500, 3000)).positions.length, 1);
});
test("reduce-only can close shorts, never add or reverse, and needs no new margin", () => {
  const a = submit({ side: "SELL" });
  assert.throws(() => submit({ side: "SELL", reduceOnly: true }, a), /opposite/);
  assert.throws(() => submit({ contracts: 11, reduceOnly: true }, a), /quantity/);
  const b = submit({ contracts: 5, reduceOnly: true, type: "Limit", limit: 99000 }, a);
  assert.equal(b.orders[0].reserve, 0);
  assert.doesNotThrow(() => readGlobalAccount(JSON.stringify(b)));
  const c = advance(b, fresh(99000)); assert.equal(c.positions[0].contracts, 5);
  assert.equal(c.positions[0].side, "SELL");
});
test("market stop and target are OCO and isolated liquidation takes precedence", () => {
  const protection = { source: "mark", takeProfit: { mode: "Market", trigger: 101000 }, stopLoss: { mode: "Market", trigger: 99000 } };
  for (const price of [101000, 99000]) {
    const b = advance(submit({ protection }), fresh(price));
    assert.equal(b.positions.length, 0); assert.equal(b.events.filter(e => e.kind === "CLOSE").length, 1);
  }
  const c = advance(submit({ leverage: 200, protection }), fresh(90000));
  assert.equal(c.events.at(-1).kind, "LIQUIDATION");
});
test("bracket stop-limit remains triggered across rebound and closes only at its limit", () => {
  const a = submit({ protection: { source: "mark", stopLoss: { mode: "Limit", trigger: 99000, limit: 98950 } } });
  const b = advance(a, fresh(98500)); assert.equal(b.positions.length, 1); assert.equal(b.positions[0].protection.activeExit, "stopLoss");
  const c = advance(b, fresh(99500, 2000)); assert.equal(c.positions.length, 0);
});
test("bracket trail ratchets upward for longs and downward for shorts", () => {
  for (const side of ["BUY", "SELL"]) {
    const a = submit({ side, protection: { source: "mark", stopLoss: { mode: "Trail", trail: 500 } } });
    const peak = side === "BUY" ? 102000 : 98000;
    const b = advance(a, fresh(peak)); assert.equal(b.positions[0].protection.stopLoss.anchor, peak);
    const c = advance(b, fresh(side === "BUY" ? 101500 : 98500, 2000)); assert.equal(c.positions.length, 0);
  }
});
test("TP/SL can be updated and removed; malformed or unavailable sources are rejected", () => {
  const a = submit();
  const b = setGlobalProtection(a, "BTCUSD", { source: "last", takeProfit: { mode: "Market", trigger: 101000 } }, quote, now);
  assert.equal(b.positions[0].protection.source, "last");
  assert.equal(setGlobalProtection(b, "BTCUSD", undefined, quote, now).positions[0].protection, undefined);
  assert.throws(() => submit({ protection: { source: "mark", takeProfit: { mode: "Market", trigger: 90000 } } }), /wrong side/);
  assert.throws(() => submitGlobalOrder(a, spec, { ...quote, index: undefined }, { ...draft, type: "Stop market", trigger: 101000, source: "index" }, now), /unavailable/);
});
test("funding gap blocks entries but allows reduce-only conditional exits", () => {
  const a = { ...submit(), fundingGap: true };
  assert.throws(() => submit({}, a), /funding/);
  const b = submit({ side: "SELL", reduceOnly: true, type: "Stop market", trigger: 99000 }, a);
  assert.equal(advance(b, fresh(99000)).positions.length, 0);
});
test("gold lots use their own contract multiplier and USD accounting", () => {
  const s = { ...spec, symbol: "XAUTUSD", lot: .001, tick: .01, initial: .01 };
  const q = { ...quote, symbol: "XAUTUSD", bid: 3499.99, ask: 3500, mark: 3500, last: 3500 };
  const a = submitGlobalOrder(readGlobalAccount(null), s, q, { ...draft, contracts: 100, leverage: 20 }, now);
  assert.equal(a.positions[0].margin, 17.5);
  assert.equal(positionPnl(a.positions[0], 3510), 1);
});
