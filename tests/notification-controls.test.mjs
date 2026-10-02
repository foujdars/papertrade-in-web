import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtemp, writeFile, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { ipoEventTitle, ipoLocalContent, allotmentContext, ipoDate } from '../lib/ipo-notification-content.ts';

const state = { records: new Map(), sent: [] };
globalThis.__notificationControlsTest = state;
const now = Date.parse('2026-09-14T10:00:30+05:30');
const doc = path => ({
  get: async () => ({ exists:state.records.has(path),data:()=>structuredClone(state.records.get(path)) }),
  set: async value => { state.records.set(path,structuredClone(value)); },
  delete: async () => state.records.delete(path),
});
const db = { doc, collection: path => ({
  doc: id => doc(`${path}/${id}`),
  limit: () => ({ get: async () => ({ empty: false,
    docs: [...state.records].filter(([key]) => key.startsWith(`${path}/`)).map(([,data]) => ({ data: () => structuredClone(data) })),
  }) }),
}) };
state.db=db;
const stubs={
  'server-only':'',
  'push-admin':`export const pushConfigured=()=>true;export const pushServices=async()=>({db:globalThis.__notificationControlsTest.db,messaging:{subscribeToTopic:async()=>({failureCount:0}),unsubscribeFromTopic:async()=>({failureCount:0})}});export const sendPush=async(notice,target)=>{globalThis.__notificationControlsTest.sent.push({notice,target});};`,
  'supabase':`export const createClient=()=>({auth:{getUser:async token=>token==='valid'?{data:{user:{id:'alice'}}}:{data:{},error:'bad token'}}});`,
  'global-alerts':`export const GLOBAL_EMA21_FRAMES={'5m':300,'15m':900};export const ema21EntrySignal=()=>"bullish";`,
  'global-route':`export async function GET(request){const seconds=request.url.includes('timeframe=15m')?900:300;const now=${now};const time=Math.floor(now/1000/seconds)*seconds-seconds;const candles=Array.from({length:6},(_,i)=>({time:time-seconds*(6-i),open:100,high:101,low:99,close:100}));candles.push({time,open:105,high:112,low:104,close:110});return Response.json({ok:true,quote:{},candles});}`,
};
const plugin={name:'notification-controls-services',setup(b){
 b.onResolve({filter:/server-only|push-admin|@supabase\/supabase-js|api\/global-markets\/route|\/global-alerts$/},a=>({path:a.path==='server-only'?'server-only':a.path.includes('push-admin')?'push-admin':a.path.includes('supabase')?'supabase':a.path.includes('global-markets')?'global-route':'global-alerts',namespace:'stub'}));
 b.onLoad({filter:/.*/,namespace:'stub'},a=>({contents:stubs[a.path],loader:'js'}));
}};
async function bundle(entry,plugins=[plugin]){
 const result=await build({entryPoints:[entry],bundle:true,write:false,platform:'node',format:'esm',plugins});
 return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
}
const {dispatchDefaultEma21Alerts}=await bundle('lib/ema21-default-server.ts');
const {dispatchEma5ReversalAlerts}=await bundle('lib/ema5-reversal-server.ts');
const device=await bundle('app/api/notifications/device/route.ts');
function reset(){
 state.records.clear();state.sent=[];
 for(const [token,preferences,lastActive] of [
  ['default',{},now],['only21',{ema21:true,ema5:false},now],['only5',{ema21:false,ema5:true},now],
  ['neither',{ema21:false,ema5:false},now],['paused',{pausedUntil:now+60000},now],['stale',{},now-91*86400000],
 ])state.records.set(`notificationDevices/${token}`,{token,preferences,lastActive});
}
test('server EMA dispatchers independently enforce opt-outs, retain defaults, and deduplicate',async t=>{
 t.mock.method(Date,'now',()=>now);reset();
 await dispatchDefaultEma21Alerts(db,now);
 assert.deepEqual([...new Set(state.sent.map(x=>x.target.token))].sort(),['default','only21']);
 assert.equal(state.sent.length,12);
 const count=state.sent.length;await dispatchDefaultEma21Alerts(db,now);assert.equal(state.sent.length,count);
 state.sent=[];await dispatchEma5ReversalAlerts(db,now);
 assert.deepEqual([...new Set(state.sent.map(x=>x.target.token))].sort(),['default','only5']);
 assert.equal(state.sent.length,4);await dispatchEma5ReversalAlerts(db,now);assert.equal(state.sent.length,4);
});
test('authenticated device registration persists both switches and defaults existing registrations on',async t=>{
 t.mock.method(Date,'now',()=>now);state.records.clear();
 process.env.NEXT_PUBLIC_SUPABASE_URL='https://test.invalid';process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY='test';
 const register=preferences=>device.POST(new Request('https://test.invalid/api/notifications/device',{method:'POST',headers:{authorization:'Bearer valid'},body:JSON.stringify({token:'device-token-at-least-20-chars',preferences})}));
 assert.equal((await register({ema21:false,ema5:true})).status,200);
 let saved=[...state.records.values()][0];assert.equal(saved.preferences.ema21,false);assert.equal(saved.preferences.ema5,true);
 assert.equal((await register({ema21:true,ema5:false})).status,200);
 saved=[...state.records.values()][0];assert.equal(saved.preferences.ema21,true);assert.equal(saved.preferences.ema5,false);
 assert.equal((await register({})).status,200);
 saved=[...state.records.values()][0];assert.equal(saved.preferences.ema21,true);assert.equal(saved.preferences.ema5,true);
});
test('IPO context preserves long company names in bodies and avoids stale GMP or unconfirmed allotment claims',()=>{
 const ipo={name:'A Very Long Company Name That Must Remain Recognisable Limited',maximumPrice:100,biddingEndDate:'2026-09-16',gmpAmount:18,gmpPercent:18,gmpUpdatedAt:new Date(now-60000).toISOString(),details:{dailyEndTime:'17:00:00'}};
 for(const event of ['gmp','gmp-move','closing']){
  const notice=ipoLocalContent(ipo,event,now);assert.match(notice.title,/^IPO:/);assert.ok(notice.title.length<=42);
  assert.match(notice.body,/A Very Long Company Name/);assert.match(notice.body,/16 Sept 2026 at 17:00 IST/);assert.match(notice.body,/Unofficial GMP: ₹18 \/ \+18%/);assert.match(notice.body,/updated .*IST/);
 }
 for(const date of ['',new Date(now+60000).toISOString(),new Date(now-37*3600000).toISOString()])assert.doesNotMatch(ipoLocalContent({...ipo,gmpUpdatedAt:date},'closing',now).body,/GMP/);
 assert.equal(ipoDate('2026-02-30'),'date not confirmed');
 const listed=allotmentContext({name:'Example IPO',state:'listed',listingDate:'2026-09-14',registrarName:'KFintech'});
 assert.match(listed,/does not confirm/);assert.match(listed,/KFintech/);
 assert.ok(ipoEventTitle(ipo.name,'allotment published').length<=42);
});
test('native rules match independent automatic switches and IPO date/freshness handling',async t=>{
 try { execFileSync('javac',['-version']); } catch { t.skip('JDK compiler unavailable; Android builds validate this on a JDK-equipped runner.'); return; }
 const dir=await mkdtemp(join(tmpdir(),'notification-native-'));
 try{
  const fixture=`import in.papertrade.app.NotificationContent; public class NotificationContentCheck { public static void main(String[] args) { if(NotificationContent.automaticEmaAllowed("ema21-BTCUSD-5m-1",false,true))throw new AssertionError(); if(!NotificationContent.automaticEmaAllowed("ema5-BTCUSD-5m-1",false,true))throw new AssertionError(); if(NotificationContent.automaticEmaAllowed("ema5-BTCUSD-5m-1",true,false))throw new AssertionError(); if(!NotificationContent.automaticEmaAllowed("custom-ema21-entry",false,false))throw new AssertionError(); String title=NotificationContent.ipoTitle("A Very Long Company Name That Must Remain Recognisable Limited","allotment published"); if(!title.startsWith("IPO:")||!title.endsWith("allotment published")||title.length()>42)throw new AssertionError(title); if(!NotificationContent.date("2026-02-30").equals("date not confirmed"))throw new AssertionError(); if(!NotificationContent.freshGmp("2026-09-14T04:29:30Z",${now}L)||NotificationContent.freshGmp("2026-09-15T00:00:00Z",${now}L)||NotificationContent.freshGmp("",${now}L))throw new AssertionError(); } }`;
  await writeFile(join(dir,'NotificationContentCheck.java'),fixture);
  execFileSync('javac',['-d',dir,'android/app/src/main/java/in/papertrade/app/NotificationContent.java',join(dir,'NotificationContentCheck.java')]);
  execFileSync('java',['-cp',dir,'NotificationContentCheck']);
  const delivery=await readFile('android/app/src/main/java/in/papertrade/app/NotificationDelivery.java','utf8');
  assert.ok(delivery.indexOf('NotificationContent.automaticEmaAllowed')<delivery.indexOf('JSONArray seen'));
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('rapid preference updates serialize device writes and report failed background sync honestly',async t=>{
 const values=new Map(),events=[],nativePreferences=[];
 const globals=['window','localStorage','fetch'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]);
 let pending=0,maxPending=0,hold,started,fail=false;
 const waiting=new Promise(resolve=>{started=resolve;});
 globalThis.window={dispatchEvent:event=>{events.push(event);return true;}};
 globalThis.localStorage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)};
 globalThis.__notificationClientTest={configure:async options=>{nativePreferences.push(options.preferences);return{token:'test-device-token'};}};
 const bodies=[];
 globalThis.fetch=async(url,options)=>{
  if(url==='/api/notifications/config')return Response.json({enabled:true});
  pending++;maxPending=Math.max(maxPending,pending);bodies.push(JSON.parse(options.body));
  if(bodies.length===2){started();await new Promise(resolve=>{hold=resolve;});}
  pending--;return Response.json({}, {status:fail?503:200});
 };
 t.after(()=>{for(const [key,descriptor]of globals){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}delete globalThis.__notificationClientTest;});
 const clientStubs={
  '@capacitor/core':`export const Capacitor={getPlatform:()=>"android"};`,
  './native-alert':`export const getNativeTradeAlert=()=>({configurePush:options=>globalThis.__notificationClientTest.configure(options)});`,
  './supabase-client':`export const getSupabaseBrowserClient=()=>({auth:{getSession:async()=>({data:{session:{access_token:"test"}}})}});`,
  'firebase/app':`export const getApps=()=>[];export const initializeApp=()=>({});`,
  'firebase/messaging':`export const getMessaging=()=>({});export const getToken=async()=>"";export const isSupported=async()=>false;export const deleteToken=async()=>{};`,
 };
 const clientPlugin={name:'client-services',setup(b){
  b.onResolve({filter:/@capacitor\/core|^\.\/native-alert$|^\.\/supabase-client$|^firebase\/(app|messaging)$/},a=>({path:a.path,namespace:'client-stub'}));
  b.onLoad({filter:/.*/,namespace:'client-stub'},a=>({contents:clientStubs[a.path],loader:'js'}));
 }};
 const client=await bundle('lib/push-client.ts',[clientPlugin]);
 await client.connectPush(false);
 const key='papertrade-notification-preferences-v4';
 values.set(key,JSON.stringify({ema21:false,ema5:true}));
 const first=client.syncNotificationPreferences();await waiting;
 values.set(key,JSON.stringify({ema21:true,ema5:false}));
 const second=client.syncNotificationPreferences();hold();await Promise.all([first,second]);
 assert.equal(maxPending,1);assert.equal(bodies.at(-1).preferences.ema21,true);assert.equal(bodies.at(-1).preferences.ema5,false);
 assert.equal(events.filter(e=>e.type===client.NOTIFICATION_SYNC_EVENT).length,1,'obsolete sync results must not overwrite the newest status');
 assert.equal(events.at(-1).detail.ok,true);
 assert.equal(nativePreferences.at(-1).ema5,false);
 fail=true;await client.syncNotificationPreferences();assert.equal(events.at(-1).detail.ok,false);
 fail=false;await client.syncNotificationPreferences();assert.equal(events.at(-1).detail.ok,true);
});
