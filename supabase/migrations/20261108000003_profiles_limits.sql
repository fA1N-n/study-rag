-- Профиль создаётся вместе с пользователем Auth (роль demo; owner ставится вручную).
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id) values (new.id) on conflict do nothing;
  return new;
end $$;

-- лимит демо: не больше 30 вопросов в сутки
create or replace function demo_question_limit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from profiles where id = new.user_id and role = 'demo')
     and (select count(*) from questions where user_id = new.user_id and created_at > now() - interval '1 day') >= 30 then
    raise exception 'demo limit: 30 questions per day' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger questions_demo_limit before insert on questions for each row execute function demo_question_limit();

create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();
