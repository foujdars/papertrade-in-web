import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizePineDock,resizePineDock,DEFAULT_PINE_DOCK} from '../lib/pine-editor-layout.ts';
test('saved Pine layouts reject invalid values and keep both panes usable',()=>{
 assert.deepEqual(normalizePineDock(null),DEFAULT_PINE_DOCK);
 assert.deepEqual(normalizePineDock({layout:'right',bottom:-2,right:3}),{layout:'right',bottom:.25,right:.75});
 assert.deepEqual(normalizePineDock({layout:'floating',bottom:NaN,right:Infinity}),DEFAULT_PINE_DOCK);
 const resized=resizePineDock({layout:'right',bottom:.44,right:.48},'right',.6);
 assert.deepEqual(resized,{layout:'right',bottom:.44,right:.6});
});
