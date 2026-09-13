"use client";
import { Capacitor } from "@capacitor/core";
import { getNativeTradeAlert } from "./native-alert";
import { getSupabaseBrowserClient } from "./supabase-client";
import { readNotificationPreferences } from "./notification-preferences";

let activeToken = "";
let reviewCount = 0;
let connecting: Promise<void> | null = null;
let disconnecting = false;
export function setNotificationReviewCount(count: number) { reviewCount = count; }
export async function syncPushDevice(remove = false) {
  if (!activeToken) return;
  const session = (await getSupabaseBrowserClient()?.auth.getSession())?.data.session;
  if (!session) throw new Error("Sign in to enable background notifications.");
  const response = await fetch("/api/notifications/device", { method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${session.access_token}`},body:JSON.stringify({token:activeToken,preferences:readNotificationPreferences(),reviewCount,remove}) });
  if (!response.ok) throw new Error("Background delivery could not be saved. Please retry.");
  if(remove) activeToken="";
}
export function connectPush(askPermission: boolean) {
  if (disconnecting) return Promise.resolve();
  if (!connecting) connecting = connect(askPermission).finally(() => { connecting = null; });
  return connecting;
}
async function connect(askPermission: boolean) {
  const response = await fetch("/api/notifications/config");
  const setup = await response.json();
  if (!setup.enabled) throw new Error("Background delivery setup is pending. App alerts are still available.");
  if (Capacitor.getPlatform()==="android") {
    const result = await getNativeTradeAlert().configurePush({preferences:readNotificationPreferences(),requestPermission:askPermission});
    if (!result?.token) throw new Error(result?.error || "Install the notification-enabled Android update and allow notifications.");
    activeToken=result.token;
  } else {
    if (!setup.webEnabled) throw new Error("Browser notification setup is pending. The Android app can still receive alerts.");
    if (!("Notification" in window) || !("serviceWorker" in navigator)) throw new Error("This browser does not support background notifications. On iPhone, install the app to your Home Screen first.");
    const permission= askPermission && Notification.permission==="default" ? await Notification.requestPermission() : Notification.permission;
    if(permission!=="granted") throw new Error("Allow notifications in your browser or phone settings.");
    const { initializeApp, getApps } = await import("firebase/app");
    const { getMessaging, getToken, isSupported } = await import("firebase/messaging");
    if(!await isSupported()) throw new Error("Background notifications are not supported on this device.");
    const app=getApps().find(item=>item.name==="papertrade-push")??initializeApp(setup.config,"papertrade-push");
    const registration=await navigator.serviceWorker.register("/notifications-sw.js",{scope:"/notifications/"});
    await new Promise<void>((resolve,reject)=>{
      if(registration.active) return resolve();
      const worker=registration.installing??registration.waiting;
      if(!worker) return reject(new Error("Notification service could not start."));
      const timeout=setTimeout(()=>reject(new Error("Notification service is taking too long. Retry.")),10000);
      worker.addEventListener("statechange",()=>{if(worker.state==="activated"){clearTimeout(timeout);resolve();}});
    });
    activeToken=await getToken(getMessaging(app),{vapidKey:setup.vapidKey,serviceWorkerRegistration:registration});
    registration.active?.postMessage({type:"preferences",preferences:readNotificationPreferences()});
    sessionStorage.setItem("papertrade-push-connected","true");
  }
  await syncPushDevice();
}

export async function disconnectPush() {
  disconnecting = true;
  try {
  await connecting?.catch(()=>undefined);
  let token = activeToken;
  if (Capacitor.getPlatform() === "android") {
    const result = await getNativeTradeAlert().configurePush({ preferences: { ...readNotificationPreferences(), ipo:false, allotment:false, trades:false, reviews:false, practice:false }, requestPermission:false }).catch(()=>undefined);
    token ||= result?.token || "";
    activeToken = token;
    await getNativeTradeAlert().consumeNotifications().catch(()=>undefined);
  } else {
    const registration = await navigator.serviceWorker?.getRegistration("/notifications/");
    registration?.active?.postMessage({type:"preferences",preferences:{ipo:false,allotment:false,reviews:false,practice:false}});
    const { getApps } = await import("firebase/app");
    const { getMessaging, deleteToken } = await import("firebase/messaging");
    const app=getApps().find(item=>item.name==="papertrade-push");
    if(app) await deleteToken(getMessaging(app)).catch(()=>undefined);
  }
  if (token) await syncPushDevice(true);
  activeToken = "";
  } finally { disconnecting = false; }
}
