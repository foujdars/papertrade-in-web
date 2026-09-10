import test from "node:test";
import assert from "node:assert/strict";
import { buildOptionPayoff, calculateRiskBasedQuantity, evaluateTradingLimits } from "../lib/trading-coach.ts";
import { buildClosedTrades } from "../lib/trade-analytics.ts";

test("risk sizing respects the selected lot size", () => {
  assert.equal(calculateRiskBasedQuantity(100, 96, 2_000, 25), 500);
  assert.equal(calculateRiskBasedQuantity(100, 100, 2_000, 25), 0);
});

test("option payoff calculates long-call risk and breakeven", () => {
  const payoff = buildOptionPayoff([{ optionType: "CE", side: "BUY", strike: 100, premium: 5, quantity: 10 }], 100);
  assert.ok(payoff.unboundedProfit);
  assert.equal(payoff.unboundedLoss, false);
  assert.ok(payoff.breakevens.some((value) => Math.abs(value - 105) < 1));
  assert.equal(Math.round(Math.abs(payoff.maxLoss)), 50);
});

test("option payoff includes the bounded maximum profit of a long put", () => {
  const payoff = buildOptionPayoff([{ optionType: "PE", side: "BUY", strike: 100, premium: 5, quantity: 10 }], 100);
  assert.equal(Math.round(payoff.maxProfit), 950);
  assert.equal(payoff.unboundedProfit, false);
});

test("personal limits block new trades after the configured daily loss", () => {
  const now = new Date("2026-09-10T06:00:00.000Z").getTime();
  const orders = [
    { id: String(now - 60_000), symbol: "TEST", side: "SELL", quantity: 10, price: 90, status: "COMPLETE", time: "11:00", product: "INTRADAY", createdAt: now - 60_000 },
    { id: String(now - 120_000), symbol: "TEST", side: "BUY", quantity: 10, price: 100, status: "COMPLETE", time: "10:59", product: "INTRADAY", createdAt: now - 120_000 },
  ];
  const trades = buildClosedTrades(orders);
  const result = evaluateTradingLimits(orders, trades, { enabled: true, dailyLossLimit: 90, maxTradesPerDay: 20, cooldownAfterLosses: 0, cooldownMinutes: 0 }, now);
  assert.equal(result.blocked, true);
  assert.match(result.reasons[0], /Daily loss limit/);
});
