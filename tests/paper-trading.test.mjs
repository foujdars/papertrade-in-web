import assert from "node:assert/strict";
import test from "node:test";
import { calculatePosition, getProtectionTrigger } from "../lib/paper-trading.ts";

function order(id, side, quantity, price) {
  return {
    id: String(id),
    symbol: "RELIANCE",
    side,
    quantity,
    price,
    status: "COMPLETE",
    time: "10:00",
  };
}

test("calculates live unrealized P&L for a long position", () => {
  const position = calculatePosition([order(1, "BUY", 10, 100)], "RELIANCE", 110);
  assert.equal(position.side, "LONG");
  assert.equal(position.quantity, 10);
  assert.equal(position.averagePrice, 100);
  assert.equal(position.unrealizedPnl, 100);
  assert.equal(position.returnPercent, 10);
});

test("calculates weighted average and partial-close realized P&L", () => {
  const position = calculatePosition([
    order(1, "BUY", 10, 100),
    order(2, "BUY", 10, 120),
    order(3, "SELL", 4, 125),
  ], "RELIANCE", 115);

  assert.equal(position.side, "LONG");
  assert.equal(position.quantity, 16);
  assert.equal(position.averagePrice, 110);
  assert.equal(position.realizedPnl, 60);
  assert.equal(position.unrealizedPnl, 80);
  assert.equal(position.totalPnl, 140);
});

test("supports short positions and direction reversals", () => {
  const position = calculatePosition([
    order(1, "BUY", 5, 100),
    order(2, "SELL", 8, 110),
  ], "RELIANCE", 105);

  assert.equal(position.side, "SHORT");
  assert.equal(position.quantity, 3);
  assert.equal(position.averagePrice, 110);
  assert.equal(position.realizedPnl, 50);
  assert.equal(position.unrealizedPnl, 15);
  assert.equal(position.totalPnl, 65);
});

test("triggers target and stop loss correctly for long and short positions", () => {
  const base = { id: "risk-1", symbol: "RELIANCE", product: "INTRADAY", createdAt: 1 };
  const longProtection = { ...base, side: "LONG", targetPrice: 110, stopLossPrice: 95 };
  const shortProtection = { ...base, side: "SHORT", targetPrice: 90, stopLossPrice: 105 };

  assert.equal(getProtectionTrigger(longProtection, 110), "TARGET");
  assert.equal(getProtectionTrigger(longProtection, 94), "STOP_LOSS");
  assert.equal(getProtectionTrigger(shortProtection, 90), "TARGET");
  assert.equal(getProtectionTrigger(shortProtection, 106), "STOP_LOSS");
  assert.equal(getProtectionTrigger(longProtection, 100), null);
});
