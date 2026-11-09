-- Этап 6: индексация. Документ без indexed_at ещё не разбит на чанки (или метки поменялись после индексации).
alter table documents add column if not exists indexed_at timestamptz;
create index if not exists documents_unindexed on documents (dataset_id) where indexed_at is null;
alter table documents add column if not exists index_lease timestamptz;

-- Забрать до n непроиндексированных документов датасета (аренда 5 минут; параллельные тики не пересекаются).
create or replace function claim_index(p_dataset uuid, n int)
returns setof documents language sql volatile security definer set search_path = public as $$
  update documents set index_lease = now() + interval '5 minutes'
  where id in (
    select id from documents
    where dataset_id = p_dataset and indexed_at is null and (index_lease is null or index_lease < now())
    order by id
    for update skip locked
    limit n
  )
  returning *
$$;
revoke execute on function claim_index(uuid, int) from public, anon, authenticated;
