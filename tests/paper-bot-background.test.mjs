import test from 'node:test';
import assert from 'node:assert/strict';
import { runBackgroundAccount, backgroundActive } from '../lib/paper-bot-background.ts';
import { readGlobalAccount } from '../lib/global-order-engine.ts';
import { configureBot, defaultBot } from '../lib/paper-bot-state.ts';
const base = 1800000000000, seconds = 300, now = base + 25 * seconds * 1000 + 6000;
const candles = [...Array(24).fill(100), 110].map((close, i) => ({ time: base / 1000 + i * seconds, open: close, high: close + .5, low: close - .5, close, volume: 100 }));
const spec = { symbol: 'BTCUSD', lot: .01, tick: .01, initial: .01, maintenance: .005, initialScale: 0, maintenanceScale: 0, scalingThreshold: 100000, maxNotional: 5000000, maker: .0002, taker: .0005, liquidation: .0005, fundingSeconds: 28800, operational: true, fetchedAt: now };
const quote = { symbol: 'BTCUSD', last: 110, mark: 110, index: 110, bid: 109.99, ask: 110, bidSize: 10000, askSize: 10000, funding: 0, change: 1, at: now, operational: true };
const bot = configureBot(undefined, { ...defaultBot('BTCUSD'), strategy: 'breakout', period: 10 }, true, now - seconds * 1000);
const clone = a => structuredClone(a);
function fixture() {
  let record = { user_id: 'owner', account: { ...readGlobalAccount(null), bots: [clone(bot)] }, version: 1, last_checked_at: 0, last_error: '' };
  let at = now, price = 110, stale = false, marketHook;
  const deps = {
    now: () => at,
    market: async (symbol, frame) => {
      if (marketHook) await marketHook(symbol, frame);
      return frame ? { candles: clone(candles), fetchedAt: at } : { spec: { ...spec, fetchedAt: at }, quote: { ...quote, at: stale ? at - 31000 : at, last: price, mark: price, index: price, bid: price - .01, ask: price } };
    },
    save: async (current, account, checked, error) => {
      if (!record || current.user_id !== record.user_id || record.version !== current.version) return null;
      record = { ...record, account: clone(account), version: record.version + 1, last_checked_at: checked, last_error: error }; return clone(record);
    },
  };
  return { deps, get: () => clone(record), run: () => runBackgroundAccount(clone(record), deps), edit: fn => { record = { ...record, version: record.version + 1, account: fn(clone(record.account)) }; }, remove: () => { record = null; }, price: value => { price = value; at += 1000; }, stale: () => { stale = true; }, hook: fn => { marketHook = fn; } };
}
test('server enters and exits protected paper trades without any browser globals', async () => {
  assert.equal(typeof window, 'undefined'); assert.equal(typeof localStorage, 'undefined');
  const f = fixture(); await f.run();
  const entered = f.get();
  assert.equal(entered.account.positions.length, 1); assert.equal(entered.account.events[0].botId, 'BTCUSD');
  assert.ok(entered.account.positions[0].protection.stopLoss); assert.ok(entered.account.positions[0].protection.takeProfit);
  assert.equal(entered.last_checked_at, now);
  f.price(113); await f.run();
  const exited = f.get(); assert.equal(exited.account.positions.length, 0);
  assert.equal(exited.account.events.at(-1).kind, 'CLOSE'); assert.equal(exited.account.events.at(-1).botId, 'BTCUSD');
  assert.deepEqual(readGlobalAccount(JSON.stringify(exited.account)), exited.account);
});
test('overlapping scheduler ticks commit only one entry and do not duplicate history on retry', async () => {
  const f = fixture(), record = f.get();
  const outcomes = await Promise.all([runBackgroundAccount(record, f.deps), runBackgroundAccount(record, f.deps)]);
  assert.ok(outcomes.some(result => result.conflict));
  assert.equal(f.get().account.events.filter(e => e.kind === 'OPEN').length, 1);
  await f.run(); assert.equal(f.get().account.events.filter(e => e.kind === 'OPEN').length, 1);
});
test('an acknowledged pause invalidates the older entry evaluation', async () => {
  const f = fixture();
  f.hook(async (_symbol, frame) => { if (frame) f.edit(a => ({ ...a, bots: a.bots.map(b => ({ ...b, enabled: false })) })); });
  const result = await f.run();
  assert.equal(result.conflict, true); assert.equal(f.get().account.bots[0].enabled, false); assert.equal(f.get().account.positions.length, 0);
});
test('paused bots still exit at their stop and become inactive only after exposure is gone', async () => {
  const f = fixture(); await f.run();
  f.edit(a => ({ ...a, bots: a.bots.map(b => ({ ...b, enabled: false })) }));
  assert.equal(backgroundActive(f.get().account), true);
  f.price(108); await f.run();
  assert.equal(f.get().account.positions.length, 0); assert.equal(backgroundActive(f.get().account), false);
});
test('protective exits save before stalled candle history completes', async () => {
  const f = fixture(); await f.run(); f.price(108);
  let release, started;
  const waiting = new Promise(resolve => { started = resolve; });
  const gate = new Promise(resolve => { release = resolve; });
  f.hook(async (_symbol, frame) => { if (frame) { started(); await gate; } });
  const run = f.run(); await waiting;
  assert.equal(f.get().account.positions.length, 0);
  release(); await run;
});
test('stale quotes, missing candles and outages do not fabricate fills', async () => {
  for (const mode of ['stale', 'history', 'all']) {
    const f = fixture();
    if (mode === 'stale') f.stale();
    else f.hook((_symbol, frame) => { if (mode === 'all' || frame) throw new Error('Feed down'); });
    await f.run(); assert.equal(f.get().account.positions.length, 0, mode);
    assert.equal(f.get().account.bots[0].enabled, true);
    if (mode !== 'stale') assert.match(f.get().last_error, /unavailable/);
  }
});
test('deleting an account prevents a pending worker from recreating it', async () => {
  const f = fixture(), record = f.get(); f.remove();
  const result = await runBackgroundAccount(record, f.deps); assert.equal(result.conflict, true); assert.equal(f.get(), null);
});
