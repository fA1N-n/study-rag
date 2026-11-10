-- Поиск без RLS на каждую строку: под authenticated политика chunks_read вызывала can_read_dataset() для каждого
-- из 11 тыс. чанков, и запрос упирался в statement timeout. Теперь функции security definer с одной проверкой
-- доступа к датасету; строки берутся только из p_dataset.

create or replace function match_chunks(
  p_dataset uuid, p_embedding halfvec(1024), p_query text, p_filter jsonb default '{}', p_k int default 30
) returns table (id bigint, document_id uuid, unit_label text, unit_no int, header text, content text, score float8, vec_rank int, fts_rank int)
language sql stable security definer set search_path = public as $$
  with base as materialized (
    select c.* from chunks c join documents d on d.id = c.document_id
    where can_read_dataset(p_dataset) and c.dataset_id = p_dataset and d.labels @> coalesce(p_filter, '{}')
  ),
  v as (
    select b.id, row_number() over (order by b.embedding <=> p_embedding)::int as r
    from base b where p_embedding is not null and b.embedding is not null
    order by b.embedding <=> p_embedding limit 40
  ),
  f as (
    select b.id, row_number() over (order by ts_rank_cd(b.tsv, q) desc)::int as r
    from base b, websearch_to_tsquery('russian', coalesce(p_query, '')) q
    where b.tsv @@ q
    order by ts_rank_cd(b.tsv, q) desc limit 40
  )
  select b.id, b.document_id, b.unit_label, b.unit_no, b.header, b.content,
         coalesce(1.0 / (60 + v.r), 0) + coalesce(1.0 / (60 + f.r), 0) as score, v.r, f.r
  from base b
  left join v on v.id = b.id
  left join f on f.id = b.id
  where v.id is not null or f.id is not null
  order by score desc, b.id
  limit p_k
$$;

-- Соседи ±1: теперь с датасетом, чтобы проверить доступ один раз и не отдать чужие чанки по id.
drop function if exists neighbor_chunks(bigint[]);
create or replace function neighbor_chunks(p_dataset uuid, p_ids bigint[])
returns setof chunks language sql stable security definer set search_path = public as $$
  select n.* from chunks c
  join chunks n on n.document_id = c.document_id and n.unit_no between c.unit_no - 1 and c.unit_no + 1
  where can_read_dataset(p_dataset) and c.dataset_id = p_dataset and c.id = any(p_ids) and n.id <> all(p_ids)
  group by n.id
$$;

revoke execute on function match_chunks(uuid, halfvec, text, jsonb, int) from public, anon;
revoke execute on function neighbor_chunks(uuid, bigint[]) from public, anon;
grant execute on function match_chunks(uuid, halfvec, text, jsonb, int) to authenticated;
grant execute on function neighbor_chunks(uuid, bigint[]) to authenticated;
