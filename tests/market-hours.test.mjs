import assert from "node:assert/strict";
import test from "node:test";
import { getNseMarketStatus, nseDate, nseSquareOffMinute } from "../lib/market-hours.ts";
import { stackTradeMarkers, positionPnl, compactPnl } from "../lib/trade-marker-layout.ts";

test("enables intraday orders only during the weekday NSE session", () => {
  assert.equal(getNseMarketStatus(new Date("2026-08-03T03:44:00Z")).isOpen, false);
  assert.equal(getNseMarketStatus(new Date("2026-08-03T03:45:00Z")).isOpen, true);
  assert.equal(getNseMarketStatus(new Date("2026-08-03T09:59:00Z")).isOpen, true);
  assert.equal(getNseMarketStatus(new Date("2026-08-03T10:00:00Z")).isOpen, false);
});

test("Ganesh Chaturthi closes intraday despite being Monday", () => {
  const now = new Date("2026-09-14T08:00:00Z");
  assert.equal(getNseMarketStatus(now).isOpen, false);
  assert.match(getNseMarketStatus(now).message, /Ganesh Chaturthi/);
  const session = { date: nseDate(now), checkedAt: +now, status: "NORMAL_CLOSE", sessions: [], source: "test" };
  assert.equal(getNseMarketStatus(now, session).isTradingDay, false);
});

test("dated evening and weekend sessions override regular hours; stale status cannot enable orders", () => {
  const now = new Date("2026-11-08T12:40:00Z");
  const session = { date: nseDate(now), checkedAt: +now, status: "NORMAL_OPEN", source: "test", sessions: [{ start: Date.parse("2026-11-08T12:30:00Z"), end: Date.parse("2026-11-08T13:30:00Z") }] };
  assert.equal(getNseMarketStatus(now).isOpen, false);
  assert.equal(getNseMarketStatus(now, session).isOpen, true);
  assert.equal(nseSquareOffMinute(now, session), 18 * 60 + 30);
  assert.equal(getNseMarketStatus(new Date(+now + 90_000), session).isOpen, false);
  assert.equal(getNseMarketStatus(now, { ...session, status: "PRE_OPEN_START" }).isOpen, false);
  assert.equal(getNseMarketStatus(now, { ...session, status: "NORMAL_CLOSE" }).isOpen, false);
  assert.equal(getNseMarketStatus(now, { ...session, date: "2026-11-07" }).isOpen, false);
  assert.equal(getNseMarketStatus(now, null).isOpen, false);
  assert.equal(getNseMarketStatus(new Date(session.sessions[0].end), { ...session, checkedAt: session.sessions[0].end }).isOpen, false);
});

test("two round trips on one candle retain four separate markers at the same horizontal position", () => {
  for (const anchor of [60, 300, 580]) {
    const markers = Array.from({ length: 4 }, (_, i) => ({ id: String(i), time: i, candleTime: 100, x: 200, y: anchor, direction: i % 2 ? "up" : "down" }));
    const result = stackTradeMarkers(markers, 650).sort((a, b) => a.y - b.y);
    assert.equal(result.length, 4);
    assert.ok(result.every(m => m.x === 200 && m.y >= 0 && m.y <= 610));
    for (let i = 1; i < result.length; i++) assert.ok(result[i].y - result[i - 1].y >= 24);
    assert.ok(result.filter(m => m.direction === "down").every(m => m.y + 22 < anchor));
    assert.ok(result.filter(m => m.direction === "up").every(m => m.y > anchor));
  }
});

test("offscreen arrows are hidden rather than clamped into the price scale or across a candle", () => {
  const marker = { id: "sell", time: 1, candleTime: 1, x: 200, y: 150, direction: "down" };
  assert.equal(stackTradeMarkers([marker], 600, 300).length, 1);
  for (const x of [-10, 0, 295, 320]) assert.equal(stackTradeMarkers([{ ...marker, x }], 600, 300).length, 0);
  assert.equal(stackTradeMarkers([{ ...marker, y: 10 }], 600, 300).length, 0);
  assert.equal(stackTradeMarkers([{ ...marker, y: 590, direction: "up" }], 600, 300).length, 0);
  const many = Array.from({ length: 20 }, (_, i) => ({ ...marker, id: String(i), time: i }));
  assert.ok(stackTradeMarkers(many, 600, 300).every(m => m.y >= 0 && m.y + 22 < 150));
});

test("execution arrows follow compact chart bar spacing", () => {
  const marker = { id: "sell", time: 1, candleTime: 1, x: 200, y: 150, direction: "down" };
  const normal = stackTradeMarkers([marker], 300, 300)[0];
  const compact = stackTradeMarkers([marker], 300, 300, 10)[0];
  assert.ok(compact.y > normal.y);
  assert.equal(compact.y + 10, marker.y - 4);
});

test("fixed entry boxes display current-price P&L for long and short positions", () => {
  assert.equal(compactPnl(positionPnl("BUY", 10, 100, 105)), "+50");
  assert.equal(compactPnl(positionPnl("BUY", 10, 100, 95)), "-50");
  assert.equal(compactPnl(positionPnl("SELL", 10, 100, 95)), "+50");
  assert.equal(compactPnl(positionPnl("SELL", 10, 100, 105)), "-50");
  assert.equal(compactPnl(positionPnl("BUY", 10, 100, 100)), "0");
});

test("disables intraday orders on weekends", () => {
  const status = getNseMarketStatus(new Date("2026-08-01T06:30:00Z"));
  assert.equal(status.isTradingDay, false);
  assert.equal(status.isOpen, false);
  assert.match(status.message, /weekend/i);
});
