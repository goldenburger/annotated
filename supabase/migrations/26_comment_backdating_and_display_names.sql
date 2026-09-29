-- Eleventh audit pass, 2026-09-29.
-- 1. A comment may carry a time from the past so that carrying over a local annotation keeps its replies in order, but
--    anyone could date a reply on someone else's annotation back a month and have it read as the first answer, above
--    the real ones. Only the annotation's own author, the one who carries replies over, may date a comment in the past
--    now; everyone else's comment is dated now.
create or replace function public.comments_times() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.created_at is null or not isfinite(new.created_at) then
    new.created_at := now();
  end if;
  new.created_at := greatest(least(new.created_at, now()), now() - interval '30 days');
  if new.created_at < now() - interval '1 minute'
     and not exists (select 1 from public.annotations a where a.id = new.annotation_id and a.author_id = new.author_id) then
    new.created_at := now();
  end if;
  new.inserted_at := now();
  return new;
end $$;
revoke all on function public.comments_times() from public, anon, authenticated;

-- 2. A handle can no longer be "annotated" or "admin", but the name shown beside it came straight from Google or X, so
--    an account named "annotated" still read as annotated itself on everything it published. A new account whose name
--    is one of the reserved words is called Reader instead (display names cannot be changed through the API).
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path to '' as $$
declare
  base text;
  candidate text;
  shown text;
  n int := 0;
begin
  base := lower(regexp_replace(coalesce(
    new.raw_user_meta_data ->> 'user_name',
    new.raw_user_meta_data ->> 'preferred_username',
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'name',
    'reader'), '[^a-zA-Z0-9_]', '', 'g'));
  if char_length(base) < 2 then base := 'reader'; end if;
  base := left(base, 24);
  candidate := base;
  while exists (select 1 from public.profiles where handle = candidate) or public.handle_reserved(candidate) loop
    n := n + 1;
    candidate := base || n::text;
  end loop;
  shown := left(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', 'Reader'), 80);
  if public.handle_reserved(lower(regexp_replace(shown, '[^a-zA-Z0-9_]', '', 'g'))) then shown := 'Reader'; end if;
  insert into public.profiles (id, handle, display_name, avatar_url)
  values (new.id, candidate, shown, coalesce(new.raw_user_meta_data ->> 'avatar_url', new.raw_user_meta_data ->> 'picture'));
  return new;
end $$;
