import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

let instance = 0;
async function route(t, data) {
  const state = { calls: 0, data };
  globalThis.__quoteRoute = state;
  t.after(() => { delete globalThis.__quoteRoute; });
  const compiled = await build({ entryPoints: ['app/api/upstox/quotes/route.ts'], bundle: true, write: false, platform: 'node', format: 'esm',
    plugins: [{ name: 'quote-source', setup(b) {
      b.onResolve({ filter: /^@\/lib\/upstox-server$/ }, () => ({ path: 'broker', namespace: 'stub' }));
      b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ contents: `export const upstoxFetch=async()=>{globalThis.__quoteRoute.calls++;return {data:globalThis.__quoteRoute.data}};export const upstoxErrorResponse=()=>Response.json({ok:false},{status:502});` }));
    } }] });
  const api = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text + `\n// ${++instance}`).toString('base64')}`);
  return { api, state };
}
const key = 'NSE_EQ|INE002A01018';
const raw = overrides => ({ instrument_token: key, symbol: 'RELIANCE', last_price: 109, net_change: 9,
  timestamp: '2026-10-16T05:00:00Z', last_trade_time: '1792126800000', ...overrides });
const request = () => new Request(`https://papertrade.test/api/upstox/quotes?keys=${encodeURIComponent(key)}`);

test('quotes API returns consistent verified change, aliases and no-store metadata', async t => {
  const { api } = await route(t, { requested: raw({}), other: raw({ instrument_token: 'NSE_EQ|INE009A01021', symbol: 'INFY' }) });
  const response = await api.GET(request());
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const body = await response.json();
  assert.equal(body.quotes[key].changePercent, 9);
  assert.equal(body.quotes[key].netChange, 9);
  assert.deepEqual(body.quotes.RELIANCE, body.quotes[key]);
  assert.equal(body.quotes.INFY, undefined, 'Only requested exact instruments may populate quote aliases');
});

test('bad dates and missing comparison values cannot turn into fresh zero-change quotes', async t => {
  const { api } = await route(t, { requested: raw({ net_change: null, timestamp: 'bad-date', last_trade_time: '1e99' }) });
  const response = await api.GET(request());
  assert.equal(response.status, 200, 'Malformed timestamps must not fail the entire watchlist response');
  const quote = (await response.json()).quotes[key];
  assert.equal(quote.changeAvailable, false);
  assert.equal(quote.previousClose, 0);
  assert.equal(quote.updatedAt, '');
  assert.equal(quote.lastTradeAt, '');
});

test('POST keeps the same normalization and rejects invalid instrument lists before broker calls', async t => {
  const { api, state } = await route(t, { requested: raw({ net_change: 999, ohlc: { close: 100 } }) });
  const post = body => new Request('https://papertrade.test/api/upstox/quotes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  assert.equal((await api.POST(post({ keys: ['not-an-instrument'] }))).status, 400);
  assert.equal(state.calls, 0);
  const response = await api.POST(post({ keys: [key] }));
  const quote = (await response.json()).quotes[key];
  assert.equal(quote.changePercent, 9);
  assert.equal(quote.netChange, 9);
  assert.equal(state.calls, 1);
});
