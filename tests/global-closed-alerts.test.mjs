import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

const state = { sent: [], signal: true, feed: true };
globalThis.__globalCloudTest = state;
const stubs = {
  'server-only': '',
  'global-route': `export async function GET(request) { const s=globalThis.__globalCloudTest; return Response.json(s.feed ? request.url.includes('mode=candles') ? {ok:true,candles:[{time:1}]} : {ok:true,quote:{symbol:'BTCUSD',last:1,at:Date.now()}} : {ok:false},{status:s.feed?200:503}); }`,
  'global-alerts': `export const globalAlertError = () => null; export const isEma21EntryKind = kind => kind.startsWith('ema21-entry-'); export const evaluateGlobalAlert = () => globalThis.__globalCloudTest.signal; export const ema21EntrySignal = () => 'bullish';`,
  'notification-policy': `export const notificationPreferences = p => ({trades:!!p.trades,pausedUntil:0}); export const quietTime = () => false; export const divergenceTitle = () => 'Divergence'; export const emaTitle = () => 'EMA entry';`,
  'push-admin': `export const sendPush = async (notice,target) => {globalThis.__globalCloudTest.sent.push({notice,target});};`,
};
const plugin = { name:'isolate-global', setup(b) {
  b.onResolve({filter:/server-only|api\/global-markets\/route|lib\/global-alerts$|\.\/global-alerts$|notification-policy|push-admin/}, a => ({path:a.path.includes('global-markets')?'global-route':a.path.endsWith('global-alerts')?'global-alerts':a.path.includes('notification-policy')?'notification-policy':a.path.includes('push-admin')?'push-admin':'server-only',namespace:'stub'}));
  b.onLoad({filter:/.*/,namespace:'stub'}, a => ({contents:stubs[a.path],loader:'js'}));
} };
const bundle = await build({entryPoints:['lib/global-alerts-server.ts'],bundle:true,write:false,platform:'node',format:'esm',plugins:[plugin]});
const { dispatchCloudGlobalAlerts } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
function database(rule, trades = true) {
  const records = new Map([
    ['globalAlertAccounts/alice',{active:true,rules:[rule]}],
    ['notificationDevices/phone',{userId:'alice',token:'phone-token',lastActive:Date.now(),preferences:{trades}}],
  ]);
  const doc = path => ({id:path.split('/').at(-1),get:async()=>({id:path.split('/').at(-1),ref:doc(path),data:()=>structuredClone(records.get(path))}),set:async v=>{records.set(path,structuredClone(v));},update:async v=>{records.set(path,{...records.get(path),...structuredClone(v)});}});
  const collection = path => {const filters=[];let count=Infinity;const query={where:(key,op,value)=>{filters.push([key,value]);return query;},limit:n=>{count=n;return query;},get:async()=>({docs:[...records.keys()].filter(k=>k.startsWith(path+'/')&&!k.slice(path.length+1).includes('/')&&filters.every(([key,value])=>records.get(k)[key]===value)).slice(0,count).map(k=>({id:k.split('/').at(-1),ref:doc(k),data:()=>structuredClone(records.get(k)),...{} })),size:[...records.keys()].filter(k=>k.startsWith(path+'/')).length})};return query;};
  return {records,doc,collection,runTransaction:async fn=>{const writes=[];const result=await fn({get:r=>r.get(),set:(r,v)=>writes.push(()=>records.set([...records.keys()].find(k=>doc(k).id===r.id)??`globalAlertAccounts/${r.id}`,structuredClone(v))),create:(r,v)=>writes.push(()=>records.set(`globalAlertOutbox/${r.id}`,structuredClone(v)))});writes.forEach(w=>w());return result;}};
}
const rule = {delivery:'server',id:'one',symbol:'BTCUSD',kind:'ema21-entry-bullish',value:0,length:21,timeframe:'5m',createdAt:Date.now()-300000,expiresAt:Date.now()+86400000};
test('confirmed global signal sends once and retains server state',async()=>{
  state.sent=[];state.signal=true;state.feed=true;const db=database(rule);
  await dispatchCloudGlobalAlerts(db);
  assert.equal(state.sent.length,1);assert.equal(state.sent[0].target.token,'phone-token');assert.equal(state.sent[0].notice.url,'/?symbol=BTCUSD&timeframe=5m');
  assert.ok(db.records.get('globalAlertAccounts/alice').rules[0].triggeredAt);
  await dispatchCloudGlobalAlerts(db);assert.equal(state.sent.length,1);
});
test('failed feed and disabled trade preference never notify',async()=>{
  state.sent=[];state.feed=false;const db=database(rule);
  await dispatchCloudGlobalAlerts(db);assert.equal(state.sent.length,0);assert.equal(db.records.get('globalAlertAccounts/alice').rules[0].triggeredAt,undefined);
  state.feed=true;state.sent=[];const optedOut=database(rule,false);await dispatchCloudGlobalAlerts(optedOut);assert.equal(state.sent.length,0);
});
