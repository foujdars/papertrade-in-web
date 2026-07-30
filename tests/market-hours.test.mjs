import assert from "node:assert/strict";
import test from "node:test";
import { getNseMarketStatus } from "../lib/market-hours.ts";

test("enables intraday orders only during the weekday NSE session", () => {
  assert.equal(getNseMarketStatus(new Date("2026-08-03T03:44:00Z")).isOpen, false);
  assert.equal(getNseMarketStatus(new Date("2026-08-03T03:45:00Z")).isOpen, true);
  assert.equal(getNseMarketStatus(new Date("2026-08-03T09:59:00Z")).isOpen, true);
  assert.equal(getNseMarketStatus(new Date("2026-08-03T10:00:00Z")).isOpen, false);
});

test("disables intraday orders on weekends", () => {
  const status = getNseMarketStatus(new Date("2026-08-01T06:30:00Z"));
  assert.equal(status.isTradingDay, false);
  assert.equal(status.isOpen, false);
  assert.match(status.message, /weekend/i);
});
