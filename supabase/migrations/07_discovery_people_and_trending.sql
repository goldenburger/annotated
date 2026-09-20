-- People worth following, trending sources and trending tags (all read-only, run as the caller).
create or replace function public.people_to_follow(viewer uuid default null, lim int default 4)
returns table (id uuid, handle text, display_name text, avatar_url text, annotations bigint)
language sql stable security invoker set search_path = '' as $$
  select p.id, p.handle, p.display_name, p.avatar_url, count(a.id) as annotations
  from public.profiles p
  join public.annotations a on a.author_id = p.id and a.created_at > now() - interval '30 days'
  where (viewer is null or p.id <> viewer)
    and (viewer is null or not exists (select 1 from public.follows f where f.follower_id = viewer and f.followee_id = p.id))
  group by p.id order by count(a.id) desc, max(a.created_at) desc limit least(greatest(lim, 1), 12);
$$;
create or replace function public.trending_sources(lim int default 5)
returns table (kind text, title text, source_key text, sample_id text, annotations bigint, activity bigint)
language sql stable security invoker set search_path = '' as $$
  with recent as (
    select a.id, a.kind, a.created_at,
      coalesce(a.source ->> 'videoId', a.source -> 'meta' ->> 'url', a.source ->> 'url', a.source ->> 'audioUrl', a.id) as source_key,
      coalesce(nullif(a.source ->> 'title', ''), nullif(a.source -> 'meta' ->> 'title', ''), nullif(a.source ->> 'author', '') || ' on X', 'Untitled') as title,
      (select count(*) from public.comments c where c.annotation_id = a.id) + (select count(*) from public.reactions r where r.annotation_id = a.id) as talk
    from public.annotations a where a.created_at > now() - interval '7 days')
  select min(kind), min(title), source_key, (array_agg(id order by created_at desc))[1], count(*), count(*) + sum(talk)
  from recent group by source_key order by count(*) + sum(talk) desc, max(created_at) desc limit least(greatest(lim, 1), 12);
$$;
create or replace function public.trending_tags(lim int default 5)
returns table (tag text, uses bigint)
language sql stable security invoker set search_path = '' as $$
  select tag, count(*) from public.annotations where tag is not null and created_at > now() - interval '7 days'
  group by tag order by count(*) desc limit least(greatest(lim, 1), 5);
$$;
grant execute on function public.people_to_follow(uuid, int) to anon, authenticated;
grant execute on function public.trending_sources(int) to anon, authenticated;
grant execute on function public.trending_tags(int) to anon, authenticated;
