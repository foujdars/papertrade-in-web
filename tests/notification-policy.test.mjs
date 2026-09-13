import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { indiaClock, quietTime, notificationSlot, notificationPreferences, ipoDigest, allotmentNotice, reviewNotice } from "../lib/notification-policy.ts";

const at = time => Date.parse("2026-09-14T" + time + "+05:30");
const issue = (changes = {}) => ({
  id:"one", name:"Example IPO", status:"open", issueType:"mainboard",
  biddingStartDate:"2026-09-10", biddingEndDate:"2026-09-16",
  gmpPercent:15, gmpUpdatedAt:new Date(at("08:00:00")).toISOString(), ...changes,
});
test("Indian scheduling windows do not replay missed morning or afternoon reminders", () => {
  assert.deepEqual(indiaClock(at("09:05:00")), {day:"2026-09-14",minutes:545,weekday:1});
  for (const time of ["08:59:00","09:15:00","13:29:59","13:40:00","21:00:00"]) assert.equal(notificationSlot(at(time)),null);
  assert.equal(notificationSlot(at("09:05:00")),"morning");
  assert.equal(notificationSlot(at("13:30:00")),"closing");
});
test("quiet hours cover 9 pm through 7:59 am IST", () => {
  for (const time of ["21:00:00","23:59:59","00:00:00","07:59:59"]) assert.equal(quietTime(at(time)),true);
  for (const time of ["08:00:00","20:59:59"]) assert.equal(quietTime(at(time)),false);
});
test("fresh GMP at exactly 15 percent qualifies but below 15 does not", () => {
  assert.ok(ipoDigest([issue()],at("09:05:00")));
  assert.equal(ipoDigest([issue({gmpPercent:14.99})],at("09:05:00")),null);
  assert.equal(ipoDigest([issue({gmpPercent:null})],at("09:05:00")),null);
});
test("stale, future-dated and invalid GMP cannot attract users through a high-GMP alert", () => {
  for (const date of ["2026-09-10T00:00:00Z","2026-09-16T00:00:00Z",""]) {
    assert.equal(ipoDigest([issue({gmpUpdatedAt:date})],at("09:05:00")),null);
  }
});
test("closing reminders include low-GMP issues without promising profit", () => {
  const notice = ipoDigest([issue({gmpPercent:0,biddingEndDate:"2026-09-14"})],at("13:30:00"));
  assert.ok(notice.body.includes("closes today"));
  assert.ok(notice.body.includes("unofficial"));
  assert.ok(notice.body.includes("not assured profit"));
  assert.ok(notice.body.includes("cutoff"));
});
test("closed, listed and not-yet-open issues cannot be promoted as accepting applications", () => {
  for (const changed of [{status:"closed"},{status:"listed"},{biddingStartDate:"2026-09-15"},{biddingEndDate:"2026-09-13"}]) {
    assert.equal(ipoDigest([issue(changed)],at("09:05:00")),null);
  }
  assert.equal(ipoDigest([issue({biddingEndDate:"2026-09-14",details:{dailyEndTime:"12:00:00"}})],at("13:30:00")),null);
});
test("digest is combined, has a stable per-slot ID, and expires instead of piling up", () => {
  const now=at("09:05:00"), list=[issue(),issue({id:"two",name:"Second IPO"})];
  const notice=ipoDigest(list,now);
  assert.equal(notice.id,ipoDigest(list,now+60000).id);
  assert.ok(notice.title.includes("2 issues"));
  assert.equal(notice.expiresAt,now+30*60000);
  assert.equal(ipoDigest(list,at("11:00:00")),null);
});
test("allotment notifications require evidence, not an expected date", () => {
  const allotment={id:"one",name:"Example IPO",registrar:"kfin",state:"published",evidenceUrl:"https://example.org/evidence"};
  assert.equal(allotmentNotice([{...allotment,state:"awaiting"}],at("10:00:00")),null);
  assert.equal(allotmentNotice([{...allotment,evidenceUrl:""}],at("10:00:00")),null);
  const notice=allotmentNotice([allotment],at("22:00:00"));
  assert.equal(notice.url,"/ipo-allotment/kfin");
  assert.equal(notice.silent,true);
  assert.ok(notice.body.includes("PAN only there"));
});
test("reviews require today's trades and the chosen evening window", () => {
  assert.ok(reviewNotice(2,"2026-09-14",at("17:15:00")));
  assert.equal(reviewNotice(0,"2026-09-14",at("17:15:00")),null);
  assert.equal(reviewNotice(2,"2026-09-13",at("17:15:00")),null);
  assert.equal(reviewNotice(2,"2026-09-14",at("18:00:00")),null);
});
test("preferences honor opt-outs, default private amounts, and bound pauses", () => {
  const defaults=notificationPreferences(null);
  assert.equal(defaults.hideAmounts,true);
  assert.equal(defaults.reviews,false);
  assert.equal(defaults.practice,false);
  const prefs=notificationPreferences({ipo:false,trades:false,pausedUntil:Infinity});
  assert.equal(prefs.ipo,false);assert.equal(prefs.trades,false);assert.equal(prefs.pausedUntil,0);
});

async function workerHarness(preferences) {
  const handlers={}, data=new Map([["preferences",preferences]]), shown=[], messages=[];
  let visible=false;
  const indexedDB={open:()=>{const request={};queueMicrotask(()=>{request.result={
    close(){},
    transaction(){
      const tx={};let pending=0;
      const complete=()=>setTimeout(()=>{if(!pending)tx.oncomplete?.();},0);
      tx.objectStore=()=>({
        put(value,key){data.set(key,value);complete();},
        get(key){pending++;const read={};queueMicrotask(()=>{read.result=data.get(key);read.onsuccess?.();pending--;complete();});return read;},
      });return tx;
    },
  };request.onsuccess?.();});return request;}};
  const self={
    addEventListener:(kind,callback)=>handlers[kind]=callback,
    clients:{matchAll:async()=>visible?[{visibilityState:"visible",postMessage:message=>messages.push(message)}]:[],openWindow:async()=>{}},
    registration:{showNotification:async(title,options)=>shown.push({title,...options})},
    location:{origin:"https://www.papertrade.site"},
  };
  vm.runInNewContext(await readFile(new URL("../public/notifications-sw.js",import.meta.url),"utf8"),{self,indexedDB,Date,Intl,URL});
  return {shown,messages,setVisible:value=>{visible=value;},push:async(notice)=>{
    let task;handlers.push({data:{json:()=>({data:notice})},waitUntil:promise=>{task=promise;}});await task;
  }};
}
const push=changes=>({id:"one",title:"IPO update",body:"Test",kind:"ipo",url:"/?screen=ipo",expiresAt:String(Date.now()+60000),silent:"false",...changes});
test("background worker honors consent and pause, drops expired payloads and deduplicates", async () => {
  for(const prefs of [undefined,{ipo:false},{ipo:true,pausedUntil:Date.now()+60000}]) {
    const worker=await workerHarness(prefs);await worker.push(push());assert.equal(worker.shown.length,0);
  }
  const worker=await workerHarness({ipo:true});
  await worker.push(push({expiresAt:"0"}));assert.equal(worker.shown.length,0);
  await worker.push(push());await worker.push(push());assert.equal(worker.shown.length,1);
  assert.equal(worker.shown[0].data.url,"/?screen=ipo");
  assert.ok(worker.shown[0].icon.includes("v=1.22"));
});
test("visible app receives inbox events without an extra OS alert, and unsafe links are rejected", async () => {
  const worker=await workerHarness({ipo:true});
  worker.setVisible(true);await worker.push(push());
  assert.equal(worker.shown.length,0);assert.equal(worker.messages.length,1);
  worker.setVisible(false);await worker.push(push({id:"two",url:"https://evil.example"}));
  assert.equal(worker.shown[0].data.url,"/");
});
