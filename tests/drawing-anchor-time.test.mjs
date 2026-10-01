import assert from 'node:assert/strict';
import test from 'node:test';
import { drawingTimeForFrame } from '../lib/drawing-anchor-time.ts';
const time=s=>Date.parse(s)/1000;

test('September daily anchor uses September monthly candle even when October is nearer',()=>{
 const candles=['2026-08-03T00:00:00+05:30','2026-09-01T00:00:00+05:30','2026-10-01T00:00:00+05:30'].map(time);
 assert.equal(drawingTimeForFrame(time('2026-09-18T00:00:00+05:30'),candles,'1M',19800),candles[1]);
 assert.equal(drawingTimeForFrame(time('2026-10-20T00:00:00+05:30'),candles,'1M',19800),candles[2]);
});
test('weekly and yearly anchors use the containing period, including the final period',()=>{
 const weeks=['2026-09-14T00:00:00+05:30','2026-09-21T00:00:00+05:30'].map(time);
 assert.equal(drawingTimeForFrame(time('2026-09-20T00:00:00+05:30'),weeks,'1W',19800),weeks[0]);
 const years=['2025-01-01T00:00:00Z','2026-01-01T00:00:00Z'].map(time);
 assert.equal(drawingTimeForFrame(time('2026-12-20T00:00:00Z'),years,'1Y'),years[1]);
});
test('axis shifts distinguish India and global calendar boundaries',()=>{
 const epoch=time('2026-09-30T23:00:00Z'),anchor=epoch+19800;
 const globalMonths=['2026-09-01T00:00:00Z','2026-10-01T00:00:00Z'].map(time);
 assert.equal(drawingTimeForFrame(anchor,globalMonths,'1M',0,19800),globalMonths[0]);
 const indianMonths=['2026-09-01T00:00:00+05:30','2026-10-01T00:00:00+05:30'].map(time);
 assert.equal(drawingTimeForFrame(anchor,indianMonths,'1M',19800,19800),indianMonths[1]);
 assert.equal(drawingTimeForFrame(epoch,[], '5m',0,0,19800),anchor);
});
test('missing periods retain the anchor instead of attaching to an unrelated candle',()=>{
 const anchor=time('2026-09-18T00:00:00Z');
 assert.equal(drawingTimeForFrame(anchor,[time('2026-08-01T00:00:00Z')],'1M'),anchor);
});
