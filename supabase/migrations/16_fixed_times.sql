-- From the third audit pass on 2026-09-22. An author may edit every column of their own annotation, and that
-- included when it was made. Dated in the future, an annotation stayed first under Newest for good and topped
-- "Most talked about" for good, because the freshness weight in talked_about grows without limit for a date
-- that has not come yet. The time an annotation was made now belongs to the database: set on insert, kept on
-- every edit, and updated_at records the edit instead.
-- A comment carried over from an annotation first saved on this computer keeps the time it was really
-- written, which is in the past, so comments may be dated earlier but never later than now.
create or replace function public.annotations_times() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := now();
  else
    new.created_at := old.created_at;
    new.updated_at := now();
  end if;
  return new;
end $$;
drop trigger if exists annotations_times on public.annotations;
create trigger annotations_times before insert or update on public.annotations
  for each row execute function public.annotations_times();

create or replace function public.comments_times() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.created_at := least(coalesce(new.created_at, now()), now());
  return new;
end $$;
drop trigger if exists comments_times on public.comments;
create trigger comments_times before insert on public.comments
  for each row execute function public.comments_times();
revoke all on function public.annotations_times() from public, anon, authenticated;
revoke all on function public.comments_times() from public, anon, authenticated;
