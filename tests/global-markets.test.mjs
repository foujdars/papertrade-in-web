import test from "node:test";
import assert from "node:assert/strict";
import {
  newPerpAccount,
  openPerp,
  closePerp,
  advancePerps,
  availablePerpCash,
  liquidationPrice,
  positionPnl,
  marginRate,
  readPerpAccount,
  normalizePerpSpec,
  normalizeDeltaCatalogue,
  deltaSymbolFromInstrumentKey,
  normalizePerpQuote,
  normalizeGlobalCandles,
  cancelPerpOrder,
} from "../lib/global-markets.ts";
import { evaluateGlobalAlert, globalAlertError } from "../lib/global-alerts.ts";
const now = 1800000000000;
const spec = {
  symbol: "BTCUSD",
  lot: 0.001,
  tick: 0.5,
  initial: 0.005,
  maintenance: 0.0025,
  initialScale: 0.000000025,
  maintenanceScale: 0.0000000125,
  scalingThreshold: 100000,
  maxNotional: 5000000,
  maker: 0.0002,
  taker: 0.0005,
  liquidation: 0.0005,
  fundingSeconds: 28800,
  operational: true,
  fetchedAt: now,
};
const quote = {
  symbol: "BTCUSD",
  last: 100000,
  mark: 100000,
  bid: 99999.5,
  ask: 100000,
  bidSize: 100000,
  askSize: 100000,
  funding: 0.0001,
  change: 1,
  at: now,
  operational: true,
};
test("isolated wallet reserves margin for both directions and never credits short-sale proceeds", () => {
  for (const side of ["BUY", "SELL"]) {
    const original = newPerpAccount(),
      a = openPerp(original, spec, quote, side, 10, 10, now);
    assert.equal(original.positions.length, 0);
    assert.ok(a.wallet < 100000);
    assert.ok(a.positions[0].margin > 8499);
    assert.ok(availablePerpCash(a) < 91500);
    assert.equal(a.positions[0].contracts, 10);
    assert.equal(a.events.length, 1);
  }
});
test("leverage changes margin, not the P&L of a fixed position", () => {
  const a = openPerp(newPerpAccount(), spec, quote, "BUY", 10, 10, now),
    b = openPerp(newPerpAccount(), spec, quote, "BUY", 10, 100, now);
  assert.equal(positionPnl(a.positions[0], 101000), 850);
  assert.equal(positionPnl(b.positions[0], 101000), 850);
  assert.equal(a.positions[0].margin, b.positions[0].margin * 10);
});
test("partial close releases proportional margin; reduce-only cannot reverse a position", () => {
  const a = openPerp(newPerpAccount(), spec, quote, "BUY", 10, 10, now),
    b = closePerp(
      a,
      "BTCUSD",
      { ...quote, bid: 101000, ask: 101000.5, mark: 101000 },
      4,
      now,
    );
  assert.equal(b.positions[0].contracts, 6);
  assert.equal(b.positions[0].margin, a.positions[0].margin * 0.6);
  assert.ok(b.wallet > a.wallet);
  assert.throws(() => closePerp(b, "BTCUSD", quote, 7, now), /quantity/);
  assert.throws(() => openPerp(a, spec, quote, "SELL", 1, 10, now), /opposite/);
});
test("limits reserve funds, require marketable quotes, and cancel releases the reservation", () => {
  const a = openPerp(
    newPerpAccount(),
    spec,
    quote,
    "BUY",
    10,
    10,
    now,
    undefined,
    undefined,
    99000,
  );
  assert.equal(a.positions.length, 0);
  assert.equal(a.orders.length, 1);
  assert.ok(availablePerpCash(a) < a.wallet);
  const waiting = advancePerps(
    a,
    { BTCUSD: { ...quote, last: 98999, at: now + 1000 } },
    { BTCUSD: spec },
    now + 1000,
  );
  assert.equal(
    waiting.positions.length,
    0,
    "last price touching limit is insufficient",
  );
  const filled = advancePerps(
    a,
    {
      BTCUSD: {
        ...quote,
        bid: 98999.5,
        ask: 99000,
        last: 99000,
        mark: 99000,
        at: now + 1000,
      },
    },
    { BTCUSD: spec },
    now + 1000,
  );
  assert.equal(filled.orders.length, 0);
  assert.equal(filled.positions[0].entry, 99000);
  const cancelled = cancelPerpOrder(a, a.orders[0].id, now);
  assert.equal(availablePerpCash(cancelled), cancelled.wallet);
});
test("stale/future/wrong-symbol quotes, bad quantity/ticks, liquidity and unsafe leverage are rejected", () => {
  const a = newPerpAccount();
  for (const q of [
    { ...quote, at: now - 31000 },
    { ...quote, at: now + 6000 },
    { ...quote, symbol: "XAUTUSD" },
    { ...quote, askSize: 0 },
  ])
    assert.throws(() => openPerp(a, spec, q, "BUY", 1, 5, now));
  for (const qty of [0, -1, 1.5, NaN, Infinity])
    assert.throws(() => openPerp(a, spec, quote, "BUY", qty, 5, now));
  assert.throws(() => openPerp(a, spec, quote, "BUY", 1, 201, now), /leverage/);
  assert.throws(
    () => openPerp(a, spec, quote, "BUY", 1001, 200, now),
    /leverage/,
  );
  assert.throws(
    () => openPerp(a, spec, quote, "BUY", 1, 5, now, 99000.1),
    /increment/,
  );
  assert.throws(
    () => openPerp(a, spec, quote, "BUY", 1, 5, now, 101000),
    /losing side/,
  );
  assert.ok(marginRate(spec, 200000) > spec.initial);
});
test("liquidation uses mark, is directionally correct, and cannot consume unrelated cash", () => {
  for (const side of ["BUY", "SELL"]) {
    const a = openPerp(newPerpAccount(), spec, quote, side, 10, 100, now),
      p = a.positions[0],
      liq = liquidationPrice(p);
    assert.ok(side === "BUY" ? liq < p.entry : liq > p.entry);
    const stressed = {
      ...quote,
      at: now + 1000,
      mark: side === "BUY" ? liq - 100 : liq + 100,
      bid: side === "BUY" ? 1000 : 200000,
      ask: side === "BUY" ? 1000.5 : 200000.5,
    };
    const b = advancePerps(
      a,
      { BTCUSD: stressed },
      { BTCUSD: spec },
      now + 1000,
    );
    assert.equal(b.positions.length, 0);
    assert.equal(b.events.at(-1).kind, "LIQUIDATION");
    assert.ok(b.wallet >= a.wallet - p.margin - 1e-8);
  }
});
test("observed funding is charged once; missed intervals are flagged and never invented", () => {
  const initial = openPerp(newPerpAccount(), spec, quote, "BUY", 10, 10, now),
    boundary = now + 10000;
  const a = {
    ...initial,
    lastChecked: now,
    positions: initial.positions.map((p) => ({ ...p, nextFunding: boundary })),
  };
  const q = { ...quote, at: boundary };
  const b = advancePerps(a, { BTCUSD: q }, { BTCUSD: spec }, boundary);
  assert.equal(b.events.filter((e) => e.kind === "FUNDING").length, 1);
  assert.ok(b.wallet < a.wallet);
  assert.ok(b.positions[0].margin < a.positions[0].margin);
  const c = advancePerps(b, { BTCUSD: q }, { BTCUSD: spec }, boundary + 1000);
  assert.equal(c.events.filter((e) => e.kind === "FUNDING").length, 1);
  const missed = advancePerps(
    { ...a, lastChecked: 0 },
    { BTCUSD: q },
    { BTCUSD: spec },
    boundary,
  );
  assert.equal(missed.fundingGap, true);
  assert.equal(missed.events.filter((e) => e.kind === "FUNDING").length, 0);
  assert.throws(
    () => openPerp(missed, spec, q, "BUY", 1, 10, boundary),
    /unmonitored/,
  );
  assert.equal(closePerp(missed, "BTCUSD", q, 10, boundary).fundingGap, false);
});
test("bad stored data and malformed exchange data cannot silently reset a wallet or fabricate candles", () => {
  assert.throws(() => readPerpAccount("{bad"));
  assert.throws(() =>
    readPerpAccount(
      JSON.stringify({
        version: 1,
        wallet: -1,
        revision: 0,
        positions: [],
        orders: [],
        events: [],
      }),
    ),
  );
  assert.equal(readPerpAccount(null).wallet, 100000);
  assert.throws(() => normalizePerpSpec({}, "BTCUSD", now));
  assert.throws(() => normalizePerpQuote({}, "BTCUSD"));
  assert.deepEqual(
    normalizeGlobalCandles([
      { time: 1, open: 5, high: 4, low: 3, close: 4, volume: 1 },
    ]),
    [],
  );
});
test("live USD Delta catalogue adds US tokens to the existing chart and rejects unsupported products", () => {
  const product = {
    symbol: "TSLAXUSD", contract_type: "perpetual_futures", is_quanto: false,
    notional_type: "vanilla", quoting_asset: { symbol: "USD" },
    contract_unit_currency: "TSLAX", underlying_asset: { name: "Tesla xStock Token" },
    state: "live", trading_status: "operational", contract_value: "0.01",
    tick_size: "0.01", initial_margin: "4", maintenance_margin: "2",
    initial_margin_scaling_factor: "0", maintenance_margin_scaling_factor: "0",
    max_leverage_notional: "20000", position_notional_limit: "125000",
    maker_commission_rate: "0.0002", taker_commission_rate: "0.0002",
    product_specs: { tags: ["xStock"], isolated_liq_penalty_factor: "0.005", rate_exchange_interval: 14400 },
  };
  const listed = normalizeDeltaCatalogue([product, { ...product, symbol: "TSLAX-OPTION", contract_type: "call_options" }, { ...product, symbol: "FAKEUSD", quoting_asset: { symbol: "INR" } }]);
  assert.deepEqual(listed.map(item => item.symbol), ["TSLAXUSD"]);
  assert.deepEqual(listed[0].categories, ["GLOBAL", "US_MARKET"]);
  assert.equal(deltaSymbolFromInstrumentKey(listed[0].instrumentKey), "TSLAXUSD");
  assert.equal(deltaSymbolFromInstrumentKey("DELTA|BUSD"), "BUSD");
  assert.equal(deltaSymbolFromInstrumentKey("DELTA|TSLAX-OPTION"), null);
  assert.equal(normalizePerpSpec(product, "TSLAXUSD", now).lot, 0.01);
  const account = openPerp(newPerpAccount(), { ...spec, symbol: "TSLAXUSD" }, { ...quote, symbol: "TSLAXUSD" }, "BUY", 1, 10, now);
  assert.equal(readPerpAccount(JSON.stringify(account)).positions[0].symbol, "TSLAXUSD");
});
test("global alerts run outside NSE hours, use post-arm prices and do not re-fire", () => {
  const rule = {
    id: "r",
    symbol: "BTCUSD",
    kind: "price-above",
    value: 99000,
    length: 14,
    createdAt: now - 1000,
    expiresAt: now + 100000,
  };
  assert.equal(evaluateGlobalAlert(rule, quote, [], now), true);
  assert.equal(
    evaluateGlobalAlert({ ...rule, triggeredAt: now }, quote, [], now),
    false,
  );
  assert.equal(
    evaluateGlobalAlert({ ...rule, createdAt: now }, quote, [], now),
    false,
  );
  assert.equal(
    evaluateGlobalAlert(rule, { ...quote, at: now - 40000 }, [], now),
    false,
  );
  assert.ok(globalAlertError({ ...rule, kind: "volume-spike", value: 1 }));
  assert.ok(globalAlertError({ ...rule, kind: "rsi-cross-up", value: 101 }));
});

test("technical alerts require confirmed post-arm bars, real crossings and contiguous history", () => {
  const end = Math.floor(now / 300000) * 300000,
    at = end + 6000;
  const bars = Array.from({ length: 32 }, (_, i) => ({
    time: end / 1000 - (32 - i) * 300,
    open: 100,
    high: 102,
    low: 98,
    close: 100,
    volume: 100,
  }));
  const rule = {
    id: "ema",
    symbol: "BTCUSD",
    kind: "ema-cross-up",
    value: 0,
    length: 14,
    createdAt: end - 60000,
    expiresAt: at + 100000,
  };
  const q = { ...quote, at };
  bars.at(-1).close = 101;
  assert.equal(evaluateGlobalAlert(rule, q, bars, at), true);
  assert.equal(
    evaluateGlobalAlert(rule, { ...q, at: end + 4000 }, bars, end + 4000),
    false,
    "wait for finalisation",
  );
  assert.equal(
    evaluateGlobalAlert({ ...rule, createdAt: end }, q, bars, at),
    false,
    "no historical crossing on creation",
  );
  assert.equal(
    evaluateGlobalAlert(
      rule,
      q,
      bars.filter((_, i) => i !== 28),
      at,
    ),
    false,
    "do not bridge missing bars",
  );
  const noCross = bars.map((c) => ({ ...c, close: 101 }));
  assert.equal(evaluateGlobalAlert(rule, q, noCross, at), false);
  const falling = bars.map((c) => ({ ...c }));
  falling.at(-1).close = 99;
  assert.equal(
    evaluateGlobalAlert({ ...rule, kind: "ema-cross-down" }, q, falling, at),
    true,
  );
  assert.equal(
    evaluateGlobalAlert(
      { ...rule, kind: "rsi-cross-up", value: 70 },
      q,
      bars,
      at,
    ),
    true,
  );
  assert.equal(
    evaluateGlobalAlert(
      { ...rule, kind: "rsi-cross-down", value: 30 },
      q,
      falling,
      at,
    ),
    true,
  );
});

test("volume alert excludes its own completed candle from the baseline and ignores a forming spike", () => {
  const end = Math.floor(now / 300000) * 300000,
    at = end + 6000;
  const bars = Array.from({ length: 20 }, (_, i) => ({
    time: end / 1000 - (20 - i) * 300,
    open: 100,
    high: 101,
    low: 99,
    close: 100,
    volume: 100,
  }));
  const rule = {
      id: "vol",
      symbol: "XAUTUSD",
      kind: "volume-spike",
      value: 2,
      length: 14,
      createdAt: end - 60000,
      expiresAt: at + 100000,
    },
    q = { ...quote, symbol: "XAUTUSD", at };
  assert.equal(
    evaluateGlobalAlert(
      rule,
      q,
      [...bars, { ...bars.at(-1), time: end / 1000, volume: 10000 }],
      at,
    ),
    false,
  );
  bars.at(-1).volume = 200;
  assert.equal(evaluateGlobalAlert(rule, q, bars, at), true);
  assert.equal(
    evaluateGlobalAlert(
      rule,
      q,
      bars.map((c) => ({ ...c, volume: 0 })),
      at,
    ),
    false,
  );
  assert.equal(
    evaluateGlobalAlert(rule, { ...q, at: at + 400000 }, bars, at + 400000),
    false,
    "old history cannot trigger",
  );
});

test("quotes cannot execute without finite liquidity, and stale contract rules fail closed", () => {
  for (const field of ["bidSize", "askSize", "funding"])
    assert.throws(() =>
      openPerp(
        newPerpAccount(),
        spec,
        { ...quote, [field]: undefined },
        "BUY",
        1,
        5,
        now,
      ),
    );
  for (const fetchedAt of [now - 3600001, now + 6000])
    assert.throws(() =>
      openPerp(
        newPerpAccount(),
        { ...spec, fetchedAt },
        quote,
        "BUY",
        1,
        5,
        now,
      ),
    );
});
