-- Только для Supabase (в PGlite-тестах не применяется): бакет загрузок и расписание воркера.

-- Приватный бакет; путь объекта начинается с id владельца: <uid>/<dataset_id>/<файл>
insert into storage.buckets (id, name, public, file_size_limit)
values ('datasets', 'datasets', false, 104857600)
on conflict (id) do nothing;

create policy datasets_bucket_rw on storage.objects for all to authenticated
  using (bucket_id = 'datasets' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'datasets' and (storage.foldername(name))[1] = auth.uid()::text);

-- pg_cron раз в минуту дёргает /api/worker/tick. URL и секрет лежат в Vault:
--   select vault.create_secret('https://<прод>/api/worker/tick', 'worker_url');
--   select vault.create_secret('<WORKER_SECRET>', 'worker_secret');
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule('worker-tick', '* * * * *', $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'worker_url'),
    headers := jsonb_build_object(
      'authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'worker_secret'),
      'content-type', 'application/json'),
    body := '{}'::jsonb)
  where exists (select 1 from public.batches where status in ('queued', 'running'))
$$);
