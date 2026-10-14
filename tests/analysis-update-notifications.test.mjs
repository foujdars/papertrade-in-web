import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { analysisUpdateNotice } from '../lib/analysis-update-notice.ts';

const now = Date.parse('2026-10-15T10:00:00+05:30');
const manifest = (changes = {}) => ({ version: 'a'.repeat(64), generatedAt: new Date(now).toISOString(), fileName: 'latest.csv', rowCount: 1200, ...changes });
const state = { records: new Map(), sent: [], download: null, failSend: false };
globalThis.__analysisNoticeTest = state;
const doc = path => ({ path,
  get: async () => ({ exists: state.records.has(path), data: () => structuredClone(state.records.get(path)) }),
  set: async value => state.records.set(path, structuredClone(value)),
  update: async value => state.records.set(path, { ...state.records.get(path), ...structuredClone(value) }),
  delete: async () => state.records.delete(path),
});
const db = { doc, runTransaction: async callback => callback({ get: ref => ref.get(), set: (ref, value) => ref.set(value), update: (ref, value) => ref.update(value) }) };
state.db = db;
const stubs = {
  'server-only': '',
  'push-admin': `export const pushConfigured=()=>true; export const pushServices=async()=>({db:globalThis.__analysisNoticeTest.db});export const sendPush=async(notice,target)=>{if(globalThis.__analysisNoticeTest.failSend)throw new Error('unknown outcome');globalThis.__analysisNoticeTest.sent.push({notice,target});};`,
  'fundamental-data-server': `export const FUNDAMENTAL_MANIFEST_PATH='manifest.json';export const storageClient=()=>({download:async()=>({data:globalThis.__analysisNoticeTest.download?new Blob([JSON.stringify(globalThis.__analysisNoticeTest.download)]):null})});`,
};
const result = await build({ entryPoints: ['lib/analysis-update-server.ts'], bundle: true, write: false, platform: 'node', format: 'esm', plugins: [{ name: 'analysis-services', setup(b) {
  b.onResolve({ filter: /server-only|\/push-admin$|\/fundamental-data-server$/ }, a => ({ path: a.path === 'server-only' ? a.path : a.path.split('/').at(-1), namespace: 'stub' }));
  b.onLoad({ filter: /.*/, namespace: 'stub' }, a => ({ contents: stubs[a.path], loader: 'js' }));
} }] });
const server = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
const devices = () => [...state.records.keys()].filter(path => path.startsWith('devices/')).map(path => ({ ref: doc(path), data: () => structuredClone(state.records.get(path)) }));
function reset() { state.records.clear(); state.sent = []; state.download = null; state.failSend = false; }

test('Analysis copy includes fresh data count, safe destination and stable CSV identity', () => {
  const notice = analysisUpdateNotice(manifest(), now);
  assert.equal(notice.kind, 'analysis'); assert.equal(notice.url, '/?screen=fundamentals');
  assert.match(notice.title, /📊/); assert.match(notice.body, /1,200.*🙂/);
  assert.equal(notice.id, analysisUpdateNotice(manifest({ generatedAt: new Date(now + 1000).toISOString() }), now + 1000).id);
  for (const changes of [{ version: 'invalid' }, { generatedAt: 'invalid' }, { generatedAt: new Date(now + 1).toISOString() }, { generatedAt: new Date(now - 86400000).toISOString() }]) assert.equal(analysisUpdateNotice(manifest(changes), now), null);
});

test('unchanged CSV is deduplicated, older manifests cannot replace a new update', async () => {
  reset(); assert.equal(await server.recordAnalysisUpdate(db, manifest(), now), true);
  assert.equal(await server.recordAnalysisUpdate(db, manifest(), now), false);
  assert.equal(await server.recordAnalysisUpdate(db, manifest({ version: 'b'.repeat(64), generatedAt: new Date(now - 1000).toISOString() }), now), false);
});

test('background delivery respects opt-out, pause, stale devices and per-device deduplication', async () => {
  reset(); await server.recordAnalysisUpdate(db, manifest(), now);
  for (const [token, preferences, lastActive] of [['default', {}, now], ['off', { analysis: false }, now], ['paused', { pausedUntil: now + 60000 }, now], ['stale', {}, now - 91 * 86400000]]) state.records.set(`devices/${token}`, { token, preferences, lastActive });
  await server.deliverAnalysisUpdates(db, devices(), now);
  assert.deepEqual(state.sent.map(item => item.target.token), ['default']);
  await server.deliverAnalysisUpdates(db, devices(), now); assert.equal(state.sent.length, 1);
  await server.recordAnalysisUpdate(db, manifest({ version: 'b'.repeat(64) }), now);
  await server.deliverAnalysisUpdates(db, devices(), now); assert.equal(state.sent.length, 2);
});

test('storage reconciliation discovers uploads; transport failures are recorded without duplicate retry', async () => {
  reset(); state.download = manifest(); state.records.set('devices/default', { token: 'default', preferences: {}, lastActive: now });
  state.failSend = true; await server.deliverAnalysisUpdates(db, devices(), now);
  assert.equal(state.records.get('devices/default').analysisDelivery, 'needs-review');
  state.failSend = false; await server.deliverAnalysisUpdates(db, devices(), now); assert.equal(state.sent.length, 0);
  state.download = null; await server.recordAnalysisUpdate(db, manifest({ version: 'b'.repeat(64) }), now);
  await server.deliverAnalysisUpdates(db, devices(), now); assert.equal(state.sent.length, 1);
  assert.equal(state.records.get('devices/default').analysisDelivery, 'accepted');
});

test('expired updates do not alert a returning device', async () => {
  reset(); await server.recordAnalysisUpdate(db, manifest(), now);
  state.records.set('devices/default', { token: 'default', preferences: {}, lastActive: now });
  await server.deliverAnalysisUpdates(db, devices(), now + 86400000); assert.equal(state.sent.length, 0);
});

const uploadBundle = await build({ entryPoints: ['app/api/fundamentals/upload/route.ts'], bundle: true, write: false, platform: 'node', format: 'esm', plugins: [{ name: 'upload-services', setup(b) {
  b.onResolve({ filter: /fundamental-data-server|analysis-update-server/ }, a => ({ path: a.path.includes('analysis-update') ? 'queue' : 'storage', namespace: 'upload' }));
  b.onLoad({ filter: /.*/, namespace: 'upload' }, a => ({ loader: 'js', contents: a.path === 'queue'
    ? `export async function queueAnalysisUpdate(manifest){globalThis.__analysisNoticeTest.uploadNotices.push(manifest);if(globalThis.__analysisNoticeTest.queueFails)throw new Error('push unavailable');return true;}`
    : `export const FUNDAMENTAL_CSV_PATH='latest.csv',FUNDAMENTAL_MANIFEST_PATH='manifest.json';export function requireFundamentalUploadToken(r){if(r.headers.get('authorization')!=='Bearer valid')throw new Error('unauthorized');}export const fundamentalErrorResponse=()=>Response.json({error:'upload failed'},{status:500});export const storageClient=()=>({upload:async path=>({error:globalThis.__analysisNoticeTest.failPath===path?new Error('storage failed'):null})});` }));
} }] });
const upload = await import(`data:text/javascript;base64,${Buffer.from(uploadBundle.outputFiles[0].text).toString('base64')}`);
const uploadRequest = csv => new Request('https://test.invalid/api/fundamentals/upload', { method: 'POST', headers: { authorization: 'Bearer valid' }, body: csv });
const csv = 'Name,ISIN Code,NSE Code,BSE Code,Industry\nExample,INE000,TEST,123,Software';

test('invalid CSV and failed CSV/manifest saves never announce a data update', async () => {
  state.uploadNotices = []; state.queueFails = false;
  assert.equal((await upload.POST(uploadRequest(''))).status, 400);
  assert.equal((await upload.POST(uploadRequest('Wrong,Headers\n1,2'))).status, 400);
  for (const failPath of ['latest.csv', 'manifest.json']) {
    state.failPath = failPath; assert.equal((await upload.POST(uploadRequest(csv))).status, 500);
  }
  assert.equal(state.uploadNotices.length, 0);
});

test('successful CSV save queues an update; push outage does not fail the saved upload', async () => {
  state.failPath = null; state.uploadNotices = []; state.queueFails = false;
  const response = await upload.POST(uploadRequest(csv)); assert.equal(response.status, 200);
  const body = await response.json(); assert.equal(body.notificationQueued, true);
  assert.equal(state.uploadNotices[0].version, body.version);
  state.queueFails = true;
  const fallback = await upload.POST(uploadRequest(csv)); assert.equal(fallback.status, 200);
  assert.equal((await fallback.json()).notificationQueued, false);
});

const query = { where: () => query, orderBy: () => query, limit: () => query, startAfter: () => query, get: async () => ({ docs: [], size: 0 }) };
db.collection = path => ({ ...query, doc: id => doc(`${path}/${id}`) });
const dispatchStubs = {
  'push-admin': `export const pushConfigured=()=>true;export const pushServices=async()=>({db:globalThis.__analysisNoticeTest.db,FieldPath:{documentId:()=> 'id'},FieldValue:{increment:v=>v}});export const sendPush=async()=>{};`,
  'ipo-allotment-server': `export async function loadAllotments(){throw new Error('allotment feed offline');}`,
  'ipo-route': `export async function GET(){throw new Error('IPO feed offline');}`,
  'volume-shocker-server': `export const deliverVolumeShockerAlerts=async()=>0;`,
  'analysis-update-server': `export const deliverAnalysisUpdates=async()=>{globalThis.__analysisNoticeTest.analysisRuns++;return 1;};`,
};
const dispatchBundle = await build({ entryPoints: ['app/api/notifications/dispatch/route.ts'], bundle: true, write: false, platform: 'node', format: 'esm', plugins: [{ name: 'dispatch-services', setup(b) {
  b.onResolve({ filter: /push-admin|ipo-allotment-server|upstox\/ipos\/route|volume-shocker-server|analysis-update-server/ }, a => ({ path: a.path.includes('upstox/ipos') ? 'ipo-route' : a.path.split('/').at(-1), namespace: 'dispatch' }));
  b.onLoad({ filter: /.*/, namespace: 'dispatch' }, a => ({ contents: dispatchStubs[a.path], loader: 'js' }));
} }] });
const dispatcher = await import(`data:text/javascript;base64,${Buffer.from(dispatchBundle.outputFiles[0].text).toString('base64')}`);
test('IPO and allotment feed outages do not block Analysis processing or erase existing observations', async t => {
  reset(); state.analysisRuns = 0;
  state.records.set('notificationSystem/observations', { allotments: { existing: 'published' }, listed: { existing: true } });
  const previous = process.env.NOTIFICATION_CRON_SECRET; process.env.NOTIFICATION_CRON_SECRET = 'x'.repeat(32);
  t.after(() => { if (previous === undefined) delete process.env.NOTIFICATION_CRON_SECRET; else process.env.NOTIFICATION_CRON_SECRET = previous; });
  t.mock.method(Date, 'now', () => now);
  const response = await dispatcher.GET(new Request('https://test.invalid/api/notifications/dispatch', { headers: { authorization: `Bearer ${process.env.NOTIFICATION_CRON_SECRET}` } }));
  assert.equal(response.status, 200); assert.equal(state.analysisRuns, 1);
  assert.deepEqual(state.records.get('notificationSystem/observations'), { allotments: { existing: 'published' }, listed: { existing: true } });
  assert.equal(state.records.get('notificationSystem/health').ipoFeedReady, false);
});
