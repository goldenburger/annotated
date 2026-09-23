-- What is most talked about on annotated, for the suggestions on an empty panel. There is no count of views for
-- a page on the open web that this could read, so "talked about" means talked about here, which is the
-- conversation the product actually has.
--
-- Each annotation of a source counts once, each reply to it counts one and a half, because a reply means
-- people are arguing about it, and each reaction counts a half. Newer activity counts for more: the weight
-- halves about every two days (a three day time constant), so last week's argument gives way to this week's.
-- The total is then multiplied by the square root of how many different people annotated it, so one person
-- posting ten times cannot outrank five people posting once each. Only the last fourteen days are looked at.
create or replace function public.talked_about(lim int default 4)
returns table (kind text, title text, url text, video_id text, snippet text,
               annotations bigint, people bigint, replies bigint, reactions bigint, score double precision)
language sql stable security invoker set search_path = '' as $$
  with a as (
    select a.kind, a.author_id, a.created_at, a.source,
      coalesce(a.source ->> 'videoId', a.source -> 'meta' ->> 'url', a.source ->> 'url', a.source ->> 'audioUrl', a.id) as key,
      (select count(*) from public.comments c where c.annotation_id = a.id) as replies,
      (select count(*) from public.reactions r where r.annotation_id = a.id) as reacts,
      exp(-extract(epoch from (now() - a.created_at)) / (3 * 86400.0)) as fresh
    from public.annotations a
    where a.created_at > now() - interval '14 days')
  select min(kind),
    (array_agg(coalesce(nullif(source ->> 'title', ''), nullif(source -> 'meta' ->> 'title', ''), nullif(source ->> 'author', '') || ' on X') order by created_at desc))[1],
    (array_agg(coalesce(source -> 'meta' ->> 'url', source ->> 'url') order by created_at desc))[1],
    (array_agg(source ->> 'videoId' order by created_at desc))[1],
    (array_agg(left(coalesce(nullif(source ->> 'text', ''), source -> 'meta' ->> 'description', ''), 140) order by created_at desc))[1],
    count(*), count(distinct author_id), sum(replies)::bigint, sum(reacts)::bigint,
    sum((1 + 1.5 * replies + 0.5 * reacts) * fresh) * sqrt(count(distinct author_id))
  from a
  group by key
  order by 10 desc, max(created_at) desc
  limit least(greatest(lim, 1), 8);
$$;
grant execute on function public.talked_about(int) to anon, authenticated;
