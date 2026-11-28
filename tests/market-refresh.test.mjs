import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

// Run actual component effects with controlled HTTP promises; no broker or account writes.
let run = 0;
async function harness(t, entry, exported, initial = {}, hookArgs = []) {
  const effects = [], updates = [], events = new Map(), timers = [], requests = [], deadlines = [];
  const state = { effects, updates, values: { ...initial }, stateIndex: 0 };
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
      ? `const s=globalThis.${key};
         export const useState = initial => {
           const i = s.stateIndex++;
           if (!(i in s.values)) s.values[i] = typeof initial === 'function' ? initial() : initial;
           return [s.values[i], next => {
             s.values[i] = typeof next === 'function' ? next(s.values[i]) : next;
             s.updates.push(s.values[i]);
           }];
         };
         export const useEffect=fn=>s.effects.push(fn); export const useMemo=fn=>fn(); export const useSyncExternalStore=(_subscribe,_client,server)=>server();`
      : args.path === 'react/jsx-runtime' ? 'export const jsx=(type,props)=>({type,props}); export const jsxs=jsx; export const Fragment=Symbol.for("react.fragment");'
      : 'export const ModernSelect=()=>null; export const OpenInterestChart=()=>null; export const ChartNoAxesCombined=()=>null;', loader: 'js' }));
  } }] });
  const component = await import(`data:text/javascript;base64,${Buffer.from(output.outputFiles[0].text + '\n//# sourceURL=' + entry + '?test=' + ++run).toString('base64')}`);
  const render = () => {
    state.stateIndex = 0;
    return exported.startsWith('use') ? component[exported](...hookArgs) : component[exported]({ onOpenStock() {} });
  };
  render();
  cleanup = effects.map(effect => effect());
  return { render, requests, updates, deadlines, timers, async settle() { await new Promise(resolve => setImmediate(resolve)); }, fire(name) { events.get(name)?.forEach(fn => fn()); }, events };
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
  assert.equal(h.render().status, 'OPEN');
});

test('currency venues recover independently and keep desk sessions tied to the requested exchange', async t => {
  const h = await harness(t, 'components/useNseSession.ts', 'useExchangeSessions', {}, ['CDS,BCD']);
  assert.deepEqual(h.requests.map(r => r.url), ['/api/market/session?exchange=CDS','/api/market/session?exchange=BCD']);
  h.deadlines[0].controller.abort();
  h.requests[1].resolve({session:{status:'NORMAL_CLOSE',sessions:[]}});
  await h.settle();
  assert.deepEqual(h.render(), {CDS:null, BCD:{status:'NORMAL_CLOSE',sessions:[]}});
  h.fire('online');
  h.requests[2].resolve({session:{status:'NORMAL_OPEN',sessions:[{start:1,end:2}]}});
  h.requests[3].resolve({session:{status:'NORMAL_CLOSE',sessions:[]}});
  await h.settle();
  assert.equal(h.render().CDS.status,'NORMAL_OPEN');
  assert.equal(h.render().BCD.status,'NORMAL_CLOSE');
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
  h.fire('online');
  assert.equal(h.requests.length, 7);
  for (const request of h.requests.slice(4)) request.resolve({ ok: false });
  await h.settle();
});
