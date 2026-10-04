import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import * as news from '../lib/market-news.ts';
const { headlineSignals, parseNewsFeed, rankNews, matchNewsStocks } = news;

test('mixed signals and neutral headlines stay distinct; policy and corporate events are important', () => {
  assert.equal(headlineSignals('Profit rises but fraud probe continues').sentiment, 'Mixed');
  assert.equal(headlineSignals('Board meeting on Monday').sentiment, 'Neutral');
  for (const title of ['SEBI changes margin rules', 'Company wins new contract', 'Inflation data released', 'Board announces stock split']) assert.equal(headlineSignals(title).importance, 3);
});
test('feeds reject unsafe links, missing dates and old headlines', () => {
  const now = Date.parse('2026-10-04T06:00:00Z');
  const item = (url, date) => `<item><title><![CDATA[Company wins &amp; grows]]></title><link>${url}</link><pubDate>${date}</pubDate></item>`;
  const rows = parseNewsFeed(item('https://example.com', '2026-10-04') + item('javascript:alert(1)', '2026-10-04') + item('https://example.com', '2025-01-01') + item('https://example.com', 'bad'), 'Test', now);
  assert.equal(rows.length, 1); assert.equal(rows[0].title, 'Company wins & grows');
});
test('stock links respect word boundaries and avoid common lowercase abbreviations', () => {
  const stocks = [{ symbol: 'ITC', name: 'ITC Limited' }, { symbol: 'HAL', name: 'Hindustan Aeronautics' }, { symbol: 'TCS', name: 'Tata Consultancy Services' }];
  assert.deepEqual(matchNewsStocks('HAL wins new order', stocks).map(s => s.symbol), ['HAL']);
  assert.equal(matchNewsStocks('challenge for markets', stocks).length, 0);
  assert.equal(matchNewsStocks('Tata Consultancy Services results', stocks)[0].symbol, 'TCS');
});
test('new headlines precede older important stories; duplicates retain the newest version', () => {
  const now = Date.now();
  const row = (title, importance, hours, url = `https://example.com/${encodeURIComponent(title)}`) => ({ title, url, importance, publishedAt: new Date(now - hours * 3600000).toISOString() });
  const rows = rankNews([row('Old earnings', 3, 24), row('Fresh market update', 1, 0), row('Duplicate', 3, 2), row('Duplicate', 3, 1), row('Changed title', 2, 3, 'https://example.com/Duplicate?utm_source=feed')], now);
  assert.deepEqual(rows.map(r => r.title), ['Fresh market update', 'Duplicate', 'Old earnings']);
  assert.equal(rows[1].publishedAt, new Date(now - 3600000).toISOString());
  assert.equal(rankNews([row('Expired', 3, 169), row('Future', 3, -1)], now).length, 0);
});

const source = await readFile(new URL('../app/api/market/news/route.ts', import.meta.url), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
function fixture() {
  let now = Date.parse('2026-10-04T06:00:00Z'), behavior;
  const calls = [], exports = {};
  class Clock extends Date { static now() { return now; } }
  const fetcher = async (url, options) => {
    calls.push({ url, options });
    if (behavior) return behavior(url, options);
    return rss(url);
  };
  const rss = (url, title = new URL(url).host + new URL(url).pathname) => new Response(`<rss><channel><item><title>${title}</title><link>${url}/article</link><pubDate>${new Date(now).toUTCString()}</pubDate></item></channel></rss>`, { headers: { etag: 'v1', 'last-modified': new Date(now).toUTCString() } });
  new Function('require', 'exports', 'fetch', 'Date', code)(id => {
    if (id === '@/lib/market-news') return news;
    throw new Error(id);
  }, exports, fetcher, Clock);
  return { calls, rss, advance: ms => { now += ms; }, behave: fn => { behavior = fn; }, get: (force = false) => exports.GET(new Request(`https://example.test/api/market/news${force ? '?refresh=1' : ''}`)) };
}
test('news uses a short shared cache, bypasses it on manual refresh and disables HTTP caching', async () => {
  const f = fixture();
  const response = await f.get();
  assert.match(response.headers.get('cache-control'), /no-store/);
  assert.equal((await response.json()).items.length, 4);
  assert.equal(f.calls.length, 4);
  assert.ok(f.calls.every(c => c.options.cache === 'no-store' && c.options.signal instanceof AbortSignal));
  await f.get(); assert.equal(f.calls.length, 4);
  f.advance(6000); await f.get(true); assert.equal(f.calls.length, 8);
  assert.equal(f.calls[4].options.headers['If-None-Match'], 'v1');
  await f.get(true); assert.equal(f.calls.length, 8, 'A burst of manual refreshes shares the recent fetch');
  f.advance(16000); await f.get(); assert.equal(f.calls.length, 12);
});
test('simultaneous visitors share one upstream request per feed', async () => {
  const f = fixture();
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  f.behave(async url => { await gate; return f.rss(url); });
  const first = f.get(), second = f.get(true);
  assert.equal(f.calls.length, 4);
  release();
  assert.deepEqual(await (await first).json(), await (await second).json());
});
test('failed publishers retain saved headlines while healthy publishers update', async () => {
  const f = fixture();
  const initial = await (await f.get()).json();
  f.advance(16000);
  f.behave(url => {
    if (url.includes('moneycontrol')) throw new Error('403');
    return f.rss(url, 'Fresh ' + new URL(url).host + new URL(url).pathname);
  });
  const partial = await (await f.get()).json();
  assert.equal(partial.stale, false);
  assert.deepEqual(partial.unavailableSources, ['Moneycontrol']);
  assert.equal(partial.items.length, 4);
  assert.equal(partial.items.at(-1).source, 'Moneycontrol');
  assert.equal(partial.items.at(-1).publishedAt, initial.items.find(i => i.source === 'Moneycontrol').publishedAt);
  f.advance(16000); f.behave(() => { throw new Error('Offline'); });
  const stale = await (await f.get()).json();
  assert.equal(stale.stale, true); assert.equal(stale.updatedAt, partial.updatedAt);
  assert.equal(stale.unavailableSources.length, 4);
  f.advance(86400001); assert.equal((await f.get()).status, 503, 'Expired fallback is never passed off as current news');
});
test('not-modified responses preserve publication time and update the check time', async () => {
  const f = fixture();
  const initial = await (await f.get()).json();
  f.advance(16000); f.behave(() => new Response(null, { status: 304 }));
  const unchanged = await (await f.get()).json();
  assert.deepEqual(unchanged.items, initial.items);
  assert.notEqual(unchanged.checkedAt, initial.checkedAt);
  assert.equal(unchanged.stale, false);
});
test('a total outage returns a retryable, uncached error without fabricated headlines', async () => {
  const f = fixture(); f.behave(() => { throw new Error('Unavailable'); });
  const response = await f.get();
  assert.equal(response.status, 503); assert.match(response.headers.get('cache-control'), /no-store/);
  assert.ok((await response.json()).error);
  await f.get(); assert.equal(f.calls.length, 4, 'Failed requests are also briefly throttled');
});
