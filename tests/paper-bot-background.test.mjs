import test from 'node:test';
import assert from 'node:assert/strict';
import { runBackgroundAccount, backgroundActive } from '../lib/paper-bot-background.ts';
import { readGlobalAccount } from '../lib/global-order-engine.ts';
import { advancePaperBots } from '../lib/paper-bot-engine.ts';
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
  return { seedPosition: () => { record.account = advancePaperBots(record.account, { BTCUSD: { spec, quote } }, { 'BTCUSD:5m': { candles, fetchedAt: now } }, now); assert.equal(record.account.positions.length, 1); }, deps, get: () => clone(record), run: () => runBackgroundAccount(clone(record), deps), edit: fn => { record = { ...record, version: record.version + 1, account: fn(clone(record.account)) }; }, remove: () => { record = null; }, price: value => { price = value; at += 1000; }, stale: () => { stale = true; }, hook: fn => { marketHook = fn; } };
}
test('retired bots cannot enter trades or request strategy history', async () => {
  const f = fixture(); let requests = 0;
  f.hook(() => { requests++; });
  await f.run();
  assert.equal(requests, 0);
  assert.equal(f.get().account.positions.length, 0);
  assert.equal(f.get().account.events.length, 0);
  assert.equal(f.get().account.bots[0].enabled, false);
  assert.equal(backgroundActive(f.get().account), false);
});
test('overlapping ticks cannot recreate retired strategies', async () => {
  const f = fixture(), record = f.get();
  const outcomes = await Promise.all([runBackgroundAccount(record, f.deps), runBackgroundAccount(record, f.deps)]);
  assert.ok(outcomes.some(result => result.conflict));
  assert.equal(f.get().account.positions.length, 0);
  await f.run(); assert.equal(f.get().account.events.length, 0);
});
test('existing bot positions retain history and protective stop exits', async () => {
  const f = fixture(); f.seedPosition();
  assert.equal(backgroundActive(f.get().account), true);
  await f.run();
  assert.equal(f.get().account.bots[0].enabled, false);
  assert.equal(f.get().account.positions.length, 1);
  f.price(108); await f.run();
  assert.equal(f.get().account.positions.length, 0);
  assert.equal(f.get().account.events.at(-1).kind, 'CLOSE');
  assert.equal(backgroundActive(f.get().account), false);
});
test('protective exits do not request retired strategy history', async () => {
  const f = fixture(); f.seedPosition(); f.price(108);
  f.hook((_symbol, frame) => assert.equal(frame, undefined));
  await f.run();
  assert.equal(f.get().account.positions.length, 0);
});
test('stale quotes and outages retain open positions without fabricated exits', async () => {
  for (const mode of ['stale', 'all']) {
    const f = fixture(); f.seedPosition(); f.price(108);
    if (mode === 'stale') f.stale(); else f.hook(() => { throw new Error('Feed down'); });
    await f.run();
    assert.equal(f.get().account.positions.length, 1);
    assert.equal(f.get().account.bots[0].enabled, false);
    if (mode === 'all') assert.match(f.get().last_error, /unavailable/);
  }
});
test('deleting an account prevents a pending worker from recreating it', async () => {
  const f = fixture(), record = f.get(); f.remove();
  const result = await runBackgroundAccount(record, f.deps); assert.equal(result.conflict, true); assert.equal(f.get(), null);
});
