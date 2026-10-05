# Background paper bot

The bot can run after Android or the browser closes. Execution lives in a server API called by Supabase Cron; the phone only displays the shared wallet and sends authenticated edits. This is **virtual trading only** and does not send broker orders.

## One-time activation (manual deployment)

1. Run `supabase/migrations/0003_background_paper_bot.sql` in the existing Supabase project's SQL Editor. It creates server-only wallet/heartbeat tables and atomic version-checked saves. Existing local wallets and unrelated tables are untouched. User deletion cascades to the shared wallet.
2. In the production hosting project's environment settings, keep the existing `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. Add `PAPER_BOT_CRON_SECRET`, a new random secret of at least 32 characters (for example, generate one locally with `openssl rand -hex 32`). Never prefix it with `NEXT_PUBLIC_` or commit it.
3. Deploy the merged papertrade `main` manually.
4. In Supabase Vault, add `paper_bot_cron_secret` with the same secret and `paper_bot_dispatch_url` with `https://www.papertrade.site/api/paper-bot/dispatch` (use the final canonical HTTPS production host, without a redirect).
5. Run `supabase/paper-bot-scheduler.sql` in SQL Editor. It installs/updates one named job every 10 seconds. When no wallet has active bots, positions or orders, it sends only periodic heartbeat checks. No Vercel paid cron plan or Firebase migration is required. Hosting/database usage quotas still apply; no plan upgrade is performed.
6. Verify at least three actual scheduled requests return HTTP 200, then check `public.paper_bot_runtime` for progressing `last_run` and `previous_run`. Supabase's `net._http_response` shows HTTP failures; `cron.job_run_details` only proves the SQL job ran, not that the HTTP endpoint succeeded. Check the latest response status before enabling a bot.
7. Sign in, open Bot and choose **Enable background**. The existing USD wallet, bot settings, positions, orders and history move once to the shared store. If a wallet already exists there, it is authoritative and is never overwritten by another device's local copy. Start/update your bot as usual. A healthy server also enables background mode automatically when starting a bot.
8. Close the app completely. After a scheduled check, reopen it: the server check time and decisions should have advanced. Verify a paper entry/exit in the shared history, then verify **Pause entries** prevents new entries. **Pause all** leaves protection monitoring active for open positions; **Exit trade & pause** closes the selected bot trade at an observed fresh price.

## Execution and recovery

- The server owns automatic execution once enabled. Browser polling cannot place a second automatic order. Manual wallet edits and every server fill use the same compare-and-swap database version. A racing pause/edit invalidates an older run, including a run waiting on candle history.
- A short database lease prevents overlapping scheduler requests from repeatedly invalidating a slow history fetch. It expires automatically after 60 seconds if a worker crashes; manual pause/edit never waits on that lease.
- Protective exits run before candle-history fetches. Paused bots still have their existing positions and orders monitored, including the same wallet's manually placed global orders/options.
- The original completed-candle, freshness, lot, fee, leverage, daily-loss, daily-entry, cooldown and funding rules remain in force. A delayed scheduler does **not** backfill missed entries at historical prices. Stops/targets use observed fresh quotes and cannot guarantee every price touched between checks or during an outage.
- The screen reports local mode, background health, last server check and feed errors. It does not say the bot is running when the scheduler is offline. Two recent separated heartbeat ticks are required before enabling/restarting background entries. Pause and manual exits remain available during a scheduler outage if the wallet API and market feed are reachable.
- After migration, connection failure never falls back to local execution. Local data is a display cache only. An ambiguous activation timeout keeps local execution locked; **Retry background connection** repeats the idempotent transfer safely.
- This release has a 25-active-wallet dispatcher limit. Exceeding it produces an explicit unhealthy scheduler instead of silently excluding accounts. Scale/shard the dispatcher before raising capacity. Monitor function runtime and database/function quotas; do not describe free infrastructure as guaranteed continuous execution.
- Signing out does not pause server bots; use Pause all before signing out if that is intended. Deleting the account removes its server wallet and prevents subsequent worker commits.

To stop the scheduler for maintenance: `select cron.unschedule('papertrade-background-bot');`. Pause bots and deal with open paper positions first; stopping the scheduler also stops automatic protection checks. Re-run the scheduler SQL to resume. Never delete the shared wallet to switch back to local mode while another worker/device can still operate it.

## Verification

`npm run test:bot`

The background tests run without `window`, `document` or local storage, including protected entry/exit, duplicate concurrent ticks, a racing pause and unavailable/stale data. Browser coverage verifies shared-wallet controls/reconnect and that automatic browser execution is disabled after migration.

Supabase documentation: https://supabase.com/docs/guides/cron/quickstart and https://supabase.com/docs/guides/functions/schedule-functions

For the actual PostgreSQL permissions/CAS/lease test, install `@electric-sql/pglite` outside the repository and run `PGLITE_MODULE_PATH=/absolute/path/to/node_modules/@electric-sql/pglite node --experimental-strip-types --test tests/paper-bot-database.test.mjs`. No production database is used.

Run the closed-app browser test with externally installed Playwright and Chromium: `PLAYWRIGHT_MODULE_PATH=/absolute/path/to/node_modules/playwright CHROMIUM_PACKAGE=/absolute/path/to/node_modules/@sparticuz/chromium/build/index.js node --experimental-strip-types tests/browser/background-bot.cjs`.
