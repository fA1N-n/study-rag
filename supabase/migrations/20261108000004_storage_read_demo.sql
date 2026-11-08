-- Чтение файлов датасета: владелец папки (политика datasets_bucket_rw) или любой, кто видит датасет (демо).
-- Путь: <owner_uid>/<dataset_id>/docs/<sha>.md
create policy datasets_bucket_read on storage.objects for select to authenticated
  using (
    bucket_id = 'datasets'
    and (storage.foldername(name))[2] ~ '^[0-9a-f-]{36}$'
    and public.can_read_dataset(((storage.foldername(name))[2])::uuid)
  );
