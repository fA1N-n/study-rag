-- Только для Supabase: тик воркера нужен и пока идёт индексация датасета.
select cron.schedule('worker-tick', '* * * * *', $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'worker_url'),
    headers := jsonb_build_object(
      'authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'worker_secret'),
      'content-type', 'application/json'),
    body := '{}'::jsonb)
  where exists (select 1 from public.batches where status in ('queued', 'running'))
     or exists (select 1 from public.datasets where status = 'indexing')
$$);
