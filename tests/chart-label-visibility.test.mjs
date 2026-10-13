import test from 'node:test';
import assert from 'node:assert/strict';
import { layoutDrawingLabels } from '../lib/drawing-label-layout.ts';
const measure = (text, size) => text.length * size * .55;
test('drawing level labels disappear above and below the plot instead of sticking to its edges', () => {
  for (const anchored of [false, true]) {
    for (const y of [-100, -1, 301, 900, NaN, Infinity]) {
      assert.deepEqual(layoutDrawingLabels([{text:'Level', x:100, y, anchored}], 240, 300, measure), []);
    }
    assert.equal(layoutDrawingLabels([{text:'Level', x:100, y:150, anchored}], 240, 300, measure).length, 1);
  }
});

import { readFileSync } from 'node:fs';
test('prior labels use actual price coordinates and stay in the main plot', () => {
  const source = readFileSync(new URL('../components/PriorLevels.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /getVisibleRange|textY|labelY/);
  assert.match(source, /y > height - 8\) return null/);
  assert.match(source, /height, overflow: "hidden"/);
  assert.match(source, /top: y, left: labelAt/);
});
