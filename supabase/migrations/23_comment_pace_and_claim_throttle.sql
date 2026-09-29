-- Security audit of 2026-09-29, second pass.
-- 1. The comment pace counted comments by created_at, which a comment may carry from the past (carrying over a local
--    annotation's comments needs that). A comment dated two minutes back was never counted, so the twenty a minute
--    could be walked around. Comments now also carry inserted_at, always the database's own time, and the pace
--    counts that.
alter table public.comments add column if not exists inserted_at timestamptz not null default now();
-- Existing comments keep their own times, so nobody with many past comments is held back in the first minute.
update public.comments set inserted_at = created_at where inserted_at > created_at;
create index if not exists comments_author_inserted on public.comments (author_id, inserted_at);

create or replace function public.comments_times() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.created_at is null or not isfinite(new.created_at) then
    new.created_at := now();
  end if;
  new.created_at := greatest(least(new.created_at, now()), now() - interval '30 days');
  new.inserted_at := now();
  return new;
end $$;
revoke execute on function public.comments_times() from public, anon, authenticated;

create or replace function public.comments_pace() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.comments c where c.author_id = new.author_id and c.inserted_at > now() - interval '1 minute') >= 20 then
    raise exception 'That is a lot of comments in a minute. Try again shortly.';
  end if;
  return new;
end $$;
revoke all on function public.comments_pace() from public, anon, authenticated;

-- 2. Ten claims on one annotation in an hour turned any further claim away, so the author of an annotation could file
--    ten junk claims on it and keep real ones out. Past that number a claim is now kept and marked throttled for the
--    reviewer, rather than refused. The site-wide limit still refuses, since it is what stops the table filling up.
alter table public.claims add column if not exists throttled boolean not null default false;
create or replace function public.claims_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.created_at := now();
  if (select count(*) from public.claims c where c.annotation_id = new.annotation_id and c.created_at > now() - interval '1 hour') >= 10 then
    new.throttled := true;
  end if;
  if (select count(*) from public.claims c where c.created_at > now() - interval '1 minute') >= 30 then
    raise exception 'A lot of claims are coming in right now. Try again in a minute.';
  end if;
  return new;
end $$;
revoke all on function public.claims_guard() from public, anon, authenticated;
