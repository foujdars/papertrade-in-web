import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { gzipSync } from 'node:zlib';
import {readFileSync} from 'node:fs';
import { presentMovers, quotesFromScan } from '../lib/market-movers.ts';
import { boardQuotes } from '../lib/search-board.ts';
import { createMoverService, moverQuoteDelayed } from '../lib/mover-snapshot.ts';

const MONDAY = Date.parse('2026-10-12T06:00:00Z');
const scannerRow = (symbol = 'TEST', price = 117, changeAbs = 17) => ({ s: `NSE:${symbol}`, d: [symbol, price, 17, changeAbs, 1000, 2, 120, 50, 119, 90, 100_000, `${symbol} Ltd`] });
const quote = (symbol = 'TEST', change = 17) => quotesFromScan({ data: [scannerRow(symbol, 100 + change, change)] })[0];
const verified = (row, change, now = MONDAY) => ({ ...row, price: 100 + change, previousClose: 100, changeAbs: change, change, source: 'upstox', quoteAt: new Date(now).toISOString(), delayed: false });

test('scanner percentages use the same LTP and previous-close snapshot, not a mismatched reported percentage', () => {
  const rows = quotesFromScan({ data: [scannerRow('TEST', 109, 9)] });
  assert.equal(rows[0].change, 9);
  assert.equal(rows[0].previousClose, 100);
  assert.equal(rows[0].quoteAt, null);
  assert.equal(rows[0].delayed, true);
  for (const price of [null, '', false, 0, -10, NaN, Infinity]) assert.equal(quotesFromScan({ data: [scannerRow('BAD', price, 1)] }).length, 0);
  for (const delta of [null, '', false, NaN, Infinity, 110]) assert.equal(quotesFromScan({ data: [scannerRow('BAD', 109, delta)] }).length, 0);
});

test('corrected quotes are filtered and sorted again before the top eight are selected', () => {
  const rows = [verified(quote('OLDLEADER'), -2), verified(quote('SECOND'), 9), verified(quote('THIRD'), 12)];
  assert.deepEqual(presentMovers('gainers', rows).map(row => [row.symbol, row.change]), [['THIRD', 12], ['SECOND', 9]]);
  assert.deepEqual(presentMovers('losers', rows).map(row => row.symbol), ['OLDLEADER']);
  assert.equal(presentMovers('high52', [{ ...rows[1], high: 119, weekHigh: 120 }]).length, 0);
  assert.equal(presentMovers('low52', [{ ...rows[1], low: 90, weekLow: 50 }]).length, 0);
});

test('unknown, future and old quote timestamps are delayed; the last completed session is accepted when closed', () => {
  assert.equal(moverQuoteDelayed(null, MONDAY), true);
  assert.equal(moverQuoteDelayed(new Date(MONDAY - 61_000).toISOString(), MONDAY), true);
  assert.equal(moverQuoteDelayed(new Date(MONDAY + 120_000).toISOString(), MONDAY), true);
  assert.equal(moverQuoteDelayed(new Date(MONDAY - 10_000).toISOString(), MONDAY), false);
  const saturday = Date.parse('2026-10-17T06:00:00Z');
  assert.equal(moverQuoteDelayed('2026-10-16T10:00:00Z', saturday), false);
  assert.equal(moverQuoteDelayed('2026-10-15T10:00:00Z', saturday), true);
  assert.equal(moverQuoteDelayed('2026-10-16T04:00:00Z', saturday), true, 'Friday morning is not the closing snapshot');
});

test('Home, expanded movers and search consumers share corrected snapshots and preserve quote times', async () => {
  let calls = 0;
  const service = createMoverService({ now: () => MONDAY, scan: async () => { calls++; return [quote()]; }, verify: async rows => ({ quotes: new Map(rows.map(row => [row.symbol, verified(row, 9)])), warning: null }) });
  const summary = await service(true);
  assert.equal(calls, 3);
  assert.equal(summary.lists.gainers[0].change, 9);
  assert.equal(summary.status, 'verified');
  assert.equal(summary.lists.gainers[0].quoteAt, new Date(MONDAY).toISOString());
  assert.equal(summary.lists.losers.length, 0);
  await service(false);
  assert.equal(calls, 8, 'Expanded view reuses the summary categories');
  assert.deepEqual((await service(true)).lists.gainers, summary.lists.gainers);
  assert.equal(calls, 8);
});

test('late summary/full completions cannot overwrite newer quotes, checked times or success status', async () => {
  for (const olderSummary of [true, false]) {
    for (const olderFails of [true, false]) {
      let now = MONDAY;
      const requests = [];
      const service = createMoverService({ now: () => now,
        scan: tab => new Promise((resolve, reject) => requests.push({ tab, resolve, reject })),
        verify: async rows => ({ quotes: new Map(rows.map(row => [row.symbol, row])), warning: null }),
      });
      const older = service(olderSummary);
      const oldRequests = requests.splice(0);
      now += 1_000;
      const newer = service(!olderSummary);
      const newRequests = requests.splice(0);
      for (const request of newRequests) request.resolve([verified(quote(), 9, now)]);
      const fresh = await newer;
      const checkedAt = fresh.fetchedAt;
      now += 1_000;
      for (const request of oldRequests) olderFails ? request.reject(new Error('Late failure')) : request.resolve([verified(quote(), 17, MONDAY)]);
      const late = await older;
      assert.equal(late.lists.gainers[0].change, 9);
      assert.equal(late.lists.gainers[0].quoteAt, fresh.lists.gainers[0].quoteAt);
      const summary = await service(true);
      assert.equal(summary.lists.gainers[0].change, 9);
      assert.equal(summary.fetchedAt, checkedAt, 'A late response must not renew the successful check time');
      assert.deepEqual(summary.failedTabs, [], 'An older failure must not mark newer successful rows stale');
      assert.equal(summary.status, 'verified');
    }
  }
});

test('an older success cannot clear a newer failure or replace the retained successful snapshot', async () => {
  let now = MONDAY, defer = false;
  const requests = [];
  const service = createMoverService({ now: () => now,
    scan: tab => defer ? new Promise((resolve, reject) => requests.push({ tab, resolve, reject })) : Promise.resolve([verified(quote(), 7, now)]),
    verify: async rows => ({ quotes: new Map(rows.map(row => [row.symbol, row])), warning: null }),
  });
  const initial = await service(false);
  now += 15_000; defer = true;
  const older = service(false);
  const oldRequests = requests.splice(0);
  now += 1_000;
  const newer = service(true);
  for (const request of requests.splice(0)) request.reject(new Error('Newer scan unavailable'));
  const stale = await newer;
  assert.equal(stale.status, 'stale');
  now += 1_000;
  for (const request of oldRequests) request.resolve([verified(quote(), 17, MONDAY)]);
  const late = await older;
  assert.equal(late.lists.gainers[0].change, 7);
  assert.equal(late.fetchedAt, initial.fetchedAt);
  assert.deepEqual(late.staleTabs.sort(), ['gainers', 'high52', 'losers']);
});

test('scanner failure retains a bounded last snapshot without renewing its checked time', async () => {
  let now = MONDAY, failed = false;
  const service = createMoverService({ now: () => now, scan: async () => { if (failed) throw new Error('Offline'); return [quote()]; }, verify: async () => ({ quotes: new Map(), warning: null }) });
  const first = await service(true);
  failed = true; now += 15_000;
  const stale = await service(true);
  assert.equal(stale.ok, true);
  assert.equal(stale.status, 'stale');
  assert.equal(stale.fetchedAt, first.fetchedAt);
  assert.equal(stale.staleTabs.length, 3);
  assert.deepEqual(stale.lists.gainers, first.lists.gainers);
  now += 10 * 60_000;
  const expired = await service(true);
  assert.equal(expired.ok, false);
  assert.equal(expired.status, 'unavailable');
  assert.equal(expired.fetchedAt, null);
  assert.equal(expired.lists.gainers.length, 0);
});

test('broker failure and timeout return explicitly delayed scanner data, never verified data', async () => {
  for (const verify of [async () => { throw new Error('Expired token'); }, () => new Promise(() => {})]) {
    const service = createMoverService({ now: () => MONDAY, scan: async () => [quote()], verify, verificationTimeoutMs: 5 });
    const snapshot = await service(true);
    assert.equal(snapshot.status, 'delayed');
    assert.equal(snapshot.lists.gainers[0].quoteAt, null);
    assert.match(snapshot.warning, /failed or timed out/);
  }
});

test('one unavailable category is reported as partial rather than an apparently empty successful scan', async () => {
  const service = createMoverService({ now: () => MONDAY, scan: async tab => { if (tab === 'losers') throw new Error('Unavailable'); return [quote()]; }, verify: async () => ({ quotes: new Map(), warning: null }) });
  const snapshot = await service(true);
  assert.equal(snapshot.status, 'partial');
  assert.deepEqual(snapshot.failedTabs, ['losers']);
  assert.equal(snapshot.lists.gainers.length, 1);
});

test('US and crypto search changes also use a coherent daily baseline and reject null quotes', () => {
  const data = [{ d: ['NVDA', 109, 17, 1000, 'NVIDIA', 9] }, { d: ['BAD', null, 17, 100, 'Invalid', 9] }];
  const rows = boardQuotes({ data }, 'us');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].change, 9);
  assert.equal(rows[0].delayed, true);
});

let moduleId = 0;
async function routes() {
  const result = await build({ stdin: { contents: 'export {GET as movers} from "./app/api/market/movers/route.ts"; export {GET as search} from "./app/api/market/search-movers/route.ts";', resolveDir: process.cwd() }, bundle: true, write: false, format: 'esm', platform: 'node', plugins: [{ name: 'server-only', setup(b) {
    b.onResolve({ filter: /^server-only$/ }, () => ({ path: 'server-only', namespace: 'empty' }));
    b.onLoad({ filter: /.*/, namespace: 'empty' }, () => ({ contents: '' }));
  } }] });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text + `\n//${++moduleId}`).toString('base64')}`);
}

test('AKIKO SME mapping and 09:34 IST regression replace the opening +17.93% quote with +9.51% across both lists', async t => {
  // Historical prices are from broker-backed candles; the old scanner payload is reconstructed.
  const incident=JSON.parse(readFileSync(new URL('./fixtures/akiko-2026-10-16.json',import.meta.url)));
  const AKIKO_TIME=Date.parse('2026-10-16T04:04:00Z');
  t.mock.method(Date, 'now', () => AKIKO_TIME);
  const previousToken = process.env.UPSTOX_ACCESS_TOKEN;
  process.env.UPSTOX_ACCESS_TOKEN = 'test-token';
  t.after(() => previousToken === undefined ? delete process.env.UPSTOX_ACCESS_TOKEN : process.env.UPSTOX_ACCESS_TOKEN = previousToken);
  let brokerCalls = 0, scannerCalls = 0;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    if (String(url).includes('NSE.json.gz')) return new Response(gzipSync(JSON.stringify([
      { segment: 'NSE_EQ', exchange: 'NSE', instrument_type: 'SM', instrument_key: 'NSE_EQ|INE0PMR01017', trading_symbol: 'AKIKO' },
      { segment: 'BSE_EQ', exchange: 'BSE', instrument_type: 'EQ', instrument_key: 'BSE_EQ|INE0PMR01017', trading_symbol: 'AKIKO' },
    ])));
    if (String(url).includes('api.upstox.com')) {
      brokerCalls++;
      assert.equal(new URL(url).searchParams.get('instrument_key'), 'NSE_EQ|INE0PMR01017');
      return Response.json({ status: 'success', data: { 'NSE_EQ:AKIKO': { instrument_token: 'NSE_EQ|INE0PMR01017', symbol: 'AKIKO', last_price: incident.reportedMinute.price, net_change: incident.reportedMinute.price-incident.previousClose, timestamp: new Date(AKIKO_TIME).toISOString(), last_trade_time: String(Date.parse(incident.lastTradeBeforeReport.time)), ohlc: { close: incident.previousClose, high: incident.openingTrade.price, low: incident.reportedMinute.price }, volume: 2000, average_price: 105 }, other: { instrument_token: 'BSE_EQ|INE0PMR01017', symbol: 'AKIKO', last_price: 117, net_change: 17 } } });
    }
    scannerCalls++;
    if (String(url).includes('/india/')) return Response.json({ data: [scannerRow('AKIKO',incident.openingTrade.price,incident.openingTrade.price-incident.previousClose)] });
    const body = JSON.parse(options.body);
    assert.ok(body.columns.includes('change_abs'));
    return Response.json({ data: [{ d: [String(url).includes('/crypto/') ? 'BTCUSDT' : 'NVDA', 109, 17, 1000, 'Example', 9] }] });
  });
  const api = await routes();
  const response = await api.movers(new Request('https://papertrade.test/api/market/movers?summary=1'));
  const movers = await response.json();
  assert.equal(movers.lists.gainers[0].price, incident.reportedMinute.price);
  assert.ok(Math.abs(movers.lists.gainers[0].change-incident.expectedReportedPercent)<1e-9);
  assert.equal(movers.status, 'verified');
  assert.equal(brokerCalls, 1);
  const searchResponse = await api.search();
  const search = await searchResponse.json();
  assert.deepEqual(search.in.gainers, movers.lists.gainers);
  assert.equal(brokerCalls, 1);
  assert.equal(scannerCalls, 5);
  assert.equal(searchResponse.headers.get('cache-control'), 'no-store');
  assert.equal(search.metadata.us.status, 'delayed');
});

test('both routes report unavailable upstreams without caching a fresh empty result', async t => {
  const previousToken = process.env.UPSTOX_ACCESS_TOKEN;
  delete process.env.UPSTOX_ACCESS_TOKEN;
  t.after(() => { if (previousToken !== undefined) process.env.UPSTOX_ACCESS_TOKEN = previousToken; });
  let failed = true;
  t.mock.method(globalThis, 'fetch', async () => failed ? new Response('Unavailable', { status: 503 }) : Response.json({ data: [scannerRow()] }));
  const api = await routes();
  const request = new Request('https://papertrade.test/api/market/movers?summary=1');
  const outage = await api.movers(request);
  assert.equal(outage.status, 503);
  const unavailable = await outage.json();
  assert.equal(unavailable.status, 'unavailable');
  assert.equal(unavailable.fetchedAt, null);
  const search = await api.search();
  assert.equal(search.status, 503);
  assert.equal((await search.json()).metadata.us.status, 'unavailable');
  failed = false;
  const recovered = await (await api.movers(request)).json();
  assert.equal(recovered.ok, true);
  assert.equal(recovered.lists.gainers.length, 1);
  assert.equal(recovered.status, 'delayed');
});
