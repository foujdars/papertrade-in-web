// Push only: no page cache, PAN storage or app-open polling.
self.addEventListener("install",()=>self.skipWaiting());
function store(mode,operation){return new Promise((resolve,reject)=>{const request=indexedDB.open("papertrade-push-v3",1);request.onupgradeneeded=()=>request.result.createObjectStore("state");request.onerror=()=>reject(request.error);request.onsuccess=()=>{const db=request.result,tx=db.transaction("state",mode);let result;operation(tx.objectStore("state"),value=>{result=value;});tx.oncomplete=()=>{db.close();resolve(result);};tx.onerror=()=>{db.close();reject(tx.error);};};});}
function safePath(path){return typeof path==="string"&&(/^\/\?screen=(ipo|pnl)$/.test(path)||/^\/ipo-allotment\/(mufg|kfin|bigshare|bse)$/.test(path))?path:"/";}
self.addEventListener("message",event=>{if(event.data?.type==="preferences")event.waitUntil(store("readwrite",state=>state.put(event.data.preferences,"preferences")));});
self.addEventListener("push",event=>{event.waitUntil((async()=>{
  let payload;try{payload=event.data.json();}catch{return;}
  const notice=payload.data||payload;
  if(!notice.id||typeof notice.title!=="string"||typeof notice.body!=="string"||!["ipo","allotment","portfolio","practice"].includes(notice.kind)||Number(notice.expiresAt)<=Date.now()||!Number.isFinite(Number(notice.expiresAt)))return;
  const accepted=await store("readwrite",(state,done)=>{
    const prefs=state.get("preferences");prefs.onsuccess=()=>{
      const p=prefs.result;
      if(!p||p.pausedUntil>Date.now()||!p[notice.kind==="allotment"?"allotment":notice.kind==="portfolio"?"reviews":notice.kind==="practice"?"practice":"ipo"]){done(false);return;}
      const seen=state.get("seen");seen.onsuccess=()=>{const ids=seen.result||[];if(ids.includes(notice.id)){done(false);return;}state.put([...ids.slice(-199),notice.id],"seen");done(true);};
    };
  });
  if(!accepted)return;
  const clients=await self.clients.matchAll({type:"window",includeUncontrolled:true}),visible=clients.filter(client=>client.visibilityState==="visible");
  if(visible.length){visible.forEach(client=>client.postMessage({type:"papertrade-push",notice}));return;}
  const hour=Number(new Intl.DateTimeFormat("en-GB",{timeZone:"Asia/Kolkata",hour:"2-digit",hourCycle:"h23"}).format(new Date()));
  await self.registration.showNotification(notice.title,{body:notice.body,icon:"/papertrade-icon-192.png?v=1.22",badge:"/notification-badge.svg",tag:notice.id,renotify:false,silent:notice.silent==="true"||hour>=21||hour<8,data:{url:safePath(notice.url)}});
})());});
self.addEventListener("notificationclick",event=>{
  event.notification.close();
  const legacy=event.notification.data?.registrar;
  const path=safePath(event.notification.data?.url||(["mufg","kfin","bigshare","bse"].includes(legacy)?"/ipo-allotment/"+legacy:"/"));
  event.waitUntil(self.clients.openWindow(new URL(path,self.location.origin).href));
});
