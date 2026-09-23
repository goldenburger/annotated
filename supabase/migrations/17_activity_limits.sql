-- From the third audit pass on 2026-09-22. Reactions were limited to one per person per emoji, and the emoji
-- column takes any one to sixteen characters, so one account could add thousands of made-up "emoji" to an
-- annotation, inflating what trending and "Most talked about" count and filling the page with chips. Comments
-- and annotations had no limit on how fast they could be written. These limits sit well above anything a
-- person does by hand:
--   eight reactions from one person on one annotation or one comment, and a reaction holds no letters or markup
--   twenty comments a minute from one person
--   thirty annotations an hour from one person
create or replace function public.reactions_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  -- Keycap emoji such as 1️⃣ hold a real digit, so only letters and markup are refused.
  if new.emoji ~ '[A-Za-z<>&"'' ]' then raise exception 'A reaction has to be an emoji.'; end if;
  if tg_table_name = 'reactions' then
    if (select count(*) from public.reactions r where r.annotation_id = new.annotation_id and r.user_id = new.user_id) >= 8 then
      raise exception 'That is as many reactions as one person can leave here.';
    end if;
  else
    if (select count(*) from public.comment_reactions r where r.comment_id = new.comment_id and r.user_id = new.user_id) >= 8 then
      raise exception 'That is as many reactions as one person can leave here.';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists reactions_guard on public.reactions;
create trigger reactions_guard before insert on public.reactions for each row execute function public.reactions_guard();
drop trigger if exists reactions_guard on public.comment_reactions;
create trigger reactions_guard before insert on public.comment_reactions for each row execute function public.reactions_guard();

create or replace function public.comments_pace() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.comments c where c.author_id = new.author_id and c.created_at > now() - interval '1 minute') >= 20 then
    raise exception 'That is a lot of comments in a minute. Try again shortly.';
  end if;
  return new;
end $$;
drop trigger if exists comments_pace on public.comments;
create trigger comments_pace before insert on public.comments for each row execute function public.comments_pace();

create or replace function public.annotations_pace() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.annotations a where a.author_id = new.author_id and a.created_at > now() - interval '1 hour') >= 30 then
    raise exception 'That is a lot of annotations in an hour. Try again later.';
  end if;
  return new;
end $$;
drop trigger if exists annotations_pace on public.annotations;
create trigger annotations_pace before insert on public.annotations for each row execute function public.annotations_pace();
revoke all on function public.reactions_guard() from public, anon, authenticated;
revoke all on function public.comments_pace() from public, anon, authenticated;
revoke all on function public.annotations_pace() from public, anon, authenticated;
