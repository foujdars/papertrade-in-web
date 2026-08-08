import assert from "node:assert/strict";
import test from "node:test";
import { calculatePosition, deletePaperTradeOrders, getDeliveryHoldingQuantity, getProtectionTrigger, paperOrderCapitalValue, repairRatnaveerSimulationTrade, validateDeliverySell } from "../lib/paper-trading.ts";
import { buildClosedTrades } from "../lib/trade-analytics.ts";
import { calculateUpstoxFutureCharges, calculateUpstoxOptionCharges, calculateUpstoxTradingCharges } from "../lib/trading-charges.ts";

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

test("calculates current NSE option premium charges", () => {
  const buy = calculateUpstoxOptionCharges({ side: "BUY", quantity: 65, price: 100 });
  const sell = calculateUpstoxOptionCharges({ side: "SELL", quantity: 65, price: 100 });
  assert.equal(buy.brokerage, 20);
  assert.equal(buy.stt, 0);
  assert.equal(buy.ipftCharges, 0.03);
  assert.equal(sell.stt, 9.75);
  assert.ok(sell.total > buy.total);
});

test("calculates current equity delivery charges on buy and sell", () => {
  const buy = calculateUpstoxTradingCharges("EQUITY", { side: "BUY", product: "DELIVERY", quantity: 10, price: 1000 });
  const sell = calculateUpstoxTradingCharges("EQUITY", { side: "SELL", product: "DELIVERY", quantity: 10, price: 1000 });
  assert.equal(buy.brokerage, 20);
  assert.equal(buy.stt, 10);
  assert.equal(buy.transactionCharges, 0.31);
  assert.equal(buy.stampDuty, 1.5);
  assert.equal(sell.dpCharges, 20);
  assert.ok(sell.total > buy.total);
});

test("requires full cash for delivery and restricts delivery sells to holdings", () => {
  const deliveryBuy = { ...order(1, "BUY", 10, 100), product: "DELIVERY", assetType: "EQUITY" };
  const partialSell = { ...order(2, "SELL", 4, 110), product: "DELIVERY", assetType: "EQUITY" };
  const fills = [deliveryBuy, partialSell];

  assert.equal(paperOrderCapitalValue("EQUITY", "DELIVERY", 10, 100), 1000);
  assert.equal(paperOrderCapitalValue("EQUITY", "INTRADAY", 10, 100), 200);
  assert.equal(getDeliveryHoldingQuantity(fills, "RELIANCE"), 6);
  assert.equal(validateDeliverySell(fills, "RELIANCE", 6), null);
  assert.match(validateDeliverySell(fills, "RELIANCE", 7), /only 6 delivery shares/);
  assert.match(validateDeliverySell([], "RELIANCE", 1), /Buy it first/);
});

test("calculates current NSE futures charges and routes them through the shared F&O model", () => {
  const buy = calculateUpstoxFutureCharges({ side: "BUY", quantity: 65, price: 100 });
  const sell = calculateUpstoxFutureCharges({ side: "SELL", quantity: 65, price: 100 });

  assert.equal(buy.brokerage, 3.25);
  assert.equal(buy.stt, 0);
  assert.equal(buy.stampDuty, 0.13);
  assert.equal(sell.stt, 3.25);
  assert.equal(sell.stampDuty, 0);
  assert.equal(sell.total, 7.23);
  assert.deepEqual(
    calculateUpstoxTradingCharges("FUTURE", { side: "SELL", product: "INTRADAY", quantity: 65, price: 100 }),
    sell,
  );
});

test("deducts both futures legs from completed-trade P&L", () => {
  const legacyWrongCharges = { brokerage: 0, stt: 0, transactionCharges: 0, ipftCharges: 0, sebiCharges: 0, gst: 0, stampDuty: 0, dpCharges: 0, total: 999 };
  const entry = { ...order(1, "BUY", 65, 100), assetType: "FUTURE", product: "INTRADAY", charges: legacyWrongCharges };
  const exit = { ...order(2, "SELL", 65, 110), assetType: "FUTURE", product: "INTRADAY", charges: legacyWrongCharges };
  const [trade] = buildClosedTrades([entry, exit]);
  const expectedCharges = calculateUpstoxFutureCharges(entry).total + calculateUpstoxFutureCharges(exit).total;

  assert.equal(trade.grossPnl, 650);
  assert.equal(trade.charges, expectedCharges);
  assert.equal(trade.netPnl, 650 - expectedCharges);
});

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

test("removes the corrupted RATNAVEER simulated stop-loss pair and repairs cash", () => {
  const entryTime = Date.parse("2026-08-05T09:17:21+05:30");
  const exitTime = Date.parse("2026-08-05T09:21:32+05:30");
  const goodOrder = { ...order(3, "SELL", 2508, 213.67), id: "good", symbol: "RATNAVEER", createdAt: Date.parse("2026-08-05T09:33:53+05:30") };
  const corrupted = [
    goodOrder,
    { ...order(2, "BUY", 500, 2987.4), id: "bad-exit", symbol: "RATNAVEER", createdAt: exitTime },
    { ...order(1, "SELL", 500, 208.73), id: "bad-entry", symbol: "RATNAVEER", createdAt: entryTime },
  ];
  const repaired = repairRatnaveerSimulationTrade(corrupted);
  assert.deepEqual(repaired.orders.map((item) => item.id), ["good"]);
  assert.equal(repaired.removedOrders.length, 2);
  assert.ok(repaired.balanceAdjustment > 277000 && repaired.balanceAdjustment < 279000);
});

test("tracks the source fills of a completed trade and deletes them consistently", () => {
  const fills = [order(2, "SELL", 10, 110), order(1, "BUY", 10, 100), order(3, "BUY", 2, 90)];
  const trades = buildClosedTrades(fills);
  assert.equal(trades.length, 1);
  assert.deepEqual(new Set(trades[0].sourceOrderIds), new Set(["1", "2"]));
  const deletion = deletePaperTradeOrders(fills, trades[0].sourceOrderIds);
  assert.deepEqual(deletion.orders.map((item) => item.id), ["3"]);
  assert.equal(deletion.removedOrders.length, 2);
  assert.ok(Number.isFinite(deletion.balanceAdjustment));
});
