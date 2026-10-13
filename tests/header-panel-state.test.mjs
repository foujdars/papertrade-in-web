import test from 'node:test';
import assert from 'node:assert/strict';
import { updateHeaderPanel } from '../lib/header-panel-state.ts';
const panels = ['notifications', 'tools', 'profile'];

test('every header button replaces every other open panel', () => {
  for (const current of [null, ...panels]) {
    for (const target of panels) {
      const next = updateHeaderPanel(current, target, true);
      assert.equal(next, target);
      assert.equal(panels.filter(panel => panel === next).length, 1);
    }
  }
});

test('clicking the selected button toggles it closed and switching buttons opens the new panel', () => {
  const toggle = open => !open;
  let current = null;
  for (const panel of ['profile', 'tools', 'notifications', 'profile', 'notifications', 'tools']) {
    current = updateHeaderPanel(current, panel, toggle);
    assert.equal(current, panel);
  }
  assert.equal(updateHeaderPanel(current, 'tools', toggle), null);
});

test('close, backdrop and Back dismiss only their own panel; stale callbacks cannot close a newly selected panel', () => {
  for (const current of panels) {
    assert.equal(updateHeaderPanel(current, current, false), null);
    for (const other of panels.filter(panel => panel !== current)) {
      assert.equal(updateHeaderPanel(current, other, false), current);
    }
  }
});
