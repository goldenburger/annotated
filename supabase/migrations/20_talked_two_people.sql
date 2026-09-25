-- Most talked about lists a source only once two or more different people have annotated it. One account could
-- otherwise put any link, phishing included, onto every user's empty panel and Home (security audit of 2026-09-24).
create or replace function public.talked_about(lim integer default 4)
 returns table(kind text, title text, url text, video_id text, snippet text, annotations bigint, people bigint, replies bigint, reactions bigint, score double precision)
 language sql
 stable
 set search_path to ''
as $function$
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
  having count(distinct author_id) >= 2
  order by 10 desc, max(created_at) desc
  limit least(greatest(lim, 1), 8);
$function$;
