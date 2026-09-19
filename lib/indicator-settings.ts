"use client";
import { useSyncExternalStore } from 'react';
import { STUDIES, normalizeStudy, type StudyConfig } from './indicator-catalog';
export type IndicatorPreferences={settings:Record<string,StudyConfig>;favorites:string[]};
const KEY='papertrade-indicator-settings-v1',EVENT='papertrade:indicator-settings';
const EMPTY:IndicatorPreferences={settings:{},favorites:['rsi','adx','ema','vwap','volume','macd']};
let current=EMPTY,rawCache:string|null|undefined;
function read(){if(typeof window==='undefined')return EMPTY;try{const raw=localStorage.getItem(KEY);if(raw!==rawCache){const value=JSON.parse(raw??'{}');current={settings:Object.fromEntries(STUDIES.filter(s=>value.settings?.[s.id]).map(s=>[s.id,normalizeStudy(s.id,value.settings[s.id])])),favorites:Array.isArray(value.favorites)?STUDIES.filter(s=>value.favorites.includes(s.id)).map(s=>s.id):EMPTY.favorites};rawCache=raw;}}catch{}return current;}
function subscribe(cb:()=>void){window.addEventListener(EVENT,cb);window.addEventListener('storage',cb);return()=>{window.removeEventListener(EVENT,cb);window.removeEventListener('storage',cb);};}
function write(next:IndicatorPreferences){current=next;try{rawCache=JSON.stringify(next);localStorage.setItem(KEY,rawCache);}catch{}window.dispatchEvent(new Event(EVENT));}
export function useIndicatorSettings(){const value=useSyncExternalStore(subscribe,read,()=>EMPTY);return { ...value,setStudy:(id:string,config:StudyConfig)=>write({...read(),settings:{...read().settings,[id]:normalizeStudy(id,config)}}),toggleFavorite:(id:string)=>{const old=read();write({...old,favorites:old.favorites.includes(id)?old.favorites.filter(x=>x!==id):[...old.favorites,id]});}};}
