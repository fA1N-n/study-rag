-- Этап 5: воркер разметки. Завершение батча и счётчики задания — одной транзакцией (тики идут параллельно).

-- Итог батча: ok → done; ошибка → снова в очередь, после 3-й попытки → failed.
-- Задание закрывается, когда не осталось батчей queued/running: done, если хоть один батч прошёл, иначе failed.
create or replace function finish_batch(p_batch bigint, p_ok boolean, p_error text default null, p_in bigint default 0, p_out bigint default 0)
returns text language plpgsql volatile security definer set search_path = public as $$
declare
  b batches;
  j label_jobs;
  left_n int;
begin
  select * into b from batches where id = p_batch for update;
  if not found then return 'missing'; end if;
  select * into j from label_jobs where id = b.job_id for update;

  update batches set
    status = case when p_ok then 'done' when b.attempts >= 3 then 'failed' else 'queued' end,
    error = case when p_ok then null else left(p_error, 500) end,
    locked_until = null
  where id = p_batch;

  if j.status in ('canceled', 'done', 'failed') then return j.status; end if;

  update label_jobs set
    done_batches = done_batches + (case when p_ok then 1 else 0 end),
    tokens_in = tokens_in + p_in,
    tokens_out = tokens_out + p_out
  where id = j.id;

  select count(*) into left_n from batches where job_id = j.id and status in ('queued', 'running');
  if left_n = 0 then
    update label_jobs set
      status = case when done_batches > 0 then 'done' else 'failed' end,
      finished_at = now()
    where id = j.id;
    return 'finished';
  end if;
  return 'ok';
end $$;
revoke execute on function finish_batch(bigint, boolean, text, bigint, bigint) from public, anon, authenticated;

-- Остановка — обычный update label_jobs (RLS владельца): батчи отменённого задания снимает claim_batches,
-- а finish_batch не пишет итог в отменённое задание.

-- claim_batches: не брать батчи отменённых и завершённых заданий; задание при первом батче → running.
create or replace function claim_batches(n int, lease interval default interval '5 minutes')
returns setof batches language sql volatile security definer set search_path = public as $$
  update batches set status = 'failed', error = coalesce(error, 'lease expired')
  where status = 'running' and locked_until < now() and attempts >= 3;
  update batches set status = 'failed', error = 'canceled'
  where status in ('queued', 'running') and job_id in (select id from label_jobs where status = 'canceled');
  -- батчи кончились по аренде (без finish_batch) → закрыть задание
  update label_jobs j set status = case when j.done_batches > 0 then 'done' else 'failed' end, finished_at = now()
  where j.status = 'running' and not exists (select 1 from batches b where b.job_id = j.id and b.status in ('queued', 'running'));
  update label_jobs set status = 'running', started_at = coalesce(started_at, now())
  where status = 'queued' and id in (select job_id from batches where status = 'queued');
  update batches b set status = 'running', attempts = b.attempts + 1, locked_until = now() + lease
  where b.id in (
    select id from batches
    where (status = 'queued' or (status = 'running' and locked_until < now())) and attempts < 3
      and job_id in (select id from label_jobs where status = 'running')
    order by id
    for update skip locked
    limit n
  )
  returning b.*
$$;
revoke execute on function claim_batches(int, interval) from public, anon, authenticated;
