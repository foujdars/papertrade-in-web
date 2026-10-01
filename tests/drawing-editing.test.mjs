import assert from 'node:assert/strict';
import test from 'node:test';
import { duplicateDrawingPoints } from '../lib/drawing-editing.ts';

test('duplicates preserve candle spacing across market closures', () => {
 const times=[100,400,700,10000,10300,10600,10900,11200,11500,20000];
 const original=[{time:100,price:90},{time:700,price:110}];
 assert.deepEqual(duplicateDrawingPoints(original,times),[{time:10900,price:90},{time:11500,price:110}]);
 assert.deepEqual(original,[{time:100,price:90},{time:700,price:110}]);
});
test('duplicates retain fractional bar positions and study values', () => {
 assert.deepEqual(duplicateDrawingPoints([{time:150,value:38},{time:250,value:55}],[100,200,300,400,500],1),[{time:250,value:38},{time:350,value:55}]);
});
test('unloaded chart leaves copied coordinates intact', () => {
 assert.deepEqual(duplicateDrawingPoints([{time:100,price:12}],[]),[{time:100,price:12}]);
});
