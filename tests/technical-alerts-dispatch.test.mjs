import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

// Exercise the real handlers/evaluator with an isolated transactional document store.
// No production account, network request or notification is used.
const state = { db: null, sent: [], failFeed: false, failSend: false, feedCalls: [], validUser: 'alice' };
globalThis.__technicalTest = state;
const clone = value => value === undefined ? undefined : structuredClone(value);
function database(initial = {}) {
  const records = new Map(Object.entries(initial));
  let serial = Promise.resolve();
  const doc = path => ({ path, id: path.split('/').at(-1),
    get: async () => ({ id: path.split('/').at(-1), ref: doc(path), exists: records.has(path), data: () => clone(records.get(path)) }),
    set: async data => { records.set(path, clone(data)); },
    update: async data => { assert.ok(records.has(path)); records.set(path, { ...records.get(path), ...clone(data) }); },
  });
  const collection = path => {
    const filters = []; let count = Infinity;
    const query = { where: (key, op, value) => { assert.equal(op, '=='); filters.push([key, value]); return query; }, limit: n => { count = n; return query; }, get: async () => {
      const paths = [...records.keys()].filter(p => p.startsWith(path + '/') && !p.slice(path.length + 1).includes('/') && filters.every(([k, v]) => records.get(p)[k] === v)).slice(0, count);
      return { size: paths.length, docs: await Promise.all(paths.map(p => doc(p).get())) };
    } }; return query;
  };
  const runTransaction = action => {
    const next = serial.then(async () => {
      const writes = [];
      const result = await action({ get: ref => ref.get(), set: (ref, data) => writes.push(() => records.set(ref.path, clone(data))), create: (ref, data) => {
        assert.equal(records.has(ref.path), false, 'outbox event must not be recreated'); writes.push(() => records.set(ref.path, clone(data)));
      } });
      for (const write of writes) write(); return result;
    }); serial = next.catch(() => {}); return next;
  };
  return { doc, collection, runTransaction, records };
}
const stubs = {
  'server-only': '',
  '@supabase/supabase-js': `export const createClient = () => ({ auth: { getUser: async token => token === 'valid' ? { data: { user: { id: globalThis.__technicalTest.validUser } } } : { data: {}, error: 'invalid' } } });`,
  'push-admin': `export const pushConfigured = () => true; export const pushServices = async () => ({db: globalThis.__technicalTest.db}); export const sendPush = async (notice, target) => { const s = globalThis.__technicalTest; s.sent.push({notice, target}); if(s.failSend) throw new Error('transport outcome unknown'); };`,
  'candles-route': `export async function GET(request) { const s = globalThis.__technicalTest; s.feedCalls.push(request.url); return Response.json(s.failFeed ? {ok:false} : {ok:true, candles:s.candles}, {status:s.failFeed?503:200}); }`,
  'session-route': `export async function GET() { return Response.json({session: globalThis.__technicalTest.session}); }`,
};
const plugin = { name: 'isolated-services', setup(b) {
  b.onResolve({ filter: /server-only|@supabase\/supabase-js|push-admin|api\/upstox\/candles\/route|api\/market\/session\/route/ }, args => ({ path: args.path.includes('push-admin') ? 'push-admin' : args.path.includes('/candles/') ? 'candles-route' : args.path.includes('/session/') ? 'session-route' : args.path, namespace: 'stub' }));
  b.onLoad({ filter: /.*/, namespace: 'stub' }, args => ({ contents: stubs[args.path], loader: 'js' }));
} };
async function bundle(entry) {
  const out = await build({ entryPoints: [entry], bundle: true, write: false, platform: 'node', format: 'esm', plugins: [plugin] });
  return import(`data:text/javascript;base64,${Buffer.from(out.outputFiles[0].text).toString('base64')}`);
}
const dispatcher = await bundle('app/api/technical-alerts/dispatch/route.ts');
const manager = await bundle('app/api/technical-alerts/route.ts');
const now = Date.parse('2026-09-18T13:00:10+05:30'), start = Date.parse('2026-09-18T09:15:00+05:30');
const instrument = { symbol: 'TEST', name: 'Test company', instrumentKey: 'NSE_EQ|INE002A01018', exchange: 'NSE', assetType: 'EQUITY', price: 0, change: 0, categories: [] };
const config = { family: 'volume', timeframe: '5m', condition: 'spike', period: 20, slow: 50, signal: 9, threshold: 70, multiplier: 2, repeat: 'repeat', cooldown: 0, days: 7 };
function reset(t, overrides = {}) {
  t.mock.method(Date, 'now', () => now);
  process.env.TECHNICAL_ALERTS_ENABLED = 'true'; process.env.NOTIFICATION_CRON_SECRET = 'a'.repeat(32);
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.invalid'; process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test';
  state.sent = []; state.feedCalls = []; state.failFeed = false; state.failSend = false; state.validUser = 'alice';
  state.session = { status: 'OPEN', sessions: [{ start, end: Date.parse('2026-09-18T15:30:00+05:30') }] };
  state.candles = Array.from({ length: 45 }, (_, i) => ({ time: start / 1000 + 300 * i, open: 100, high: 111, low: 99, close: i === 44 ? 110 : 100, volume: i === 44 ? 3000 : 1000 }));
  const rule = { ...config, delivery: 'server', instrument, id: 'rule-1', revision: 'revision-1', status: 'active', createdAt: now - 600000, armedAt: now - 600000, expiresAt: now + 86400000, ...overrides };
  state.db = database({
    'technicalAccounts/alice': { active: true, store: { version: 1, rules: [rule], events: [] } },
    'technicalSystem/health': { ok: true, lastRun: now },
    'notificationDevices/device-1': { userId: 'alice', token: 'test-token', lastActive: now, preferences: { trades: true, hideAmounts: false } },
  });
  return rule;
}
const dispatch = secret => dispatcher.GET(new Request('https://test.invalid/api/technical-alerts/dispatch', { headers: { authorization: `Bearer ${secret ?? 'a'.repeat(32)}` } }));
const read = () => state.db.records.get('technicalAccounts/alice').store;
const outbox = () => [...state.db.records.entries()].filter(([key]) => key.startsWith('technicalOutbox/')).map(([, value]) => value);
const manage = (body, token = 'valid') => manager.POST(new Request('https://test.invalid/api/technical-alerts', { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(body) }));

test('closed-app candle creates one durable event and one targeted push, including simultaneous scheduler runs', async t => {
  reset(t);
  const responses = await Promise.all([dispatch(), dispatch()]);
  assert.ok(responses.every(r => r.status === 200));
  assert.equal(read().events.length, 1); assert.equal(state.sent.length, 1); assert.equal(outbox()[0].status, 'sent');
  assert.equal(state.sent[0].target.token, 'test-token'); assert.equal(state.sent[0].notice.url, '/?symbol=TEST&timeframe=5m');
  assert.ok(state.feedCalls.every(url => url.includes('strict=1')));
  await dispatch(); assert.equal(read().events.length, 1); assert.equal(state.sent.length, 1);
});
test('bad scheduler secret, disabled service and occupied lease never evaluate or send', async t => {
  reset(t); assert.equal((await dispatch('wrong')).status, 401);
  process.env.TECHNICAL_ALERTS_ENABLED = 'false'; assert.equal((await dispatch()).status, 503);
  process.env.TECHNICAL_ALERTS_ENABLED = 'true'; await state.db.doc('technicalSystem/lease').set({ until: now + 10000, owner: 'other' });
  assert.equal((await (await dispatch()).json()).busy, true); assert.equal(state.feedCalls.length, 0); assert.equal(state.sent.length, 0);
});
test('feed errors, stale bars, missing volume and unavailable exchange session cannot trigger', async t => {
  reset(t); state.failFeed = true; assert.equal((await dispatch()).status, 503); assert.equal(read().events.length, 0);
  state.failFeed = false; state.candles.pop(); await dispatch(); assert.equal(read().events.length, 0);
  reset(t); state.candles.at(-1).volume = 0; await dispatch(); assert.equal(read().events.length, 0);
  reset(t); state.candles[20].high = 90; assert.equal((await dispatch()).status, 503); assert.equal(read().events.length, 0);
  state.session = { status: 'UNAVAILABLE' }; assert.equal((await dispatch()).status, 503); assert.equal(state.sent.length, 0);
});
test('paused, expired and out-of-session rules do not send', async t => {
  reset(t, { status: 'paused' }); await dispatch(); assert.equal(state.sent.length, 0);
  reset(t, { expiresAt: now - 1 }); await dispatch(); assert.equal(read().events[0].kind, 'expired'); assert.equal(state.sent.length, 0);
  reset(t); state.session.sessions = []; await dispatch(); assert.equal(state.feedCalls.length, 0); assert.equal(state.sent.length, 0);
});
test('device consent and privacy are respected; failures are not blindly resent', async t => {
  reset(t); state.db.records.get('notificationDevices/device-1').preferences.trades = false;
  await dispatch(); assert.equal(read().events.length, 1); assert.equal(state.sent.length, 0); assert.equal(outbox()[0].status, 'no-device');
  reset(t); state.db.records.get('notificationDevices/device-1').preferences.hideAmounts = true;
  await dispatch(); assert.equal(state.sent[0].notice.body.includes('₹'), false);
  reset(t); state.failSend = true; assert.equal((await dispatch()).status, 503); assert.equal(outbox()[0].status, 'needs-review');
  state.failSend = false; await dispatch(); assert.equal(state.sent.length, 1);
});
test('management requires verified identity, healthy scheduler and notification opt-in', async t => {
  reset(t); const command = { action: 'save', config, instrument };
  assert.equal((await manage(command, 'invalid')).status, 401);
  state.db.records.get('technicalSystem/health').lastRun = now - 180001;
  assert.equal((await manage(command)).status, 503);
  state.db.records.get('technicalSystem/health').lastRun = now;
  state.db.records.get('notificationDevices/device-1').preferences.trades = false;
  assert.equal((await manage(command)).status, 400);
  state.db.records.get('notificationDevices/device-1').preferences.trades = true;
  const response = await manage(command); assert.equal(response.status, 200); assert.equal((await response.json()).store.rules.length, 2);
  assert.equal((await manage(command)).status, 429);
});
test('management isolates accounts and enforces revisions, malformed requests and deployment availability', async t => {
  reset(t); state.validUser = 'bob';
  const result = await manager.GET(new Request('https://test.invalid/api/technical-alerts', { headers: { authorization: 'Bearer valid' } }));
  assert.equal((await result.json()).store.rules.length, 0);
  assert.equal((await manage({ action: 'delete', id: 'rule-1', revision: 'revision-1' })).status, 409);
  state.validUser = 'alice'; assert.equal((await manage({ action: 'delete', id: 'rule-1', revision: 'stale' })).status, 409);
  assert.equal((await manage(null)).status, 400);
  assert.equal((await manage({ action: 'save', data: 'x'.repeat(9000) })).status, 413);
  process.env.TECHNICAL_ALERTS_ENABLED = 'false';
  const unavailable = await manager.GET(new Request('https://test.invalid/api/technical-alerts'));
  assert.deepEqual(Object.keys(await unavailable.json()).sort(), ['message', 'ok', 'ready', 'store']);
  assert.equal((await manage({ action: 'delete', id: 'rule-1', revision: 'revision-1' })).status, 503);
});
