import test from 'node:test';
import assert from 'node:assert/strict';
import {addPaperCash} from '../lib/paper-wallets.ts';

test('rupee and dollar practice deposits preserve cents without an arbitrary preset limit', () => {
  assert.equal(addPaperCash(1_000_000, 12.34), 1_000_012.34);
  assert.equal(addPaperCash(10_000, 0.01), 10_000.01);
  assert.equal(addPaperCash(10_000, 100_000_000), 100_010_000);
  assert.ok(Math.abs(addPaperCash(100.0005, 1) - 101.0005) < 1e-10);
});
test('invalid or unsafe deposits cannot change either practice wallet', () => {
  for (const amount of [0, -1, 1.001, Infinity, NaN, Number.MAX_VALUE]) {
    assert.throws(() => addPaperCash(10_000, amount));
  }
  assert.throws(() => addPaperCash(Number.MAX_SAFE_INTEGER / 100, 1));
});
