import test from "node:test";
import assert from "node:assert/strict";
import { bookPrices, calculateSpread, initialStrikes, SPREADS } from "../lib/vertical-spread.ts";
import { mcxSpreadDirectory, mcxSpreadQuote } from "../lib/mcx-spread-chain.ts";

function contract(strike, { kind = "CE", multiplier = 25, series = "2027-01-05", bid = null, ask = null, last = null } = {}) {
  return { id: `${kind}-${strike}`, series, strike, kind, multiplier, bid, ask, last };
}

const scenarios = [
  { id: "bullCall", premiums: [60, 30], maxProfit: 3500, maxLoss: 1500, breakEven: 1030, lowerPayoff: -1500, upperPayoff: 3500 },
  { id: "bearPut", premiums: [70, 30], maxProfit: 3000, maxLoss: 2000, breakEven: 1060, lowerPayoff: 3000, upperPayoff: -2000 },
  { id: "bullPut", premiums: [30, 70], maxProfit: 2000, maxLoss: 3000, breakEven: 1060, lowerPayoff: -3000, upperPayoff: 2000 },
  { id: "bearCall", premiums: [30, 60], maxProfit: 1500, maxLoss: 3500, breakEven: 1030, lowerPayoff: 1500, upperPayoff: -3500 },
];

for (const { id, premiums, maxProfit, maxLoss, breakEven, lowerPayoff, upperPayoff } of scenarios) {
  test(`${id} uses the correct expiry payoff and lot quantity`, () => {
    const preset = SPREADS[id];
    const low = contract(1000, { kind: preset.kind });
    const high = contract(1100, { kind: preset.kind });
    const result = calculateSpread(id, preset.buyLower ? low : high, preset.buyLower ? high : low, ...premiums, 2);
    assert.equal(result.quantity, 50);
    assert.equal(result.netPremium, Math.abs(premiums[0] - premiums[1]) * 50);
    assert.equal(result.maxProfit, maxProfit);
    assert.equal(result.maxLoss, maxLoss);
    assert.equal(result.breakEven, breakEven);
    assert.equal(result.payoff(breakEven), 0);
    assert.equal(result.payoff(0), lowerPayoff);
    assert.equal(result.payoff(1000), lowerPayoff);
    assert.equal(result.payoff(5000), upperPayoff);
  });
}

test("Delta contract value can be fractional", () => {
  const buy = contract(90000, { multiplier: 0.001 });
  const sell = contract(91000, { multiplier: 0.001 });
  const result = calculateSpread("bullCall", buy, sell, 1400, 1000, 10);
  assert.equal(result.netPremium, 4);
  assert.equal(result.maxLoss, 4);
  assert.equal(result.maxProfit, 6);
  assert.equal(result.breakEven, 90400);
});

test("incompatible expiries, strikes, lots and premiums are rejected", () => {
  const low = contract(1000);
  const high = contract(1100);
  assert.throws(() => calculateSpread("bullCall", low, { ...high, series: "2027-02-05" }, 50, 30, 2), /distinct strikes/);
  assert.throws(() => calculateSpread("bullCall", high, low, 50, 30, 2), /distinct strikes/);
  assert.throws(() => calculateSpread("bullCall", low, { ...high, multiplier: null }, 50, 30, 2), /verified lot/);
  assert.throws(() => calculateSpread("bullCall", low, high, 50, 30, 0.5), /whole number/);
  assert.throws(() => calculateSpread("bullCall", low, high, Infinity, 30, 2), /valid premium/);
  assert.throws(() => calculateSpread("bullCall", low, high, 30, 50, 2), /net debit/);
  assert.throws(() => calculateSpread("bearCall", high, low, 30, 150, 2), /net credit/);
});

test("auto-selection prefers a valid bid and ask pair and leaves missing book sides unknown", () => {
  const near = contract(100, { ask: 20, bid: 17 });
  const noBid = contract(105, { ask: 19 });
  const far = contract(110, { ask: 16, bid: 12 });
  assert.deepEqual(initialStrikes([noBid, far, near], "bullCall", 100, "market"), { buy: near.id, sell: far.id });
  assert.deepEqual(bookPrices("1", "2", "0", "3"), { bid: null, ask: 2 });
  assert.deepEqual(bookPrices(3, 2, 5, 5), { bid: null, ask: null });
  assert.deepEqual(bookPrices(true, -2, 5, 5), { bid: null, ask: null });
});

test("MCX option series and multipliers are based on the listed contract and its futures series", () => {
  const now = new Date("2026-11-27T08:30:00Z");
  const expiry = Date.parse("2026-12-28T23:30:00+05:30");
  const future = { segment: "MCX_FO", instrument_type: "FUT", instrument_key: "MCX_FO|99", trading_symbol: "SILVERM 26 FEB 27" };
  const other = { ...future, instrument_key: "MCX_FO|98", trading_symbol: "SILVERM 30 APR 27" };
  const base = { segment: "MCX_FO", instrument_type: "CE", expiry, trading_symbol: "SILVERM 150000 CE 28 DEC 26", underlying_key: future.instrument_key, strike_price: 150000, lot_size: 1 };
  const call = { ...base, instrument_key: "MCX_FO|1" };
  const put = { ...base, instrument_type: "PE", instrument_key: "MCX_FO|2" };
  const distinct = { ...base, instrument_key: "MCX_FO|3", underlying_key: other.instrument_key };
  const expired = { ...base, instrument_key: "MCX_FO|4", expiry: expiry - 40 * 86400000 };
  const gold = { ...base, instrument_key: "MCX_FO|5", trading_symbol: "GOLDM 150000 CE 28 DEC 26", underlying_key: undefined };
  const directory = mcxSpreadDirectory([future, other, call, put, distinct, expired, gold], "SILVERM", now);
  assert.equal(directory.series.length, 2);
  assert.deepEqual(directory.series[1], { id: "2026-12-28~MCX_FO|99", expiry: "2026-12-28", detail: future.trading_symbol, futureKey: future.instrument_key });
  assert.equal(directory.contracts.length, 3);
  assert.equal(directory.contracts[0].multiplier, 5);
  assert.equal(mcxSpreadDirectory([gold], "GOLDM", now).contracts[0].multiplier, 10);
  const quote = { instrument_token: call.instrument_key, last_price: 70, depth: { buy: [{ price: 69, quantity: 4 }], sell: [{ price: 71, quantity: 0 }] } };
  assert.deepEqual(mcxSpreadQuote(directory.contracts[0], quote), { ...directory.contracts[0], last: 70, bid: 69, ask: null });
  assert.equal(mcxSpreadQuote(directory.contracts[1], quote).last, null);
});
