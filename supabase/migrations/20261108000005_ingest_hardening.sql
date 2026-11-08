-- Замечания финального критика ядра загрузки.

-- 1. Чтение чужого (демо) датасета — только нормализованных docs/, не сырых uploads/.
drop policy if exists datasets_bucket_read on storage.objects;
create policy datasets_bucket_read on storage.objects for select to authenticated
  using (
    bucket_id = 'datasets'
    and (storage.foldername(name))[3] = 'docs'
    and (storage.foldername(name))[2] ~ '^[0-9a-f-]{36}$'
    and public.can_read_dataset(((storage.foldername(name))[2])::uuid)
  );

-- 2. Лимит демо без гонки: параллельные вставки в один датасет идут по очереди.
create or replace function demo_doc_limit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from datasets d join profiles p on p.id = d.owner_id
             where d.id = new.dataset_id and p.role = 'demo') then
    perform pg_advisory_xact_lock(hashtext(new.dataset_id::text));
    if (select count(*) from documents where dataset_id = new.dataset_id) >= 30 then
      raise exception 'demo limit: 30 documents per dataset' using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;
