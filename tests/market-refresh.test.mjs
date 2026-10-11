import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

// Run actual component effects with controlled HTTP promises; no broker or account writes.
let run = 0;
async function harness(t, entry, exported, initial = {}) {
  const effects = [], updates = [], events = new Map(), timers = [], requests = [], deadlines = [];
  const state = { effects, updates, initial, stateIndex: 0 };
  const key = '__marketRefreshTest';
  const restorers = [];
  let cleanup = [];
  t.after(async () => { cleanup.forEach(fn => fn?.()); await new Promise(resolve => setImmediate(resolve)); restorers.reverse().forEach(fn => fn()); });
  const install = (name, value) => {
    const previous = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
    restorers.push(() => { if (previous) Object.defineProperty(globalThis, name, previous); else delete globalThis[name]; });
  };
  install(key, state);
  const listen = (name, fn) => { const handlers = events.get(name) ?? new Set(); handlers.add(fn); events.set(name, handlers); };
  const unlisten = (name, fn) => events.get(name)?.delete(fn);
  install('document', { hidden: false, visibilityState: 'visible', addEventListener: listen, removeEventListener: unlisten });
  install('window', { setInterval: fn => { timers.push(fn); return timers.length; }, clearInterval() {}, addEventListener: listen, removeEventListener: unlisten });
  t.mock.method(AbortSignal, 'timeout', ms => { const controller = new AbortController(); deadlines.push({ controller, ms }); return controller.signal; });
  t.mock.method(globalThis, 'fetch', (url, options) => new Promise((resolve, reject) => {
    const request = { url, options, resolve: data => resolve(Response.json(data)) };
    requests.push(request);
    options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true });
  }));
  const output = await build({ entryPoints: [entry], bundle: true, write: false, platform: 'node', format: 'esm', jsx: 'automatic', plugins: [{ name: 'effect-harness', setup(b) {
    b.onResolve({ filter: /^react(?:\/jsx-runtime)?$|^lucide-react$|^\.\/(ModernSelect|OpenInterestChart)$/ }, args => ({ path: args.path, namespace: 'stub' }));
    b.onLoad({ filter: /.*/, namespace: 'stub' }, args => ({ contents: args.path === 'react'
      ? `const s=globalThis.${key}; export const useState = value => {const i=s.stateIndex++; return [i in s.initial?s.initial[i]:typeof value==='function'?value():value, next=>s.updates.push(next)];}; export const useEffect=fn=>s.effects.push(fn); export const useMemo=fn=>fn();`
      : args.path === 'react/jsx-runtime' ? 'export const jsx=(type,props)=>({type,props}); export const jsxs=jsx;'
      : 'export const ModernSelect=()=>null; export const OpenInterestChart=()=>null; export const ChartNoAxesCombined=()=>null;', loader: 'js' }));
  } }] });
  const component = await import(`data:text/javascript;base64,${Buffer.from(output.outputFiles[0].text + '\n//# sourceURL=' + entry + '?test=' + ++run).toString('base64')}`);
  if (exported === 'useNseSession') component[exported]();
  else component[exported]({ onOpenStock() {} });
  cleanup = effects.map(effect => effect());
  return { requests, updates, deadlines, timers, async settle() { await new Promise(resolve => setImmediate(resolve)); }, fire(name) { events.get(name)?.forEach(fn => fn()); }, events };
}

test('exchange session polling times out stuck requests and retries when connectivity returns', async t => {
  const h = await harness(t, 'components/useNseSession.ts', 'useNseSession');
  assert.equal(h.requests.length, 1);
  assert.equal(h.deadlines.length, 1, 'The session request must have a finite deadline');
  assert.ok(h.deadlines[0].ms <= 15000);
  h.deadlines[0].controller.abort(new DOMException('Timeout', 'TimeoutError'));
  await h.settle();
  h.fire('online');
  assert.equal(h.requests.length, 2, 'A stalled fetch must not permanently hold the pending flag');
  h.requests[1].resolve({ session: { status: 'OPEN', sessions: [] } });
  await h.settle();
  assert.equal(h.updates.at(-1).status, 'OPEN');
});

test('Home derivatives immediately refresh on resume and bound every market request', async t => {
  const h = await harness(t, 'components/HomeDerivatives.tsx', 'HomeDerivatives');
  assert.equal(h.deadlines.length, h.requests.length, 'Catalogue, GIFT, VIX and expiry fetches all need timeouts');
  assert.ok(h.deadlines.every(({ ms }) => ms > 0 && ms <= 15000));
  for (const request of h.requests) request.resolve({ ok: false });
  await h.settle();
  const before = h.requests.length;
  document.visibilityState = 'hidden'; h.fire('visibilitychange');
  assert.equal(h.requests.length, before, 'Do not fetch while hidden');
  document.visibilityState = 'visible'; h.fire('visibilitychange');
  assert.equal(h.requests.length, before + 3, 'Refresh GIFT, VIX and options immediately');
  for (const request of h.requests.slice(before)) request.resolve({ ok: false });
  await h.settle();
  h.fire('online');
  assert.equal(h.requests.length, before + 6, 'Recover immediately when the network returns');
});

test('stalled option-chain and quote requests recover on the next refresh', async t => {
  const h = await harness(t, 'components/HomeDerivatives.tsx', 'HomeDerivatives', { 2: '2099-10-27' });
  assert.ok(h.requests.some(request => request.url.includes('expiry=2099-10-27')));
  assert.equal(h.deadlines.length, 4);
  h.deadlines.forEach(({ controller }) => controller.abort(new DOMException('Timeout', 'TimeoutError')));
  await h.settle();
  assert.ok(h.updates.includes('error'));
  h.timers.forEach(fn => fn());
  assert.equal(h.requests.length, 7, 'Timers retry quotes and option rows after timeout');
  for (const request of h.requests.slice(4)) request.resolve({ ok: false });
  await h.settle();
});

test('an invalid VIX timestamp does not crash refresh or block later updates', async t => {
  const h = await harness(t, 'components/HomeDerivatives.tsx', 'HomeDerivatives');
  for (const request of h.requests) request.resolve(request.url.includes('india-pulse')
    ? { ok: true, vix: { price: 15, change: 1, changePercent: 1 }, vixCheckedAt: 'invalid-date' }
    : { ok: false });
  await h.settle();
  assert.ok(h.updates.some(value => value?.price === 15));
  assert.ok(h.updates.includes(''));
  h.fire('online');
  assert.equal(h.requests.length, 7);
  for (const request of h.requests.slice(4)) request.resolve({ ok: false });
  await h.settle();
});
