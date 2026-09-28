"use client";
import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { connectPush, setNotificationReviewCount, syncPushDevice } from "@/lib/push-client";
import { NOTIFICATION_SETTINGS_EVENT, readNotificationPreferences } from "@/lib/notification-preferences";
import { addPaperTradeNotification } from "@/lib/notification-center";
import { getNativeTradeAlert } from "@/lib/native-alert";

export function PushNotificationBridge({ userId, reviewCount }: { userId?: string; reviewCount:number }) {
  useEffect(()=>{setNotificationReviewCount(reviewCount);void syncPushDevice().catch(()=>undefined);},[reviewCount]);
  useEffect(()=>{
    if(!userId)return;
    let disposed=false;
    const connect=()=>{
      if(document.visibilityState!=="visible"||Capacitor.getPlatform()==="android")return;
      if(typeof Notification!=="undefined"&&Notification.permission==="granted")void connectPush(false).catch(()=>undefined);
    };
    const ask=()=>{
      window.removeEventListener("pointerdown",ask);
      if(Capacitor.getPlatform()==="android"){void connectPush(true).catch(()=>undefined);return;}
      if(typeof Notification!=="undefined"&&Notification.permission==="default")void connectPush(true).catch(()=>undefined);
    };
    const consume=async()=>{
      if(Capacitor.getPlatform()!=="android")return;
      try{const result=await getNativeTradeAlert().consumeNotifications();if(!disposed)for(const item of result?.notifications||[])addPaperTradeNotification({...item,kind:item.kind==="allotment"?"ipo":item.kind==="practice"||item.kind==="session"?"market":item.kind});}catch{/* Older Android app: no repeated prompts. */}
    };
    const changed=()=>{
      void syncPushDevice().catch(()=>undefined);
      if(Capacitor.getPlatform()==="android")void getNativeTradeAlert().configurePush({preferences:readNotificationPreferences(),requestPermission:false}).catch(()=>undefined);
      void navigator.serviceWorker?.getRegistration("/notifications/").then(registration=>registration?.active?.postMessage({type:"preferences",preferences:readNotificationPreferences()}));
    };
    const message=(event:MessageEvent)=>{if(event.data?.type==="papertrade-push"){const item=event.data.notice;if(item?.id&&item?.title)addPaperTradeNotification({...item,kind:item.kind==="allotment"?"ipo":item.kind==="practice"||item.kind==="session"?"market":item.kind});}};
    connect();changed();void consume();const timer=setInterval(()=>{if(document.visibilityState==="visible"){void consume();void syncPushDevice().catch(()=>undefined);}},60000);
    window.addEventListener("pointerdown",ask,{once:true});
    window.addEventListener(NOTIFICATION_SETTINGS_EVENT,changed);document.addEventListener("visibilitychange",connect);navigator.serviceWorker?.addEventListener("message",message);
    return()=>{disposed=true;clearInterval(timer);window.removeEventListener("pointerdown",ask);window.removeEventListener(NOTIFICATION_SETTINGS_EVENT,changed);document.removeEventListener("visibilitychange",connect);navigator.serviceWorker?.removeEventListener("message",message);};
  },[userId]);
  return null;
}
