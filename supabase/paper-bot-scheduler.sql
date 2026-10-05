-- Run AFTER migration 0003, deployment and the two Vault entries in docs/BACKGROUND-BOT.md.
-- No secrets belong in this file or in Git. Re-running updates the named job.
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;
select cron.schedule('papertrade-background-bot', '10 seconds', $job$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'paper_bot_dispatch_url'),
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization',
      'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'paper_bot_cron_secret')),
    body := '{}'::jsonb, timeout_milliseconds := 55000
  )
  where exists (select 1 from vault.decrypted_secrets where name = 'paper_bot_cron_secret' and length(decrypted_secret) >= 32)
    and exists (select 1 from vault.decrypted_secrets where name = 'paper_bot_dispatch_url' and decrypted_secret like 'https://%/api/paper-bot/dispatch')
    and (exists (select 1 from public.paper_bot_accounts where active)
      or not exists (select 1 from public.paper_bot_runtime where last_run > extract(epoch from now()) * 1000 - 20000));
$job$);
