import test from 'node:test';
import assert from 'node:assert/strict';
import {loadAppliedPineScript,saveAppliedPineScript,loadPineScripts,savePineScripts,PINE_STORAGE_KEY,PINE_TEMPLATES} from '../lib/pine-workspace.ts';
import {runPineScript} from '../lib/pine-script.ts';
const values=new Map();
globalThis.window={localStorage:{getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)}};
const script={name:'My indicator',source:'indicator("Test")\nplot(close)',inputs:{length:5}};
test('active script and library roundtrip independently, removal keeps library',()=>{
 assert.equal(saveAppliedPineScript(script),true);assert.deepEqual(loadAppliedPineScript(),script);
 assert.equal(savePineScripts([{...script,id:'one',updatedAt:123}]),true);assert.equal(loadPineScripts()[0].id,'one');
 assert.equal(saveAppliedPineScript(null),true);assert.equal(loadAppliedPineScript(),null);assert.equal(loadPineScripts().length,1);
});
test('corrupt, unbounded and unavailable browser storage are handled',()=>{
 values.set(PINE_STORAGE_KEY,'invalid json');assert.deepEqual(loadPineScripts(),[]);
 values.set(PINE_STORAGE_KEY,JSON.stringify([{...script,id:1,updatedAt:123},{...script,id:'valid',updatedAt:123},{...script,id:'bad',updatedAt:123,inputs:{length:{nested:1}}}]));assert.deepEqual(loadPineScripts().map(s=>s.id),['valid']);
 assert.equal(savePineScripts(Array(31).fill(script)),false);
 globalThis.window.localStorage.setItem=()=>{throw Error('Quota exceeded');};assert.equal(savePineScripts([]),false);assert.equal(saveAppliedPineScript(script),false);
});
test('every starter template executes with explicit user inputs on market history',()=>{
 const candles=Array.from({length:100},(_,i)=>({time:1700000000+i*60,open:100+i,high:102+i,low:99+i,close:101+i+Math.sin(i),volume:100}));
 for(const template of PINE_TEMPLATES){const result=runPineScript(template.source,candles);assert.equal(result.error,null,template.name);assert.ok(result.plots.some(p=>p.values.some(Number.isFinite)));}
});
