import test from "node:test";
import assert from "node:assert/strict";
import { moveOptionChartLevel } from '../lib/global-option-orders.ts';
import { normalizeDeltaOptionQuote, normalizeDeltaOptionSpec, normalizeDeltaSettlement } from "../lib/global-contracts.ts";
import { normalizeDeltaCatalogue, availablePerpCash } from "../lib/global-markets.ts";
import { readGlobalAccount } from "../lib/global-order-engine.ts";
import { advanceOptions, cancelOptionLimit, closeOption, executeOption, optionPnl, placeOptionLimit, settleOption } from "../lib/global-option-orders.ts";

const now = 1800000000000;
const symbol = "C-BTC-84000-170127";
const raw = {
  symbol, contract_type: "call_options", state: "live", trading_status: "operational",
  quoting_asset: { symbol: "USD" }, settling_asset: { symbol: "USD" },
  notional_type: "vanilla", is_quanto: false, contract_unit_currency: "BTC",
  underlying_asset: { name: "Bitcoin" }, strike_price: "84000", settlement_time: new Date(now + 86400000).toISOString(),
  contract_value: "0.001", tick_size: "0.1", maker_commission_rate: "0.0001", taker_commission_rate: "0.0001",
  product_specs: { premium_commission_rate: 0.035, only_reduce_only_orders_allowed: false },
};
const spec = normalizeDeltaOptionSpec(raw, symbol, now);
const rawQuote = { symbol, mark_price: "100", close: null, spot_price: "85000", quotes: { best_bid: "99", best_ask: "101", bid_size: "1000", ask_size: "1000" }, ltp_change_24h: null, timestamp: now * 1000, product_trading_status: "operational" };
const quote = normalizeDeltaOptionQuote(rawQuote, symbol);
const wallet = () => readGlobalAccount(null);

test('global option chart protection survives reload and executes at bid/ask', () => {
  const a = executeOption(wallet(), spec, quote, 'BUY', 10, 1, now);
  const b = moveOptionChartLevel(a, symbol, 'target', 110.03, quote, now);
  assert.equal(readGlobalAccount(JSON.stringify(b)).optionPositions[0].target, 110);
  const q = { ...quote, at: now + 1000, mark: 112, bid: 111, ask: 113 };
  const c = advanceOptions(b, { [symbol]: { snapshot: { spec, quote: q } } }, now + 1000);
  assert.equal(c.optionPositions.length, 0);
  assert.equal(c.optionEvents.at(-1).price, 111);
});
test('option short stop, stale quote rejection and removing protection', () => {
  const a = executeOption(wallet(), spec, quote, 'SELL', 10, 1, now);
  const b = moveOptionChartLevel(a, symbol, 'stopLoss', 110, quote, now);
  assert.throws(() => moveOptionChartLevel(a, symbol, 'target', 110, quote, now), /crossed/);
  assert.throws(() => moveOptionChartLevel(a, symbol, 'stopLoss', 110, quote, now + 40000), /fresh/);
  assert.equal(moveOptionChartLevel(b, symbol, 'stopLoss', undefined, quote, now).optionPositions[0].stopLoss, undefined);
  const q = { ...quote, at: now + 1000, mark: 111, bid: 110, ask: 112 };
  assert.equal(advanceOptions(b, { [symbol]: { snapshot: { spec, quote: q } } }, q.at).optionPositions.length, 0);
});
test('triggered option protection waits for liquidity and does not vanish on recross', () => {
  const a = moveOptionChartLevel(executeOption(wallet(), spec, quote, 'BUY', 10, 1, now), symbol, 'stopLoss', 90, quote, now);
  const q = { ...quote, at: now + 1000, mark: 89, bid: 88, ask: 90, bidSize: 0 };
  const b = advanceOptions(a, { [symbol]: { snapshot: { spec, quote: q } } }, q.at);
  assert.equal(b.optionPositions[0].riskExit, 'stopLoss');
  const recovered = { ...quote, at: now + 2000 };
  assert.equal(advanceOptions(b, { [symbol]: { snapshot: { spec, quote: recovered } } }, recovered.at).optionPositions.length, 0);
});

test('option liquidation still takes priority over a chart stop after a severe gap', () => {
  const a = moveOptionChartLevel(executeOption(wallet(), spec, quote, 'SELL', 10, 1, now), symbol, 'stopLoss', 110, quote, now);
  const q = { ...quote, at: now + 1000, mark: 100000, bid: 99999, ask: 100001 };
  const b = advanceOptions(a, { [symbol]: { snapshot: { spec, quote: q } } }, q.at);
  assert.equal(b.optionEvents.at(-1).kind, 'LIQUIDATION');
});

test("Delta options are searchable in the existing chart with contract details", () => {
  const listed = normalizeDeltaCatalogue([raw]);
  assert.equal(listed.length, 1);
  assert.equal(listed[0].assetType, "OPTION");
  assert.equal(listed[0].instrumentKey, `DELTA|${symbol}`);
  assert.equal(listed[0].strikePrice, 84000);
  assert.equal(spec.lot, 0.001);
  assert.equal(quote.last, 100, "mark substitutes for a missing last trade");
  assert.equal(quote.bid, 99);
  assert.equal(normalizeDeltaSettlement({ ...raw, state: "expired", settlement_price: "0" }, symbol), 0);
});

test("bought option reserves full premium, shares the USD wallet and can be sold", () => {
  const initial = wallet();
  const opened = executeOption(initial, spec, quote, "BUY", 10, 1, now);
  assert.equal(opened.optionPositions[0].margin, 1.01);
  assert.ok(availablePerpCash(opened) < availablePerpCash(initial));
  assert.equal(optionPnl(opened.optionPositions[0], 200), 0.99);
  assert.equal(readGlobalAccount(JSON.stringify(opened)).optionPositions[0].symbol, symbol);
  const closed = closeOption(opened, symbol, { ...quote, bid: 200, ask: 201, mark: 200, at: now + 1000 }, 10, now + 1000);
  assert.equal(closed.optionPositions.length, 0);
  assert.ok(closed.wallet > initial.wallet);
});

test("sold option reserves collateral and can be bought back without reversal", () => {
  const initial = wallet();
  const opened = executeOption(initial, spec, quote, "SELL", 10, 5, now);
  assert.ok(opened.optionPositions[0].margin > 100);
  assert.ok(availablePerpCash(opened) < availablePerpCash(initial));
  const closed = executeOption(opened, spec, { ...quote, bid: 39, ask: 40, mark: 40, at: now + 1000 }, "BUY", 10, 1, now + 1000);
  assert.equal(closed.optionPositions.length, 0);
  assert.ok(closed.wallet > initial.wallet);
  assert.throws(() => executeOption(opened, spec, quote, "BUY", 11, 1, now), /Close lots/);
});

test("option limit orders reserve funds, fill only on a later executable quote and can cancel", () => {
  const immediate = placeOptionLimit(wallet(), spec, quote, "BUY", 1, 1, 105, now);
  assert.equal(immediate.optionOrders.length, 0);
  assert.equal(immediate.optionPositions[0].contracts, 1);
  const pending = placeOptionLimit(wallet(), spec, quote, "BUY", 5, 1, 95, now);
  assert.equal(pending.optionOrders.length, 1);
  assert.ok(availablePerpCash(pending) < pending.wallet);
  const waiting = advanceOptions(pending, { [symbol]: { snapshot: { spec, quote: { ...quote, ask: 96, at: now + 1000 } } } }, now + 1000);
  assert.equal(waiting.optionOrders.length, 1);
  const filled = advanceOptions(pending, { [symbol]: { snapshot: { spec, quote: { ...quote, bid: 94, ask: 95, mark: 95, at: now + 1000 } } } }, now + 1000);
  assert.equal(filled.optionOrders.length, 0);
  assert.equal(filled.optionPositions[0].contracts, 5);
  const later = now + 2 * 3600000;
  const delayed = advanceOptions(pending, { [symbol]: { snapshot: { spec: { ...spec, fetchedAt: later }, quote: { ...quote, bid: 94, ask: 95, mark: 95, at: later } } } }, later);
  assert.equal(delayed.optionOrders.length, 0, "A resting limit still fills after its original product snapshot ages out");
  assert.equal(delayed.optionPositions[0].contracts, 5);
  assert.equal(cancelOptionLimit(pending, pending.optionOrders[0].id, now + 1000).optionOrders.length, 0);
});

test("expiry waits for Delta's published settlement and never invents a fill", () => {
  const opened = executeOption(wallet(), spec, quote, "BUY", 10, 1, now);
  const before = advanceOptions(opened, {}, spec.expiry + 1000);
  assert.equal(before.optionPositions.length, 1);
  const after = advanceOptions(before, { [symbol]: { settlement: 0 } }, spec.expiry + 2000);
  assert.equal(after.optionPositions.length, 0);
  assert.equal(after.optionEvents.at(-1).kind, "SETTLEMENT");
  assert.equal(after.optionEvents.at(-1).price, 0);
  assert.ok(after.wallet < opened.wallet);
  assert.equal(settleOption(after, symbol, 0, spec.expiry + 3000), after);
});

test("invalid options and corrupt saved records cannot trade or reset the wallet", () => {
  assert.throws(() => normalizeDeltaOptionSpec({ ...raw, settling_asset: { symbol: "INR" } }, symbol, now));
  assert.throws(() => executeOption(wallet(), spec, { ...quote, at: now - 31000 }, "BUY", 1, 1, now));
  assert.throws(() => executeOption(wallet(), spec, quote, "SELL", 1, 11, now));
  const opened = executeOption(wallet(), spec, quote, "BUY", 1, 1, now);
  assert.throws(() => readGlobalAccount(JSON.stringify({ ...opened, optionPositions: [{ ...opened.optionPositions[0], contracts: -1 }] })));
});
