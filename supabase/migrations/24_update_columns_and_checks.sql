-- Audit of 2026-09-29, sixth pass (the database's own advisors and grants, read live).
-- 1. Row level security says whose row it is, not which columns may change. A signed-in author could rewrite an
--    annotation's source, kind or file paths after it was listed (a different link under the same take), and anyone
--    could set their own profile's picture or name to anything. The app only ever changes an annotation's take and tag
--    and a profile's handle, so those are the only columns anyone may update. Triggers are not bound by these grants.
revoke update on public.annotations from anon, authenticated;
grant update (take_text, tag) on public.annotations to authenticated;
revoke update on public.profiles from anon, authenticated;
grant update (handle) on public.profiles to authenticated;

-- 2. Supabase's default grants include TRUNCATE, REFERENCES and TRIGGER for everyone. Nothing uses them, and TRUNCATE
--    ignores row level security, so they go.
revoke truncate, references, trigger on all tables in schema public from anon, authenticated;

-- 3. Migration 23 moved the comment pace to inserted_at, whose index covers the author too; the old one only cost writes.
drop index if exists public.comments_author_created;

-- 4. Two triggers set updated_at on every edit of an annotation; annotations_times (migration 16) is the one kept.
drop trigger if exists annotations_touch on public.annotations;

-- 5. A reaction held no Latin letters, but any other alphabet passed, so a chip could hold words. Letters of any
--    alphabet are refused now (the database's regular expressions know Unicode), except the information sign, which
--    counts as a letter and is an emoji.
create or replace function public.reactions_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.emoji ~ '[[:alpha:][:space:]<>&"'']' and new.emoji !~ '^ℹ' then raise exception 'A reaction has to be an emoji.'; end if;
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
revoke all on function public.reactions_guard() from public, anon, authenticated;

-- 6. A vote was accepted on an annotation with no poll, or for an option the poll does not have.
create or replace function public.poll_votes_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  select jsonb_array_length(a.poll -> 'options') into n from public.annotations a where a.id = new.annotation_id;
  if n is null or new.option_index < 0 or new.option_index >= n then raise exception 'That is not one of this poll''s options.'; end if;
  return new;
end $$;
revoke all on function public.poll_votes_guard() from public, anon, authenticated;
drop trigger if exists poll_votes_guard on public.poll_votes;
create trigger poll_votes_guard before insert or update on public.poll_votes for each row execute function public.poll_votes_guard();
