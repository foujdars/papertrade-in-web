import test from 'node:test';
import assert from 'node:assert/strict';
import { pineCallAt, pineErrorLocation, PINE_REFERENCE } from '../lib/pine-language.ts';
import { loadPineDraft, savePineDraft, PINE_DRAFT_KEY } from '../lib/pine-workspace.ts';

test('signature help counts outer parameters while ignoring nested calls, strings and comments',()=>{
 assert.deepEqual(pineCallAt('plot(ta.ema(close, 14), "comma, ignored", '),{name:'plot',parameter:2});
 assert.deepEqual(pineCallAt('request.security("NSE:TCS", "D", [close, open], '),{name:'request.security',parameter:3});
 assert.deepEqual(pineCallAt('plot(\n// ignored(a, b,\nclose, '),{name:'plot',parameter:1});
 assert.deepEqual(pineCallAt('plot(ta.sma(close, '),{name:'ta.sma',parameter:1});
 assert.equal(pineCallAt('plot(close)\n// no call here'),null);
});
test('diagnostic navigation clamps invalid locations and supports common runtime error formats',()=>{
 assert.deepEqual(pineErrorLocation('Line 8: unsupported name',15),{line:8,column:1});
 assert.deepEqual(pineErrorLocation('parser:4:7 expression required',15),{line:4,column:7});
 assert.deepEqual(pineErrorLocation('Line 999, column 5',10),{line:10,column:5});
 assert.deepEqual(pineErrorLocation('Unknown function',10),{line:1,column:1});
});
test('editor references have unique names and valid snippet placeholders',()=>{
 assert.ok(PINE_REFERENCE.length>100);
 assert.equal(new Set(PINE_REFERENCE.map(item=>item.name)).size,PINE_REFERENCE.length);
 assert.match(PINE_REFERENCE.find(item=>item.name==='input.float').snippet,/\$\{1:14\}/);
 assert.match(PINE_REFERENCE.find(item=>item.name==='ta.ema').snippet,/\$\{2:14\}/);
 for(const item of PINE_REFERENCE){assert.ok(item.description);assert.ok(item.signature.startsWith(item.name));}
});
function storage(){const rows=new Map();globalThis.window={localStorage:{getItem:key=>rows.get(key)??null,setItem:(key,value)=>rows.set(key,value)}};return rows;}
const draft={name:'Unsaved strategy',source:'//@version=6\nstrategy("Draft")',inputs:{length:9},selectedId:'saved-script',updatedAt:123};
test('draft recovery preserves source, inputs and selected library script without applying it',()=>{
 const rows=storage();assert.equal(savePineDraft(draft),true);assert.deepEqual(loadPineDraft(),draft);
 assert.equal(rows.size,1);assert.equal(rows.has('papertrade-pine-active-v2'),false);
 assert.equal(savePineDraft({...draft,source:'x'.repeat(50001)}),false);assert.deepEqual(loadPineDraft(),draft);
});
test('invalid and unavailable draft storage cannot break editor initialization',()=>{
 const rows=storage();rows.set(PINE_DRAFT_KEY,'{bad');assert.equal(loadPineDraft(),null);
 rows.set(PINE_DRAFT_KEY,JSON.stringify({...draft,selectedId:4}));assert.equal(loadPineDraft(),null);
 rows.set(PINE_DRAFT_KEY,JSON.stringify({...draft,updatedAt:null}));assert.equal(loadPineDraft(),null);
 globalThis.window={get localStorage(){throw Error('denied');}};assert.equal(loadPineDraft(),null);assert.equal(savePineDraft(draft),false);
});
