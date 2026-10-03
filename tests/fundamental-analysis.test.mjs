import assert from "node:assert/strict";
import { test } from "node:test";
import { evaluateScreenerCsv, sampleCsv } from "../lib/fundamental-screener.ts";
import { evaluateCompanyJson, rateFundamentalCompany, resolveFundamentalInstrument, metricMedian } from "../lib/fundamental-analysis.ts";
import { isSupportedNseInstrumentKey } from "../lib/upstox.ts";
import { sanitizeComparedSymbols } from "../lib/chart-compare.ts";

const company = {
  Name: "Test Industries", "NSE Code": "TEST", "BSE Code": "500000", Industry: "Engineering", "ISIN Code": "INE002A01018",
  "Pledged percentage": 0, "Return on equity": 15, "Average return on equity 3Years": 16, "Average return on equity 5Years": 17,
  "Return on capital employed": 18, "Average return on capital employed 3Years": 19, "Average return on capital employed 5Years": 20,
  "Debt to equity": .5, "Net Profit": 150, "Price to Earning": 20, "Industry PE": 20,
  "Profit growth 3Years": 12, "Profit growth 5Years": 10, "Sales growth 3Years": 9, "Sales growth 5Years": 8, OPM: 12,
  "PEG Ratio": 1.2, "Current ratio": 2, "Quick ratio": 1.5, "Data as of": "2026-03-31",
};
const evaluate = overrides => evaluateCompanyJson(JSON.stringify({ ...company, ...overrides })).result;

test("financial gates retain industry-specific thresholds and expose missing values", () => {
  assert.equal(evaluate({}).gateStatus, "review");
  const failed = evaluate({ "Return on equity": null });
  assert.equal(failed.gateStatus, "rejected");
  assert.ok(failed.failures.includes("ROE: data missing"));
  const bank = evaluate({ Industry: "Private Banks", "Debt to equity": 9, "Return on equity": 12, "Average return on equity 3Years": 12, "Average return on equity 5Years": 12 });
  assert.equal(bank.isFinancial, true); assert.equal(bank.gateStatus, "review");
  assert.ok(!bank.checks.some(check => check.id === "debt"));
  assert.equal(evaluate({ Industry: "Private Banks", "Return on equity": 11.99 }).gateStatus, "rejected");
  assert.equal(evaluate({ "Debt to equity": .5001 }).gateStatus, "rejected");
  assert.equal(evaluate({ "Price to Earning": -5 }).gateStatus, "rejected");
  assert.equal(evaluate({ "Price to Earning": 0 }).gateStatus, "rejected");
});

test("CSV quoting, numeric formats and duplicate company rows keep independent reviews", () => {
  const run = evaluateScreenerCsv('Name,NSE Code,BSE Code,Industry,Net Profit\n"Test, Industries",TEST,500000,Engineering,"1,234.5"\n"Test, Industries",TEST,500000,Engineering,(25)');
  assert.equal(run.results[0].name, "Test, Industries"); assert.equal(run.results[0].metrics.netProfit, 1234.5);
  assert.equal(run.results[1].metrics.netProfit, -25); assert.notEqual(run.results[0].id, run.results[1].id);
  assert.equal(run.results[0].metrics.roe, null); assert.ok(run.missingColumns.length);
  assert.ok(evaluateScreenerCsv(sampleCsv).results.length > 0);
});

test("rating weights and JSON missing inputs cannot grant default balance credit", () => {
  const rating = rateFundamentalCompany(evaluate({}));
  assert.equal(rating.overall, rating.gateScore * .5 + rating.quality * .15 + rating.growth * .15 + rating.valuation * .1 + rating.balance * .1);
  const missing = rateFundamentalCompany(evaluateCompanyJson('{"Name":"Unknown"}').result);
  assert.equal(missing.overall, 0); assert.equal(missing.balance, 0);
  assert.throws(() => evaluateCompanyJson("[]"), /one company/);
  assert.throws(() => evaluateCompanyJson('{"Name":"Company","OPM":{}}'), /text, numbers/);
  assert.equal(evaluateCompanyJson(JSON.stringify(company)).dataAsOf, "2026-03-31");
});

test("chart connection resolves listed symbols and valid NSE/BSE ISINs without using CSV prices", () => {
  const listed = { symbol: "TEST", name: "Listed company", exchange: "NSE", instrumentKey: "NSE_EQ|INE002A01018", assetType: "EQUITY", price: 0, change: 0, categories: [] };
  assert.equal(resolveFundamentalInstrument(evaluate({}), [listed]), listed);
  assert.equal(resolveFundamentalInstrument(evaluate({ "Current Price": 999 }), []).price, 0);
  const bse = resolveFundamentalInstrument(evaluate({ "NSE Code": "" }), []);
  assert.equal(bse.instrumentKey, "BSE_EQ|INE002A01018");
  assert.equal(isSupportedNseInstrumentKey(bse.instrumentKey), true);
  assert.equal(sanitizeComparedSymbols([bse]).length, 1);
  assert.equal(resolveFundamentalInstrument(evaluate({ "ISIN Code": "invalid" }), []), null);
  assert.equal(resolveFundamentalInstrument(evaluate({ "ISIN Code": "INE002A01018", "NSE Code": "-", "BSE Code": "NA" }), []), null);
  assert.equal(metricMedian([null, 3, 1, 5, 7]), 4); assert.equal(metricMedian([null]), null);
});
