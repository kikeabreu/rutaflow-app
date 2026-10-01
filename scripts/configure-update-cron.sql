-- Run in Ruleto's Supabase SQL editor after the production deploy.
-- First store the exact Vercel CRON_SECRET value in Supabase Vault as
-- ruleto_cron_secret (vault.create_secret). Do not paste the key in this file.
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;
select cron.schedule(
  'ruleto-update-worker',
  '* * * * *',
  $$
  select net.http_get(
    url := 'https://app.ruleto.mx/api/updates/worker',
    headers := jsonb_build_object(
      'Authorization',
      'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name='ruleto_cron_secret')
    )
  );
  $$
);
