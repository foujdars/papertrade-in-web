import test from 'node:test';
import assert from 'node:assert/strict';
import { headerPopoverPosition } from '../lib/header-popover-position.ts';

test('tools open below the three-dot trigger instead of at the screen bottom', () => {
  const result = headerPopoverPosition({bottom: 80, right: 330}, {left: 0, top: 0, width: 393, height: 850}, 330, 780);
  assert.equal(result.top, 88);
  assert.equal(result.left, 8);
  assert.equal(result.width, 377);
  assert.equal(result.top + result.maxHeight, 772);
});

test('notifications fit narrow phones, landscape, keyboard and visual viewport offsets', () => {
  for (const viewport of [
    {left: 0, top: 0, width: 320, height: 640},
    {left: 0, top: 0, width: 760, height: 320},
    {left: 0, top: 0, width: 393, height: 340},
    {left: 12, top: 40, width: 340, height: 480},
  ]) {
    const result = headerPopoverPosition({bottom: 100, right: 300}, viewport, 390);
    assert.ok(result.left >= viewport.left + 8);
    assert.ok(result.left + result.width <= viewport.left + viewport.width - 8);
    assert.ok(result.top >= viewport.top + 8);
    assert.ok(result.top + result.maxHeight <= viewport.top + viewport.height - 8);
  }
});

test('desktop aligns to its trigger and never gets a negative available height', () => {
  const result = headerPopoverPosition({bottom: 54, right: 1200}, {left: 0, top: 0, width: 1440, height: 900}, 330);
  assert.equal(result.left, 870);
  assert.equal(result.top, 62);
  assert.equal(headerPopoverPosition({bottom: 100, right: 300}, {left: 0, top: 0, width: 393, height: 90}, 390).maxHeight, 0);
});


test('both tools and notifications span the mobile viewport with equal side margins', () => {
  for (const width of [320, 393, 576, 760]) {
    for (const preferredWidth of [330, 390]) {
      const result = headerPopoverPosition({bottom: 90, right: width - 80}, {left: 0, top: 0, width, height: 850}, preferredWidth);
      assert.equal(result.left, 8);
      assert.equal(result.width, width - 16);
      assert.equal(result.top, 98);
    }
  }
});
