import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

test('Android Back follows watchlist history, skips placeholders, respects dialogs and debounces rapid presses', async () => {
  const code = ts.transpileModule(await readFile(new URL('../components/useWatchlistHistory.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const history=[{}], restored=[], effects=[]; let index=0, listener, layer=false, backCalls=0;
  const win={addEventListener:(_type,fn)=>{listener=fn;},removeEventListener:()=>{},history:{
    get state(){return history[index];},replaceState(state){history[index]=state;},
    pushState(state){history.splice(++index);history.push(state);},
    back(){backCalls++; if(index===0)return;index--;queueMicrotask(()=>listener({state:history[index],stopImmediatePropagation(){}}));}
  }};
  const react={useRef:current=>({current}),useEffect:fn=>effects.push(fn())};
  const exports={};new Function('require','exports','window',code)(name=>name==='react'?react:{hasTransientBackLayer:()=>layer},exports,win);
  const nav=exports.useWatchlistHistory(s=>restored.push(s));
  nav.remember({section:'trade'});nav.remember({section:'markets',group:'INVESTMENT'});
  // A search overlay gets repurposed as the chart's return destination.
  win.history.pushState({...win.history.state,papertradeLayer:'search'});
  nav.remember({section:'watchlist',category:'Indices',frame:'4H',search:'BANK',scroll:200});
  assert.equal(win.history.state.papertradeLayer,undefined);
  assert.equal(nav.back(),true);assert.equal(nav.back(),true);assert.equal(backCalls,1);
  await Promise.resolve();
  assert.deepEqual(restored.at(-1),{section:'watchlist',category:'Indices',frame:'4H',search:'BANK',scroll:200});
  layer=true;listener({state:history[1],stopImmediatePropagation(){}});assert.equal(restored.length,1);
  layer=false;nav.back();await Promise.resolve();await Promise.resolve();
  assert.deepEqual(restored.at(-1),{section:'markets',group:'INVESTMENT'});
  nav.back();await Promise.resolve();assert.deepEqual(restored.at(-1),{section:'trade'});
  assert.equal(nav.back(),false,'No trap at the original tab');
  nav.remember({section:'watchlist'});nav.clear();assert.equal(nav.back(),false,'Explicit tab changes retire the old journey');
  effects.forEach(fn=>fn?.());
});
