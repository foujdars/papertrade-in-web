import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
const path = process.env.PGLITE_MODULE_PATH;
test('actual Postgres migration enforces service-only access, atomic saves, monotonic heartbeats and delete cascade', { skip: !path }, async () => {
  const { PGlite } = createRequire(import.meta.url)(path);
  const db = new PGlite();
  try {
    await db.exec('create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create table auth.users (id uuid primary key);');
    const sql = await readFile(new URL('../supabase/migrations/0003_background_paper_bot.sql', import.meta.url), 'utf8');
    await db.exec(sql); await db.exec(sql); // Reapplying the migration preserves existing rows/functions.
    const owner = '11111111-1111-4111-8111-111111111111';
    await db.query('insert into auth.users(id) values ($1)', [owner]);
    await db.exec('set role service_role');
    await db.query('insert into public.paper_bot_accounts(user_id,account) values ($1,$2)', [owner, { wallet: 10000 }]);
    const first = await db.query('select * from public.paper_bot_compare_and_set($1,1,$2,true,1000,\'\')', [owner, { wallet: 9999 }]);
    assert.equal(first.rows[0].version, 2);
    const race = await db.query('select * from public.paper_bot_compare_and_set($1,1,$2,true,1001,\'\')', [owner, { wallet: 8888 }]);
    assert.equal(race.rows.length, 0);
    assert.equal((await db.query('select account from public.paper_bot_accounts')).rows[0].account.wallet, 9999);
    const token = '22222222-2222-4222-8222-222222222222', other = '33333333-3333-4333-8333-333333333333';
    assert.equal((await db.query('select * from public.paper_bot_claim($1,1000,$2)', [owner, token])).rows.length, 1);
    assert.equal((await db.query('select * from public.paper_bot_claim($1,1001,$2)', [owner, other])).rows.length, 0);
    await db.query('select public.paper_bot_release($1,$2)', [owner, other]);
    assert.equal((await db.query('select * from public.paper_bot_claim($1,1002,$2)', [owner, other])).rows.length, 0, 'A stale worker cannot release another worker lease');
    assert.equal((await db.query('select * from public.paper_bot_compare_and_set($1,2,$2,false,1003,\'\')', [owner, { wallet: 9999 }])).rows.length, 1, 'Pause can commit during an active lease');
    await db.query('select public.paper_bot_release($1,$2)', [owner, token]);
    assert.equal((await db.query('select * from public.paper_bot_claim($1,62000,$2)', [owner, other])).rows.length, 0, 'An inactive wallet cannot be claimed');
    await db.query('select public.paper_bot_heartbeat(20000,true,0)');
    await db.query('select public.paper_bot_heartbeat(30000,true,0)');
    await db.query('select public.paper_bot_heartbeat(25000,false,1)');
    const health = (await db.query('select * from public.paper_bot_runtime')).rows[0];
    assert.equal(health.last_run, 30000); assert.equal(health.previous_run, 20000); assert.equal(health.ok, true);
    await db.exec('reset role; set role authenticated');
    await assert.rejects(db.query('select * from public.paper_bot_accounts'), /permission denied/);
    await assert.rejects(db.query('select public.paper_bot_heartbeat(40000,true,0)'), /permission denied/);
    await assert.rejects(db.query('select * from public.paper_bot_compare_and_set($1,2,$2,true,1002,\'\')', [owner, {}]), /permission denied/);
    await db.exec('reset role; set role anon');
    await assert.rejects(db.query('select * from public.paper_bot_accounts'), /permission denied/);
    await db.exec('reset role'); await db.query('delete from auth.users where id=$1', [owner]);
    assert.equal((await db.query('select * from public.paper_bot_accounts')).rows.length, 0);
  } finally { await db.close(); }
});
