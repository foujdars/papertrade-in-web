import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateGmpPercent,
  dedupeIpos,
  formatIpoGmp,
  indiaDateKey,
  normalizeSubscription,
  shouldSendDailyGmpAlert,
} from "../lib/ipo.ts";

const ipo = (overrides = {}) => ({
  id: "example-ipo",
  symbol: "EXAMPLE",
  name: "Example IPO",
  status: "open",
  isin: "INE000000001",
  issueType: "regular",
  issueSizeCrore: 100,
  industry: "Technology",
  minimumPrice: 100,
  maximumPrice: 110,
  biddingStartDate: "2026-09-01",
  biddingEndDate: "2026-09-03",
  totalSubscription: 1,
  gmpAmount: null,
  gmpPercent: null,
  gmpUpdatedAt: "",
  ...overrides,
});

test("normalizes Upstox subscription multiples safely", () => {
  assert.equal(normalizeSubscription("15.42"), 15.42);
  assert.equal(normalizeSubscription("invalid"), 0);
  assert.equal(normalizeSubscription(-2), 0);
});

test("calculates GMP percentage from the upper issue price", () => {
  assert.equal(calculateGmpPercent(18, 100), 18);
  assert.equal(calculateGmpPercent(15, 110), 13.64);
  assert.equal(calculateGmpPercent(null, 110), null);
  assert.equal(calculateGmpPercent(20, 0), null);
});

test("GMP presentation separates missing data from a real zero or negative premium", () => {
  assert.equal(formatIpoGmp(ipo()), null);
  assert.equal(formatIpoGmp(ipo({ gmpAmount: 5 })), null);
  assert.equal(formatIpoGmp(ipo({ gmpAmount: NaN, gmpPercent: 5 })), null);
  assert.equal(formatIpoGmp(ipo({ gmpAmount: 0, gmpPercent: 0 })), "₹0 (0.00%)");
  assert.equal(formatIpoGmp(ipo({ gmpAmount: 20, gmpPercent: 18.18 })), "+₹20 (+18.18%)");
  assert.equal(formatIpoGmp(ipo({ gmpAmount: -10, gmpPercent: -9.09 })), "₹-10 (-9.09%)");
});

test("alerts once per India day only while an IPO is open and GMP is above 15%", () => {
  const today = "2026-09-01";
  assert.equal(shouldSendDailyGmpAlert("open", 15.01, undefined, today), true);
  assert.equal(shouldSendDailyGmpAlert("open", 15, undefined, today), false);
  assert.equal(shouldSendDailyGmpAlert("open", 20, today, today), false);
  assert.equal(shouldSendDailyGmpAlert("closed", 25, undefined, today), false);
  assert.equal(shouldSendDailyGmpAlert("upcoming", 25, undefined, today), false);
});

test("uses the India calendar date for daily GMP alerts", () => {
  assert.equal(indiaDateKey("2026-08-31T19:00:00.000Z"), "2026-09-01");
});

test("deduplicates IPOs by id and keeps the newest higher subscription value", () => {
  const result = dedupeIpos([ipo(), ipo({ totalSubscription: 3.5 })]);
  assert.equal(result.length, 1);
  assert.equal(result[0].totalSubscription, 3.5);
});
