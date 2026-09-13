"use client";
import { useEffect, useState } from "react";
import { readNotificationPreferences, saveNotificationPreferences } from "@/lib/notification-preferences";
import { connectPush, syncPushDevice } from "@/lib/push-client";
import type { NotificationPreferences } from "@/lib/notification-policy";

export function NotificationSettings() {
  const [preferences,setPreferences]=useState<NotificationPreferences>(()=>readNotificationPreferences());
  const [status,setStatus]=useState("Enable background delivery to receive updates without opening the app.");
  const [busy,setBusy]=useState(false);
  useEffect(()=>{void fetch("/api/notifications/config").then(response=>response.json()).then(data=>{if(!data.enabled)setStatus("Background delivery setup is pending. These preferences are saved on this device.");}).catch(()=>setStatus("Delivery status could not be checked."));},[]);
  async function update(next: NotificationPreferences) {
    saveNotificationPreferences(next);setPreferences(next);setStatus("Preferences saved on this device.");
    try { await syncPushDevice(); } catch { setStatus("Saved locally. Connect background delivery to sync these preferences."); }
  }
  return <details className="notification-settings"><summary>Notification preferences</summary>
    <p>IPO updates go to everyone who enables them. All times are IST.</p>
    {([["ipo","IPO spotlight & closing reminders","9:05 am and 1:30 pm on closing days"],["allotment","Allotment results","Once publication is verified; silent overnight"],["trades","My trade events","Only your target, stop-loss and paper exits"],["reviews","My daily review","5:15 pm, only after a trading day with activity"],["practice","Gentle practice reminder","At most once weekly"],["hideAmounts","Hide trade amounts on lock screen","Keep your paper-trading results private"]] as const).map(([key,label,description])=><label key={key}><span><b>{label}</b><small>{description}</small></span><input type="checkbox" checked={preferences[key]} onChange={event=>void update({...preferences,[key]:event.target.checked})}/></label>)}
<button type="button" onClick={()=>void update({...preferences,pausedUntil:preferences.pausedUntil>0?0:Date.now()+7*86400000})}>{preferences.pausedUntil>0?"Resume notifications":"Pause notifications for a week"}</button>
    <button type="button" disabled={busy} onClick={async()=>{setBusy(true);try{await connectPush(true);setStatus("Background delivery connected. Phone permissions and network availability still apply.");}catch(error){setStatus(error instanceof Error?error.message:"Could not connect notifications.");}finally{setBusy(false);}}}>{busy?"Connecting…":"Enable / reconnect background delivery"}</button>
    <p role="status">{status}</p><small>No repeated waiting messages. Quiet hours: 9 pm–8 am. GMP is unofficial and can change.</small>
  </details>;
}
