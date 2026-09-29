-- Ninth audit pass of 2026-09-29.
-- 1. A trending row's title and kind come from the source's first annotation, not the alphabetically first title, so
--    one account posting on an already trending source cannot retitle the row everyone sees (the same as migration 21
--    did for Most talked about), and an empty videoId is no key (as migration 22 did there).
create or replace function public.trending_sources(lim integer default 5)
returns table(kind text, title text, source_key text, sample_id text, annotations bigint, activity bigint)
language sql stable set search_path to '' as $$
  with recent as (
    select a.id, a.kind, a.created_at,
      coalesce(nullif(a.source ->> 'videoId', ''), a.source -> 'meta' ->> 'url', a.source ->> 'url', a.source ->> 'audioUrl', a.id) as source_key,
      coalesce(nullif(a.source ->> 'title', ''), nullif(a.source -> 'meta' ->> 'title', ''), nullif(a.source ->> 'author', '') || ' on X', 'Untitled') as title,
      (select count(*) from public.comments c where c.annotation_id = a.id) + (select count(*) from public.reactions r where r.annotation_id = a.id) as talk
    from public.annotations a
    where a.created_at > now() - interval '7 days'
  )
  select (array_agg(kind order by created_at asc))[1], (array_agg(title order by created_at asc))[1], source_key,
    (array_agg(id order by created_at desc))[1], count(*), count(*) + sum(talk)
  from recent
  group by source_key
  order by count(*) + sum(talk) desc, max(created_at) desc
  limit least(greatest(lim, 1), 12);
$$;

-- 2. Every profile has a handle (the check passed a null, and You then asked a signed-in person to sign in), and a few
--    names are kept for annotated itself: "annotated" is also the segment in a link with no handle, so whoever took it
--    would look official. New accounts step past a kept name as they step past a taken one.
create or replace function public.handle_reserved(h text) returns boolean
language sql immutable set search_path to '' as $$
  select h in ('annotated', 'admin', 'administrator', 'support', 'help', 'about', 'feed', 'install', 'terms', 'privacy',
    'api', 'www', 'root', 'staff', 'official', 'moderator', 'mod', 'system', 'team', 'security', 'settings');
$$;
alter table public.profiles alter column handle set not null;
alter table public.profiles drop constraint if exists profiles_handle_reserved;
alter table public.profiles add constraint profiles_handle_reserved check (not public.handle_reserved(handle));

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path to '' as $$
declare
  base text;
  candidate text;
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
  insert into public.profiles (id, handle, display_name, avatar_url)
  values (
    new.id,
    candidate,
    left(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', 'Reader'), 80),
    coalesce(new.raw_user_meta_data ->> 'avatar_url', new.raw_user_meta_data ->> 'picture')
  );
  return new;
end $$;
