import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { readGlobalAccount } from '../lib/global-order-engine.ts';
import { defaultBot } from '../lib/paper-bot-state.ts';

// Real handlers/authentication and engine validation; only external Supabase is isolated.
const state = { records: new Map(), queries: [], health: null, db: null };
globalThis.__botApiTest = state;
const clone = x => structuredClone(x);
state.db = {
  auth: { getUser: async token => token === 'alice' || token === 'bob' ? { data: { user: { id: token } } } : { data: {}, error: true } },
  from(table) {
    let owner;
    const query = {
      select() { return query; }, eq(key, value) { if (key === 'user_id') owner = value; return query; },
      async maybeSingle() { state.queries.push([table, owner]); return { data: clone(table === 'paper_bot_runtime' ? state.health : state.records.get(owner) ?? null) }; },
      async insert(row) { if (state.records.has(row.user_id)) return { error: { code: '23505' } }; state.records.set(row.user_id, { ...clone(row), version: 1, last_checked_at: 0, last_error: '' }); return {}; },
    }; return query;
  },
  async rpc(name, p) {
    assert.equal(name, 'paper_bot_compare_and_set');
    const row = state.records.get(p.p_user_id);
    if (!row || row.version !== p.p_version) return { data: [] };
    const saved = { ...row, account: clone(p.p_account), active: p.p_active, version: row.version + 1 };
    state.records.set(p.p_user_id, saved); return { data: [clone(saved)] };
  },
};
const output = await build({ entryPoints: ['app/api/paper-bot/route.ts'], bundle: true, write: false, platform: 'node', format: 'esm', plugins: [{ name: 'external-db', setup(b) {
  b.onResolve({ filter: /^(server-only|@supabase\/supabase-js)$/ }, args => ({ path: args.path, namespace: 'isolated' }));
  b.onLoad({ filter: /.*/, namespace: 'isolated' }, args => ({ contents: args.path === 'server-only' ? '' : 'export const createClient = () => globalThis.__botApiTest.db;', loader: 'js' }));
} }] });
const api = await import(`data:text/javascript;base64,${Buffer.from(output.outputFiles[0].text).toString('base64')}`);
function reset() {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.invalid'; process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-only'; process.env.PAPER_BOT_CRON_SECRET = 's'.repeat(32);
  state.records.clear(); state.queries = []; state.health = { last_run: Date.now() - 1000, previous_run: Date.now() - 11000, ok: true };
}
const read = (token = 'alice') => api.GET(new Request('https://test.invalid/api/paper-bot', { headers: { authorization: `Bearer ${token}` } }));
const write = (body, token = 'alice') => api.POST(new Request('https://test.invalid/api/paper-bot', { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: JSON.stringify(body) }));
const wallet = () => readGlobalAccount(null);

test('authentication and owner scoping prevent reading or overwriting another account', async () => {
  reset(); assert.equal((await read('wrong')).status, 401); assert.equal(state.queries.length, 0);
  assert.equal((await write({ action: 'enable', account: wallet() }, 'wrong')).status, 401);
  assert.equal((await write({ action: 'enable', user_id: 'bob', account: wallet() })).status, 200);
  assert.ok(state.records.has('alice')); assert.equal(state.records.has('bob'), false);
  assert.equal((await (await read('bob')).json()).record, null);
  assert.equal((await write({ action: 'save', user_id: 'alice', version: 1, account: wallet() }, 'bob')).status, 409);
});
test('enabling is idempotent and requires two healthy scheduler ticks', async () => {
  reset(); state.health.previous_run = 0;
  assert.equal((await write({ action: 'enable', account: wallet() })).status, 503); assert.equal(state.records.size, 0);
  state.health.previous_run = state.health.last_run - 10000;
  const account = wallet(); account.wallet = 1234;
  assert.equal((await write({ action: 'enable', account })).status, 200);
  assert.equal((await write({ action: 'enable', account: wallet() })).status, 200);
  assert.equal(state.records.get('alice').account.wallet, 1234);
});
test('missing payload never resets a wallet and stale versions cannot overwrite it', async () => {
  reset(); await write({ action: 'enable', account: wallet() });
  assert.equal((await write({ action: 'save', version: 1 })).status, 400);
  assert.equal((await write({ action: 'save', version: 0, account: wallet() })).status, 409);
  assert.equal(state.records.get('alice').version, 1);
  assert.equal((await write({ action: 'save', version: 1, account: wallet() })).status, 200);
  assert.equal(state.records.get('alice').version, 2);
});
test('scheduler outage blocks starts while permitting pause and manual wallet edits', async () => {
  reset(); await write({ action: 'enable', account: wallet() });
  const account = wallet(); account.bots = [{ ...defaultBot('BTCUSD'), enabled: true, startedAt: Date.now() }];
  assert.equal((await write({ action: 'save', version: 1, account })).status, 200);
  state.health.ok = false;
  account.bots[0].enabled = false;
  assert.equal((await write({ action: 'save', version: 2, account })).status, 200);
  account.bots[0].enabled = true;
  assert.equal((await write({ action: 'save', version: 3, account })).status, 503);
  assert.equal(state.records.get('alice').account.bots[0].enabled, false);
  account.bots[0].enabled = false; account.wallet += 1;
  assert.equal((await write({ action: 'save', version: 3, account })).status, 200);
});
