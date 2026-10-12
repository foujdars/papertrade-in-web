import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { startVisiblePolling } from '../lib/visible-polling.ts';

const settle = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
function globalValue(t, name, value) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, name);
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  t.after(() => previous ? Object.defineProperty(globalThis, name, previous) : delete globalThis[name]);
}

function polling(t) {
  const document = new EventTarget(), window = new EventTarget(), timers = new Map(), deadlines = [];
  document.visibilityState = 'visible';
  window.setInterval = (fn, ms) => { timers.set(fn, ms); return fn; };
  window.clearInterval = fn => timers.delete(fn);
  globalValue(t, 'document', document); globalValue(t, 'window', window);
  t.mock.method(AbortSignal, 'timeout', ms => { const controller = new AbortController(); deadlines.push({ controller, ms }); return controller.signal; });
  return { document, window, timers, deadlines };
}

test('visible polling coalesces timer/focus requests, pauses hidden work and refreshes on return', async t => {
  const h = polling(t), requests = [];
  const stop = startVisiblePolling(signal => { const request = deferred(); requests.push({ ...request, signal }); return request.promise; }, 5000);
  assert.equal(requests.length, 1);
  h.timers.forEach((_, fn) => fn()); h.window.dispatchEvent(new Event('focus'));
  assert.equal(requests.length, 1, 'No overlapping requests');
  requests[0].resolve(); await settle();
  h.document.visibilityState = 'hidden'; h.timers.forEach((_, fn) => fn());
  assert.equal(requests.length, 1);
  h.document.visibilityState = 'visible'; h.document.dispatchEvent(new Event('visibilitychange'));
  assert.equal(requests.length, 2, 'Returning from another app refreshes immediately');
  requests[1].resolve(); await settle();
  h.window.dispatchEvent(new Event('online'));
  assert.equal(requests.length, 3);
  stop(); assert.equal(requests[2].signal.aborted, true); assert.equal(h.timers.size, 0);
  h.window.dispatchEvent(new Event('focus')); h.window.dispatchEvent(new Event('online'));
  assert.equal(requests.length, 3, 'Unmount removes listeners');
});

test('a stalled refresh times out and does not block the next attempt', async t => {
  const h = polling(t); let calls = 0, errors = 0;
  const stop = startVisiblePolling(signal => new Promise((_, reject) => { calls++; signal.addEventListener('abort', () => reject(signal.reason), { once: true }); }), 10_000, () => errors++);
  assert.equal(h.deadlines[0].ms, 12_000);
  h.deadlines[0].controller.abort(new DOMException('Timeout', 'TimeoutError')); await settle();
  assert.equal(errors, 1);
  h.window.dispatchEvent(new Event('online')); assert.equal(calls, 2);
  stop(); await settle(); assert.equal(errors, 1, 'Intentional unmount is not a feed error');
});

let moduleId = 0;
async function moduleWithStubs(entry, stubSources) {
  const built = await build({ entryPoints: [entry], bundle: true, write: false, platform: 'node', format: 'esm', plugins: [{ name: 'sources', setup(b) {
    b.onResolve({ filter: /.*/ }, args => args.path in stubSources ? { path: args.path, namespace: 'test-source' } : undefined);
    b.onLoad({ filter: /.*/, namespace: 'test-source' }, args => ({ contents: stubSources[args.path], loader: 'js' }));
  } }] });
  return import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text + `\n// instance ${++moduleId}`).toString('base64')}`);
}

async function route(t, breadth = async () => ({ advance: 1000, decline: 800 })) {
  const calls = { breadth: 0, broker: 0, fetches: [] };
  const now = Date.parse('2026-10-12T05:00:00Z');
  t.mock.method(Date, 'now', () => now);
  globalValue(t, '__homeSources', { breadth: () => { calls.breadth++; return breadth(); }, broker: () => { calls.broker++; return new Promise(() => {}); } });
  t.mock.method(globalThis, 'fetch', url => { calls.fetches.push(url); return new Promise(() => {}); });
  const api = await moduleWithStubs('app/api/market/india-pulse/route.ts', {
    '@/lib/india-ad-tape': 'export const liveNseBreadth=()=>globalThis.__homeSources.breadth(); export const recordNseAdTape=async (b,db,now)=>b?[{...b,t:now}]:[];',
    '@/lib/upstox-server': 'export const upstoxFetch=()=>globalThis.__homeSources.broker();',
  });
  return { api, calls };
}
const request = part => new Request(`https://papertrade.test/api/market/india-pulse?part=${part}`);

test('breadth responds while daily flows, VIX and the option chain are stalled', async t => {
  const h = await route(t);
  // Start slow independent panels first. They must not occupy breadth's pending slot.
  void h.api.GET(request('flows')); void h.api.GET(request('gauges'));
  const response = await h.api.GET(request('breadth'));
  const body = await response.json();
  assert.deepEqual(body.breadth, { advance: 1000, decline: 800 });
  assert.equal(body.tape.length, 1);
  assert.equal(body.sessionLive, true);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(h.calls.breadth, 1); assert.equal(h.calls.broker, 1);
});

test('concurrent breadth requests share one source request and never fetch other panels', async t => {
  const source = deferred(), h = await route(t, () => source.promise);
  const a = h.api.GET(request('breadth')), b = h.api.GET(request('breadth'));
  assert.equal(h.calls.breadth, 1); assert.equal(h.calls.broker, 0); assert.deepEqual(h.calls.fetches, []);
  source.resolve({ advance: 1500, decline: 500 });
  const bodies = await Promise.all([a,b].map(async r => (await r).json()));
  assert.deepEqual(bodies[0], bodies[1]);
});

test('a failed breadth refresh cannot turn cached counts into a new live sample', async t => {
  let now = Date.parse('2026-10-12T05:00:00Z'), requests = 0;
  t.mock.method(Date, 'now', () => now);
  t.mock.method(globalThis, 'fetch', async () => {
    if (requests++) throw new Error('offline');
    return new Response('<span class="baradv">1,234</span><span class="bardecl">567</span>');
  });
  const source = await moduleWithStubs('lib/india-ad-tape.ts', { './push-admin.ts': 'export const firebaseProjectId=()=>null; export const pushServices=async()=>({});' });
  const first = await source.liveNseBreadth();
  assert.deepEqual(first, { advance: 1234, decline: 567 });
  const tape = await source.recordNseAdTape(first, undefined, now);
  now += 60_000;
  const failed = await source.liveNseBreadth(); assert.equal(failed, null);
  assert.deepEqual(await source.recordNseAdTape(failed, undefined, now), tape, 'Failure retains history without extending its timestamp');
});

test('slow tape storage releases the current breadth within its two-second budget', async t => {
  const now = Date.parse('2026-10-12T05:00:00Z');
  t.mock.method(Date, 'now', () => now);
  const source = await moduleWithStubs('lib/india-ad-tape.ts', { './push-admin.ts': 'export const firebaseProjectId=()=>null; export const pushServices=async()=>({});' });
  const timers = new Map();
  t.mock.method(globalThis, 'setTimeout', (fn, ms) => { assert.ok(ms <= 2000); timers.set(fn, ms); return fn; });
  t.mock.method(globalThis, 'clearTimeout', fn => timers.delete(fn));
  let writes = 0;
  const db = { doc: () => ({ get: () => new Promise(() => {}), set: async () => { writes++; } }) };
  const pending = source.recordNseAdTape({ advance: 900, decline: 700 }, db, now);
  await settle(); timers.forEach((_, fn) => fn());
  const tape = await pending;
  assert.equal(tape.at(-1).advance, 900); assert.equal(timers.size, 0);
  assert.equal(writes, 0, 'A timed-out history read cannot overwrite the saved session');
});

async function dashboardQuotes(t, homeOpen) {
  const { readFile } = await import('node:fs/promises');
  const ts = (await import('typescript')).default;
  const text = await readFile('components/TradingDashboard.tsx','utf8');
  const source = ts.createSourceFile('TradingDashboard.tsx',text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  let effect;
  const visit = node => {
    if (ts.isCallExpression(node) && node.expression.getText(source)==='useEffect' && node.arguments[0]?.getText(source).includes('async function loadWatchlistQuotes')) effect=node.arguments[0].getText(source);
    ts.forEachChild(node,visit);
  };
  visit(source); assert.ok(effect,'Run the real dashboard quote effect');
  const h = polling(t), requests = [], state = {quotes:{},updated:{},toasts:[]};
  t.mock.method(globalThis,'fetch',(url,options)=>new Promise((resolve,reject)=> {
    requests.push({url,options,resolve:(body,status=200)=>resolve(Response.json(body,{status}))});
    options.signal.addEventListener('abort',()=>reject(options.signal.reason),{once:true});
  }));
  const js=ts.transpileModule(`const effect=${effect}; return effect();`,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
  const stop=new Function('quoteKeys','homeOpen','startVisiblePolling','setMarketQuotes','setMarketQuoteUpdatedAt','setToast',js)(
    'NSE_INDEX|Nifty 50,NSE_INDEX|Nifty Bank,BSE_INDEX|SENSEX',homeOpen,startVisiblePolling,
    update=>state.quotes=update(state.quotes),update=>state.updated=update(state.updated),message=>state.toasts.push(message));
  return {...h,requests,state,stop};
}

test('Home indices refresh every five seconds and broker rate limits are respected', async t=> {
  let now=Date.parse('2026-10-12T05:00:00Z');t.mock.method(Date,'now',()=>now);
  const h=await dashboardQuotes(t,true);
  try {
    assert.deepEqual([...h.timers.values()],[5000]);
    assert.equal(h.requests[0].options.method,'POST');
    const quote={lastPrice:25000,lastTradeAt:new Date(now).toISOString()};
    h.requests[0].resolve({ok:true,quotes:{'NSE_INDEX|Nifty 50':quote}});await settle();
    assert.equal(h.state.quotes['NSE_INDEX|Nifty 50'].lastPrice,25000);
    now+=5000;h.timers.forEach((_,fn)=>fn());assert.equal(h.requests.length,2);
    h.requests[1].resolve({ok:false,error:{code:'RATE_LIMITED',retryAfterSeconds:60}},429);await settle();
    now+=5000;h.window.dispatchEvent(new Event('online'));await settle();
    assert.equal(h.requests.length,2,'Resume must not bypass the broker retry deadline');
    now+=60000;h.timers.forEach((_,fn)=>fn());assert.equal(h.requests.length,3);
    h.requests[2].resolve({ok:true,quotes:{'NSE_INDEX|Nifty 50':{...quote,lastPrice:25100,lastTradeAt:new Date(now).toISOString()}}});await settle();
    assert.equal(h.state.quotes['NSE_INDEX|Nifty 50'].lastPrice,25100);
  } finally {h.stop();}
});

test('a stale REST snapshot cannot roll indices back and aborted requests cannot update the screen',async t=> {
  const h=await dashboardQuotes(t,false);
  try {
    assert.deepEqual([...h.timers.values()],[20_000]);
    h.state.quotes['NSE_INDEX|Nifty 50']={lastPrice:25100,lastTradeAt:'2026-10-12T05:01:00Z'};
    h.requests[0].resolve({ok:true,quotes:{'NSE_INDEX|Nifty 50':{lastPrice:25000,lastTradeAt:'2026-10-12T05:00:00Z'}}});await settle();
    assert.equal(h.state.quotes['NSE_INDEX|Nifty 50'].lastPrice,25100);
    h.window.dispatchEvent(new Event('focus'));assert.equal(h.requests.length,2);
    h.deadlines.at(-1).controller.abort(new DOMException('Timeout','TimeoutError'));await settle();
    h.window.dispatchEvent(new Event('online'));assert.equal(h.requests.length,3,'Quote polling recovers after a stuck request');
    h.stop();h.requests[2].resolve({ok:true,quotes:{'NSE_INDEX|Nifty 50':{lastPrice:1,lastTradeAt:'2026-10-12T05:02:00Z'}}});await settle();
    assert.equal(h.state.quotes['NSE_INDEX|Nifty 50'].lastPrice,25100);
  } finally {h.stop();}
});


test('breadth streams complete counts without waiting for the rest of the homepage', async () => {
  const source = await moduleWithStubs('lib/india-ad-tape.ts', { './push-admin.ts': 'export const firebaseProjectId=()=>null; export const pushServices=async()=>({});' });
  let stream, cancelled = false;
  const body = new ReadableStream({ start(c) { stream = c; }, cancel() { cancelled = true; } });
  const result = source.readBreadth(new Response(body));
  const enc = new TextEncoder();
  stream.enqueue(enc.encode('<span class="baradv">1,234</span><span class="bardecl">5'));
  let resolved = false; result.then(() => { resolved = true; });
  await settle(); assert.equal(resolved, false, 'A chunk ending inside a count must not truncate it');
  stream.enqueue(enc.encode('67</span>'));
  assert.deepEqual(await result, { advance: 1234, decline: 567 });
  assert.equal(cancelled, true, 'The remaining page never has to download');
});
