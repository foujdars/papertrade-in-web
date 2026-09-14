import assert from "node:assert/strict";
import test from "node:test";
import { getNseMarketStatus, nseDate, nseSquareOffMinute } from "../lib/market-hours.ts";
import { stackTradeMarkers } from "../lib/trade-marker-layout.ts";

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
  for (const anchor of [60, 300, 610]) {
    const markers = Array.from({ length: 4 }, (_, i) => ({ id: String(i), time: i, candleTime: 100, x: 200, y: anchor, direction: i % 2 ? "up" : "down" }));
    const result = stackTradeMarkers(markers, 650).sort((a, b) => a.y - b.y);
    assert.equal(result.length, 4);
    assert.ok(result.every(m => m.x === 200 && m.y >= 0 && m.y <= 610));
    for (let i = 1; i < result.length; i++) assert.ok(result[i].y - result[i - 1].y >= 38);
  }
});

test("disables intraday orders on weekends", () => {
  const status = getNseMarketStatus(new Date("2026-08-01T06:30:00Z"));
  assert.equal(status.isTradingDay, false);
  assert.equal(status.isOpen, false);
  assert.match(status.message, /weekend/i);
});
