import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateGmpPercent,
  dedupeIpos,
  formatIpoGmp,
  indiaDateKey,
  normalizeSubscription,
  shouldSendIpoClosingAlert,
  shouldSendDailyGmpAlert,
  sortIposByClosingDate,
} from "../lib/ipo.ts";
import { findPublicGmp, parsePublicGmpHtml } from "../lib/ipo-gmp-server.ts";
import { ipoStage, isRecentListing, listingReturn, gmpTone, compactIpoName, sortIposByLifecycle } from "../lib/ipo-lifecycle.ts";
import { parseKfinIssuers, reportedAllotmentOut, ipoPublicationSlug } from "../lib/ipo-publication.ts";

test("compact names remove only the redundant IPO suffix", () => {
  assert.equal(compactIpoName("Pranav Constructions IPO"), "Pranav Constructions");
  assert.equal(compactIpoName("IPOWER Limited"), "IPOWER Limited");
});

test("active issues sort release first, waiting second, then nearest closing date", () => {
  const result = sortIposByLifecycle([
    ipo({ id: "later", biddingEndDate: "2026-09-16" }),
    ipo({ id: "waiting", status: "closed", details: { allotmentDate: "2026-09-12" } }),
    ipo({ id: "closing", biddingEndDate: "2026-09-12" }),
    ipo({ id: "released-later", status: "closed", details: { allotmentPublished: true, allotmentDate: "2026-09-11" } }),
    ipo({ id: "released-first", status: "closed", details: { allotmentPublished: true, allotmentDate: "2026-09-10" } }),
  ], "2026-09-12");
  assert.deepEqual(result.map(item => item.id), ["released-first", "released-later", "waiting", "closing", "later"]);
});

test("KFin catalogue is parsed as data and release reports must match the primary issuer", () => {
  const name = "Pranav Constructions IPO";
  const script = `const rows=JSON.parse('[{"clientId":"123","name":"PRANAV CONSTRUCTIONS LIMITED"}]');`;
  assert.deepEqual(parseKfinIssuers(script), ["PRANAV CONSTRUCTIONS LIMITED"]);
  assert.deepEqual(parseKfinIssuers("JSON.parse('broken')"), []);
  assert.equal(ipoPublicationSlug(name), "pranav-constructions-ipo");
  const record = (issuer, status) => `<section data-ipo-name="${issuer}" data-ipo-status="${status}" data-testid="ipo-summary-card">`;
  assert.equal(reportedAllotmentOut(record("Pranav Constructions", "Allotment Out"), name), true);
  assert.equal(reportedAllotmentOut(record("Pranav Constructions", "Awaiting Allotment"), name), false);
  assert.equal(reportedAllotmentOut(record("Different Company", "Allotment Out"), name), false);
  assert.equal(reportedAllotmentOut("<p>Pranav Constructions Allotment Out</p>", name), false);
  assert.equal(reportedAllotmentOut(script, name), false, "registrar dropdown presence alone is not proof");
});

test("IPO stage keeps closed issues in Open until actual listing is known", () => {
  const base = { status: "open", biddingStartDate: "2026-09-01", biddingEndDate: "2026-09-03", details: { dailyEndTime: "17:00:00", listingDate: "2026-09-08", listingPrice: null, allotmentPublished: false } };
  assert.equal(ipoStage(base, "2026-08-31"), "upcoming");
  assert.equal(ipoStage(base, "2026-09-03", "16:59:59"), "open");
  assert.equal(ipoStage(base, "2026-09-03", "17:00:00"), "waiting");
  assert.equal(ipoStage(base, "2026-09-08"), "waiting", "tentative listing date alone is not confirmation");
  assert.equal(ipoStage({ ...base, details: { ...base.details, allotmentPublished: true } }, "2026-09-07"), "allotted");
  assert.equal(ipoStage({ ...base, details: { ...base.details, listingPrice: 125 } }, "2026-09-08"), "listed");
  assert.equal(ipoStage({ ...base, status: "listed" }, "2026-09-08"), "listed");
});

test("Listed retention counts from listing, includes day 30, excludes the following date", () => {
  assert.equal(isRecentListing("2026-08-13", "2026-09-11"), true);
  assert.equal(isRecentListing("2026-08-12", "2026-09-11"), false);
  assert.equal(isRecentListing("2026-09-11", "2026-09-11"), true);
  assert.equal(isRecentListing("2026-09-12", "2026-09-11"), false);
  assert.equal(isRecentListing(undefined, "2026-09-11"), false);
  assert.equal(isRecentListing("invalid", "2026-09-11"), false);
});

test("GMP UI uses inclusive 15 percent boundary and missing data stays neutral", () => {
  assert.equal(gmpTone(14.99), "low");
  assert.equal(gmpTone(15), "high");
  assert.equal(gmpTone(0), "low");
  assert.equal(gmpTone(-3), "low");
  assert.equal(gmpTone(null), "pending");
  assert.equal(gmpTone(NaN), "pending");
  assert.equal(listingReturn(125, 100), 25);
  assert.equal(listingReturn(100, 100), 0);
  assert.ok(Math.abs(listingReturn(90, 100) + 10) < .0001);
  assert.equal(listingReturn(null, 100), null);
  assert.equal(listingReturn(100, 0), null);
});

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

test("alerts once when an open IPO closes today", () => {
  assert.equal(shouldSendIpoClosingAlert("open", "2026-09-09", undefined, "2026-09-09"), true);
  assert.equal(shouldSendIpoClosingAlert("open", "2026-09-09", "2026-09-09", "2026-09-09"), false);
  assert.equal(shouldSendIpoClosingAlert("upcoming", "2026-09-09", undefined, "2026-09-09"), false);
  assert.equal(shouldSendIpoClosingAlert("open", "2026-09-10", undefined, "2026-09-09"), false);
});

test("sorts open IPOs closing today first, then by nearest closing date", () => {
  const result = sortIposByClosingDate([
    ipo({ id: "later", biddingEndDate: "2026-09-11", gmpPercent: 50 }),
    ipo({ id: "today", biddingEndDate: "2026-09-09", gmpPercent: 5 }),
    ipo({ id: "tomorrow", biddingEndDate: "2026-09-10", gmpPercent: 25 }),
  ], "2026-09-09");
  assert.deepEqual(result.map((item) => item.id), ["today", "tomorrow", "later"]);
});

test("parses and matches the public GMP feed by IPO name", () => {
  const entries = parsePublicGmpHtml(`
    <div class="ipg-gp-card-top"><a class="ipg-gp-card-name"><span></span>Asset Reconstruction Co. IPO GMP</a>
    <div class="ipg-gp-card-gmp"><span class="ipg-gp-card-val">&#8377;30.5</span></div>
  `);
  assert.deepEqual(entries, [{ name: "Asset Reconstruction Co.", amount: 30.5 }]);
  assert.equal(findPublicGmp(ipo({ name: "Asset Reconstruction Co. (India) IPO" }), entries)?.amount, 30.5);
});

test("deduplicates IPOs by id and keeps the newest higher subscription value", () => {
  const result = dedupeIpos([ipo(), ipo({ totalSubscription: 3.5 })]);
  assert.equal(result.length, 1);
  assert.equal(result[0].totalSubscription, 3.5);
});
