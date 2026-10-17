import test from 'node:test';
import assert from 'node:assert/strict';
import { loadAppliedPineScript, saveAppliedPineScript, loadPineScripts, savePineScripts, loadPineRevisions, savePineRevision, PINE_STORAGE_KEY } from '../lib/pine-workspace.ts';
function storage(){
 const rows=new Map();
 globalThis.window={localStorage:{getItem:key=>rows.get(key)??null,setItem:(key,value)=>rows.set(key,value),removeItem:key=>rows.delete(key)}};
 return rows;
}
const script=(source='indicator("Test")')=>({name:'Test',source,inputs:{length:14,enabled:true,source:'close'}});
test('advanced active scripts migrate by read, stay isolated, and removal cannot resurrect legacy',()=>{
 storage();
 assert.equal(saveAppliedPineScript(script()),true);
 assert.deepEqual(loadAppliedPineScript(true),script());
 assert.equal(saveAppliedPineScript({...script(),name:'Desktop strategy'},true),true);
 assert.equal(loadAppliedPineScript().name,'Test');
 assert.equal(loadAppliedPineScript(true).name,'Desktop strategy');
 assert.equal(saveAppliedPineScript(null,true),true);
 assert.equal(loadAppliedPineScript(true),null);
 assert.equal(loadAppliedPineScript().name,'Test');
 saveAppliedPineScript({...script(),name:'New mobile'});
 assert.equal(loadAppliedPineScript(true),null);
 assert.equal(loadAppliedPineScript().name,'New mobile');
});
test('revision history deduplicates content, caps each script at twenty, and restores inputs',()=>{
 storage();
 for(let i=0;i<25;i++)assert.equal(savePineRevision({...script(`indicator("${i}")`),id:'one',updatedAt:i}),true);
 const history=loadPineRevisions('one');
 assert.equal(history.length,20);assert.equal(history[0].updatedAt,24);assert.equal(history.at(-1).updatedAt,5);
 assert.deepEqual(history[0].inputs,script().inputs);
 assert.equal(savePineRevision({...script('indicator("24")'),id:'one',updatedAt:30}),true);
 assert.equal(loadPineRevisions('one')[0].updatedAt,24);
 assert.equal(savePineRevision({...script('indicator("24")'),name:'Renamed',id:'one',updatedAt:31}),true);
 assert.equal(loadPineRevisions('one')[0].name,'Renamed');
 assert.equal(new Set(loadPineRevisions('one').map(row=>row.revisionId)).size,20);
});
test('revision history has a global bound and library remains independent',()=>{
 storage();
 for(let i=0;i<130;i++)savePineRevision({...script(),id:`script-${i}`,updatedAt:i});
 assert.equal(loadPineRevisions().length,120);
 assert.equal(loadPineRevisions('script-0').length,0);
 const library=[{...script(),id:'saved',updatedAt:200}];
 assert.equal(savePineScripts(library),true);assert.deepEqual(loadPineScripts(),library);
 assert.equal(loadPineRevisions().length,120);
 assert.equal(savePineScripts(Array.from({length:31},(_,i)=>({...script(),id:String(i),updatedAt:i}))),false);
 assert.deepEqual(loadPineScripts(),library);
});
test('corrupt or unavailable storage fails safely without replacing valid data',()=>{
 const rows=storage();
 saveAppliedPineScript(script(),true);
 assert.equal(saveAppliedPineScript({...script(),inputs:{bad:NaN}},true),false);
 assert.deepEqual(loadAppliedPineScript(true),script());
 assert.equal(savePineRevision({...script(),id:'bad',updatedAt:NaN}),false);
 rows.set('papertrade-pine-revisions-v1',JSON.stringify([{...script(),id:'bad',updatedAt:10,revisionId:3}]));
 assert.deepEqual(loadPineRevisions(),[]);
 rows.set(PINE_STORAGE_KEY,'{broken');assert.deepEqual(loadPineScripts(),[]);
 globalThis.window={get localStorage(){throw Error('blocked');}};
 assert.equal(saveAppliedPineScript(script(),true),false);assert.equal(loadAppliedPineScript(true),null);
 assert.equal(savePineRevision({...script(),id:'one',updatedAt:10}),false);assert.deepEqual(loadPineRevisions(),[]);
});
