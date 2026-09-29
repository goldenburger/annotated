-- Security audit of 2026-09-29.
-- 1. A comment's time may be carried over from the past (a comment first written on this computer), but only a finite
--    time within the last 30 days. '-infinity' passed least(...) and made the annotation's comments throw for every
--    reader, and a comment dated 1970 never counted toward twenty a minute (comments_pace), so the limit could be
--    walked around with backdated rows.
create or replace function public.comments_times() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.created_at is null or not isfinite(new.created_at) then
    new.created_at := now();
  end if;
  new.created_at := greatest(least(new.created_at, now()), now() - interval '30 days');
  return new;
end $$;
revoke execute on function public.comments_times() from public, anon, authenticated;

-- 2. Most talked about takes its title, address and snippet from the first annotation of a source, not the newest,
--    so a third account cannot retitle a row two real people made (it could not change the address, only the words).
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
    (array_agg(coalesce(nullif(source ->> 'title', ''), nullif(source -> 'meta' ->> 'title', ''), nullif(source ->> 'author', '') || ' on X') order by created_at asc))[1],
    (array_agg(coalesce(source -> 'meta' ->> 'url', source ->> 'url') order by created_at asc))[1],
    (array_agg(source ->> 'videoId' order by created_at asc))[1],
    (array_agg(left(coalesce(nullif(source ->> 'text', ''), source -> 'meta' ->> 'description', ''), 140) order by created_at asc))[1],
    count(*), count(distinct author_id), sum(replies)::bigint, sum(reacts)::bigint,
    sum((1 + 1.5 * replies + 0.5 * reacts) * fresh) * sqrt(count(distinct author_id))
  from a
  group by key
  having count(distinct author_id) >= 2
  order by 10 desc, max(created_at) desc
  limit least(greatest(lim, 1), 8);
$function$;
