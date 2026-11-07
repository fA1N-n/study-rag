-- Study RAG v2: датасеты, документы, правила, разметка, чанки, вопросы. Схема — docs/spec.md §4.
create extension if not exists vector;

-- роли ---------------------------------------------------------------------
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'demo' check (role in ('owner','demo'))
);

create or replace function is_demo_user() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role = 'demo' from profiles where id = auth.uid()), true)
$$;

-- датасеты -----------------------------------------------------------------
create table datasets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) default auth.uid(),
  name text not null check (length(name) between 2 and 120),
  description text check (length(description) <= 2000),
  is_demo boolean not null default false,
  status text not null default 'empty' check (status in
    ('empty','ingesting','ingested','rules','labeling','labeled','indexing','ready','failed')),
  active_ruleset_id uuid,
  stats jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
create trigger datasets_touch before update on datasets for each row execute function touch_updated_at();

-- чтение: свой или демо-датасет; запись: только свой
create or replace function can_read_dataset(ds uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from datasets where id = ds and (owner_id = auth.uid() or is_demo))
$$;
create or replace function can_write_dataset(ds uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from datasets where id = ds and owner_id = auth.uid())
$$;

-- документы ----------------------------------------------------------------
create table documents (
  id uuid primary key default gen_random_uuid(),
  dataset_id uuid not null references datasets(id) on delete cascade,
  filename text not null check (length(filename) between 1 and 400),
  storage_path text not null,
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  units int not null default 0 check (units >= 0),
  meta jsonb not null default '{}',          -- frontmatter исходного файла
  preview text not null default '',
  pii_flag boolean not null default false,
  labels jsonb not null default '{}',
  label_status text not null default 'unlabeled' check (label_status in
    ('unlabeled','agreed','refereed','review','human')),
  created_at timestamptz not null default now(),
  unique (dataset_id, sha256)
);
create index documents_labels_gin on documents using gin (labels jsonb_path_ops);
create index documents_dataset_status on documents (dataset_id, label_status);

-- лимит демо: не больше 30 документов на датасет
create or replace function demo_doc_limit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from datasets d join profiles p on p.id = d.owner_id
             where d.id = new.dataset_id and p.role = 'demo')
     and (select count(*) from documents where dataset_id = new.dataset_id) >= 30 then
    raise exception 'demo limit: 30 documents per dataset' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger documents_demo_limit before insert on documents for each row execute function demo_doc_limit();

-- правила ------------------------------------------------------------------
create table rulesets (
  id uuid primary key default gen_random_uuid(),
  dataset_id uuid not null references datasets(id) on delete cascade,
  version int not null check (version > 0),
  fields jsonb not null check (jsonb_typeof(fields) = 'array' and jsonb_array_length(fields) > 0),
  rules text not null,
  examples jsonb not null default '[]',
  critique text,
  status text not null default 'draft' check (status in ('draft','approved','archived')),
  author text not null check (author in ('agent','user')),
  created_at timestamptz not null default now(),
  unique (dataset_id, version)
);
alter table datasets add constraint datasets_active_ruleset_fk
  foreign key (active_ruleset_id) references rulesets(id) on delete set null;

-- разметка -----------------------------------------------------------------
create table label_jobs (
  id uuid primary key default gen_random_uuid(),
  dataset_id uuid not null references datasets(id) on delete cascade,
  ruleset_id uuid not null references rulesets(id),
  status text not null default 'queued' check (status in ('queued','running','done','failed','canceled')),
  total_batches int not null default 0,
  done_batches int not null default 0,
  tokens_in bigint not null default 0,
  tokens_out bigint not null default 0,
  cost_usd numeric(10,4) not null default 0,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);
-- одна активная разметка на датасет
create unique index label_jobs_one_active on label_jobs (dataset_id) where status in ('queued','running');

-- разметка только по утверждённым правилам
create or replace function job_needs_approved_rules() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from rulesets where id = new.ruleset_id and dataset_id = new.dataset_id and status = 'approved') then
    raise exception 'ruleset is not approved' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger label_jobs_rules before insert on label_jobs for each row execute function job_needs_approved_rules();

create table batches (
  id bigint generated always as identity primary key,
  job_id uuid not null references label_jobs(id) on delete cascade,
  seq int not null,
  document_ids uuid[] not null check (cardinality(document_ids) > 0),
  status text not null default 'queued' check (status in ('queued','running','done','failed')),
  attempts int not null default 0,
  locked_until timestamptz,
  error text,
  unique (job_id, seq)
);
create index batches_claim on batches (status, locked_until);

create table labels (
  id bigint generated always as identity primary key,
  document_id uuid not null references documents(id) on delete cascade,
  job_id uuid references label_jobs(id) on delete cascade,
  agent text not null check (agent in ('A','B','referee','human')),
  model text,
  values jsonb not null,
  confidence real check (confidence between 0 and 1),
  rationale text,
  tokens_in int not null default 0,
  tokens_out int not null default 0,
  created_at timestamptz not null default now()
);
create index labels_document on labels (document_id);

-- поиск --------------------------------------------------------------------
create table chunks (
  id bigint generated always as identity primary key,
  document_id uuid not null references documents(id) on delete cascade,
  dataset_id uuid not null references datasets(id) on delete cascade,
  unit_label text not null,
  unit_no int,
  part smallint not null default 0,
  header text not null,
  content text not null,
  embedding halfvec(1024),
  tsv tsvector generated always as (to_tsvector('russian', header || ' ' || content)) stored,
  unique (document_id, unit_no, part)
);
create index chunks_embedding on chunks using hnsw (embedding halfvec_cosine_ops);
create index chunks_tsv on chunks using gin (tsv);
create index chunks_dataset on chunks (dataset_id);

create table questions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) default auth.uid(),
  dataset_id uuid not null references datasets(id) on delete cascade,
  question text not null check (length(question) between 2 and 2000),
  rewritten_query text,
  filters jsonb,
  answer text,
  sources jsonb,
  refused boolean not null default false,
  feedback smallint check (feedback in (-1, 1)),
  model text,
  latency_ms int,
  created_at timestamptz not null default now()
);
create index questions_user on questions (user_id, created_at desc);

-- RLS ----------------------------------------------------------------------
alter table profiles enable row level security;
alter table datasets enable row level security;
alter table documents enable row level security;
alter table rulesets enable row level security;
alter table label_jobs enable row level security;
alter table batches enable row level security;
alter table labels enable row level security;
alter table chunks enable row level security;
alter table questions enable row level security;

create policy profiles_self on profiles for select using (id = auth.uid());

create policy datasets_read on datasets for select using (owner_id = auth.uid() or is_demo);
create policy datasets_insert on datasets for insert with check (owner_id = auth.uid() and (not is_demo or not is_demo_user()));
create policy datasets_update on datasets for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy datasets_delete on datasets for delete using (owner_id = auth.uid());

create policy documents_read on documents for select using (can_read_dataset(dataset_id));
create policy documents_write on documents for all using (can_write_dataset(dataset_id)) with check (can_write_dataset(dataset_id));
create policy rulesets_read on rulesets for select using (can_read_dataset(dataset_id));
create policy rulesets_write on rulesets for all using (can_write_dataset(dataset_id)) with check (can_write_dataset(dataset_id));
create policy jobs_read on label_jobs for select using (can_read_dataset(dataset_id));
create policy jobs_write on label_jobs for all using (can_write_dataset(dataset_id)) with check (can_write_dataset(dataset_id));
create policy chunks_read on chunks for select using (can_read_dataset(dataset_id));
create policy chunks_write on chunks for all using (can_write_dataset(dataset_id)) with check (can_write_dataset(dataset_id));
create policy batches_read on batches for select
  using (exists (select 1 from label_jobs j where j.id = job_id and can_read_dataset(j.dataset_id)));
create policy labels_read on labels for select
  using (exists (select 1 from documents d where d.id = document_id and can_read_dataset(d.dataset_id)));
create policy labels_human on labels for insert
  with check (agent = 'human' and exists (select 1 from documents d where d.id = document_id and can_write_dataset(d.dataset_id)));

create policy questions_own on questions for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and can_read_dataset(dataset_id));

-- RPC ----------------------------------------------------------------------
-- Гибридный поиск: вектор top-40 + FTS top-40 → RRF (k = 60). RLS действует (security invoker).
create or replace function match_chunks(
  p_dataset uuid, p_embedding halfvec(1024), p_query text, p_filter jsonb default '{}', p_k int default 30
) returns table (id bigint, document_id uuid, unit_label text, unit_no int, header text, content text, score float8, vec_rank int, fts_rank int)
language sql stable as $$
  with base as (
    select c.* from chunks c join documents d on d.id = c.document_id
    where c.dataset_id = p_dataset and d.labels @> coalesce(p_filter, '{}')
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

-- Соседние единицы (±1) для найденных чанков.
create or replace function neighbor_chunks(p_ids bigint[])
returns setof chunks language sql stable as $$
  select n.* from chunks c
  join chunks n on n.document_id = c.document_id and n.unit_no between c.unit_no - 1 and c.unit_no + 1
  where c.id = any(p_ids) and n.id <> all(p_ids)
  group by n.id
$$;

-- Очередь: забрать до n батчей (новые или с истёкшей арендой, попыток < 3).
create or replace function claim_batches(n int, lease interval default interval '5 minutes')
returns setof batches language sql volatile security definer set search_path = public as $$
  -- аренда истекла, а попытки кончились → батч упал
  update batches set status = 'failed', error = coalesce(error, 'lease expired')
  where status = 'running' and locked_until < now() and attempts >= 3;
  update batches b set status = 'running', attempts = b.attempts + 1, locked_until = now() + lease
  where b.id in (
    select id from batches
    where (status = 'queued' or (status = 'running' and locked_until < now())) and attempts < 3
    order by id
    for update skip locked
    limit n
  )
  returning b.*
$$;
revoke execute on function claim_batches(int, interval) from public;
