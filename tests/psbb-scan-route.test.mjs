import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import * as watchlist from '../lib/psbb-watchlist.ts';
import * as universes from '../lib/trading-universes.ts';
const source = await readFile(new URL('../app/api/market/psbb-scan/route.ts', import.meta.url), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
function route(failAt = -1) {
  const paths = [], exports = {};
  new Function('require', 'exports', code)((id) => {
    if (id === '@/lib/psbb-watchlist') return watchlist;
    if (id === '@/lib/trading-universes') return universes;
    if (id === '@/lib/upstox-server') return {
      upstoxFreshFetch: async (path) => { paths.push(path); if (paths.length === failAt) throw new Error('Unavailable segment'); return { status: 'success', data: { candles: [['2025-05-02T09:15:00+05:30',100,110,90,105,100]] } }; },
      upstoxErrorResponse: (error) => Response.json({ ok: false, error: { message: error.message } }, { status: 503 }),
    };
    throw new Error(id);
  }, exports);
  const get = (extra = '') => exports.GET(new Request(`https://example.test/api/market/psbb-scan?instrumentKey=NSE_EQ%7CINE002A01018&timeframe=1m&month=2025-05${extra}`));
  return { get, paths, raw: exports.GET };
}
test('route chunks full history, caches only matching settings and fails partial upstream responses', async () => {
  const r = route();
  assert.equal((await r.get()).status, 200);
  const count = r.paths.length;
  assert.ok(count >= 2);
  assert.equal((await r.get()).status, 200); assert.equal(r.paths.length, count);
  await r.get('&length=10'); assert.equal(r.paths.length, count * 2);
  const broken = route(2), response = await broken.get();
  assert.equal(response.status, 503);
  assert.equal((await response.json()).ok, false);
});
test('only the three requested indices are accepted for scans', async () => {
  const r = route();
  for (const key of ['NSE_INDEX|Nifty 50', 'NSE_INDEX|Nifty Bank', 'BSE_INDEX|SENSEX']) {
    assert.equal((await r.raw(new Request(`https://example.test/api/market/psbb-scan?instrumentKey=${encodeURIComponent(key)}&timeframe=4H&month=2025-05`))).status, 200);
  }
  assert.equal((await r.raw(new Request('https://example.test/api/market/psbb-scan?instrumentKey=NSE_INDEX%7CNifty%20IT&timeframe=4H&month=2025-05'))).status, 400);
});
test('route rejects daily scans, unsupported symbols, invalid months and bad settings before fetching', async () => {
  const r = route();
  for (const query of ['instrumentKey=DELTA%7CBTCUSD&timeframe=1m&month=2025-05', 'instrumentKey=NSE_EQ%7CINE002A01018&timeframe=1D&month=2025-05', 'instrumentKey=NSE_EQ%7CINE002A01018&timeframe=1m&month=2025-13']) {
    assert.equal((await r.raw(new Request(`https://example.test/api/market/psbb-scan?${query}`))).status, 400);
  }
  assert.equal((await r.get('&left=0')).status, 400);
  assert.equal((await r.get('&length=NaN')).status, 400);
  assert.deepEqual(r.paths, []);
});
