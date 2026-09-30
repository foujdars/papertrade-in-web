import test from "node:test";
import assert from "node:assert/strict";
import { exponentialBackoffMs } from "../lib/reconnect-backoff.ts";

test("retries wait twice as long until the cap, with equal jitter", () => {
  assert.equal(exponentialBackoffMs(1, { baseMs: 2_000, capMs: 60_000, random: () => 0 }), 1_000);
  assert.equal(exponentialBackoffMs(1, { baseMs: 2_000, capMs: 60_000, random: () => 1 }), 2_000);
  assert.equal(exponentialBackoffMs(2, { baseMs: 2_000, capMs: 60_000, random: () => 1 }), 4_000);
  assert.equal(exponentialBackoffMs(3, { baseMs: 2_000, capMs: 60_000, random: () => 1 }), 8_000);
  assert.equal(exponentialBackoffMs(8, { baseMs: 2_000, capMs: 60_000, random: () => 1 }), 60_000);
});

test("a server retry hint is a floor and cannot push the wait past two minutes", () => {
  assert.equal(exponentialBackoffMs(1, { baseMs: 2_000, capMs: 60_000, retryAfterMs: 90_000, random: () => 0 }), 90_000);
  assert.equal(exponentialBackoffMs(1, { baseMs: 2_000, capMs: 60_000, retryAfterMs: 180_000, random: () => 1 }), 120_000);
});
